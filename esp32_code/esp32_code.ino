#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <DHT.h>
#include <WebServer.h>
#include <WiFi.h>
#include <Wire.h>

// --- Wi-Fi Bilgileri ---
const char *ssid = "Xiaomi15";
const char *password = "........";

// --- Ekran Ayarları ---
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// --- Pin Tanımlamaları ---
#define DHTPIN 4
#define DHTTYPE DHT22
#define LDR_PIN 34
#define SOIL_PIN 35
#define RAIN_PIN 32
#define LIGHT_RELAY 18
#define PUMP_RELAY 19
#define FAN_PIN 23

bool lightState = false, pumpState = false, fanState = false;
#define RELAY_ON LOW
#define RELAY_OFF HIGH

DHT dht(DHTPIN, DHTTYPE);
WebServer server(80);

void updateOLED(float t, float h, int ldr, int soil, int rain) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  display.setCursor(0, 0);
  display.println("     SERA DURUM     ");
  display.println("--------------------");

  if (isnan(t)) {
    display.println("Sicaklik: HATA");
  } else {
    display.print("Sicaklik: ");
    display.print(t, 1);
    display.println(" C");
  }

  display.print("Nem     : %");
  display.println(isnan(h) ? "!!" : String(h, 0));
  display.print("Isik    : ");
  display.println(ldr);
  display.print("Toprak  : ");
  display.println(soil);
  display.print("Yagmur  : ");
  display.println(rain);

  display.println("--------------------");
  display.print("F:");
  display.print(fanState ? "ON" : "OFF");
  display.print(" | L:");
  display.print(lightState ? "ON" : "OFF");
  display.print(" | P:");
  display.println(pumpState ? "ON" : "OFF");
  display.display();
}

String getHTML() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  int ldr = analogRead(LDR_PIN);
  int soil = analogRead(SOIL_PIN);
  int rain = analogRead(RAIN_PIN);

  updateOLED(t, h, ldr, soil, rain);

  String ptr =
      "<!DOCTYPE html><html><head><meta charset='UTF-8'><meta name='viewport' "
      "content='width=device-width, initial-scale=1.0'>";
  ptr += "<title>Sera Pro Kontrol</title><style>";
  ptr += "body{font-family:sans-serif; text-align:center; background:#f0f2f5; "
         "margin:0; padding:20px;}";
  ptr += ".container{max-width:400px; margin:auto;}";
  ptr += ".card{background:white; padding:20px; margin-bottom:15px; "
         "border-radius:15px; box-shadow:0 4px 6px rgba(0,0,0,0.1);}";
  ptr += "h2{color:#1a73e8;} .val{font-weight:bold; color:#5f6368;}";
  ptr += ".btn{display:block; width:100%; padding:15px; font-size:18px; "
         "cursor:pointer; color:white; border:none; border-radius:10px; "
         "margin:10px 0;}";
  ptr += ".on{background:#34a853;} .off{background:#ea4335;} "
         ".refresh{background:#1a73e8;}";
  ptr += "</style></head><body><div class='container'>";
  ptr += "<h2>Sera Pro Paneli</h2>";

  // Tüm Sensör Verileri
  ptr += "<div class='card'><h3>Sensörler</h3>";
  ptr += "<p>Sıcaklık: <span class='val'>" +
         (isnan(t) ? "HATA" : String(t) + " °C") + "</span></p>";
  ptr += "<p>Nem: <span class='val'>%" + (isnan(h) ? "HATA" : String(h)) +
         "</span></p>";
  ptr += "<p>Işık (LDR): <span class='val'>" + String(ldr) + "</span></p>";
  ptr += "<p>Toprak Nemi: <span class='val'>" + String(soil) + "</span></p>";
  ptr += "<p>Yağmur: <span class='val'>" + String(rain) + "</span></p>";
  ptr += "</div>";

  // Kontrol Butonları
  ptr += "<div class='card'><h3>Kontrol</h3>";
  ptr += "<a href='/toggle/light'><button class='btn " +
         String(lightState ? "on" : "off") +
         "'>Mor Işık: " + String(lightState ? "AÇIK" : "KAPALI") +
         "</button></a>";
  ptr += "<a href='/toggle/pump'><button class='btn " +
         String(pumpState ? "on" : "off") +
         "'>Su Pompası: " + String(pumpState ? "AÇIK" : "KAPALI") +
         "</button></a>";
  ptr += "<a href='/toggle/fan'><button class='btn " +
         String(fanState ? "on" : "off") +
         "'>Fan: " + String(fanState ? "AÇIK" : "KAPALI") + "</button></a>";
  ptr += "<a href='/'><button class='btn refresh'>Verileri Yenile</button></a>";
  ptr += "</div></div></body></html>";
  return ptr;
}

void setup() {
  Serial.begin(115200);
  dht.begin();

  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("OLED Hatası!");
  }

  // --- AÇILIŞ EKRANI (SPLASH SCREEN) ---
  display.clearDisplay();
  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(15, 20);
  display.println("SERA PRO");
  display.setTextSize(1);
  display.setCursor(25, 45);
  display.println("Sistem Aciliyor...");
  display.display();
  delay(3000); // 3 saniye bekle

  pinMode(LIGHT_RELAY, OUTPUT);
  pinMode(PUMP_RELAY, OUTPUT);
  pinMode(FAN_PIN, OUTPUT);
  digitalWrite(LIGHT_RELAY, RELAY_OFF);
  digitalWrite(PUMP_RELAY, RELAY_OFF);
  digitalWrite(FAN_PIN, LOW);

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }
  Serial.println();
  Serial.print("WiFi Baglandi! IP Adresi: ");
  Serial.println(WiFi.localIP());
  server.on("/", []() { server.send(200, "text/html", getHTML()); });
  
  // --- JSON VERİ APİSİ (Web Arayüzü İçin) ---
  server.on("/api/data", HTTP_GET, []() {
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    int ldr = analogRead(LDR_PIN);
    int soil = analogRead(SOIL_PIN);
    int rain = analogRead(RAIN_PIN);
    
    String json = "{";
    json += "\"temp\":" + String(isnan(t) ? 0 : t) + ",";
    json += "\"hum\":" + String(isnan(h) ? 0 : h) + ",";
    json += "\"ldr\":" + String(ldr) + ",";
    json += "\"soil\":" + String(soil) + ",";
    json += "\"rain\":" + String(rain) + ",";
    json += "\"light\":" + String(lightState ? "true" : "false") + ",";
    json += "\"pump\":" + String(pumpState ? "true" : "false") + ",";
    json += "\"fan\":" + String(fanState ? "true" : "false");
    json += "}";
    
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(200, "application/json", json);
  });

  // --- KONTROL APİSİ (Web Arayüzü İçin) ---
  server.on("/api/control", HTTP_GET, []() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    if (server.hasArg("device") && server.hasArg("state")) {
      String device = server.arg("device");
      String state = server.arg("state");
      bool on = (state == "ON" || state == "true");
      
      if (device == "light" || device == "led") {
        lightState = on;
        digitalWrite(LIGHT_RELAY, lightState ? RELAY_ON : RELAY_OFF);
      } else if (device == "pump") {
        pumpState = on;
        digitalWrite(PUMP_RELAY, pumpState ? RELAY_ON : RELAY_OFF);
      } else if (device == "fan") {
        fanState = on;
        digitalWrite(FAN_PIN, fanState ? HIGH : LOW);
      }
      server.send(200, "text/plain", "OK");
    } else {
      server.send(400, "text/plain", "Bad Request");
    }
  });

  // CORS Preflight
  server.onNotFound([]() {
    if (server.method() == HTTP_OPTIONS) {
      server.sendHeader("Access-Control-Allow-Origin", "*");
      server.sendHeader("Access-Control-Allow-Methods", "GET, OPTIONS, POST");
      server.sendHeader("Access-Control-Allow-Headers", "*");
      server.send(204);
    } else {
      server.sendHeader("Access-Control-Allow-Origin", "*");
      server.send(404, "text/plain", "Not Found");
    }
  });

  // --- HTML KONTROL ROTALARI ---
  server.on("/toggle/light", []() {
    lightState = !lightState;
    digitalWrite(LIGHT_RELAY, lightState ? RELAY_ON : RELAY_OFF);
    server.sendHeader("Location", "/");
    server.send(303);
  });
  server.on("/toggle/pump", []() {
    pumpState = !pumpState;
    digitalWrite(PUMP_RELAY, pumpState ? RELAY_ON : RELAY_OFF);
    server.sendHeader("Location", "/");
    server.send(303);
  });
  server.on("/toggle/fan", []() {
    fanState = !fanState;
    digitalWrite(FAN_PIN, fanState ? HIGH : LOW);
    server.sendHeader("Location", "/");
    server.send(303);
  });
  server.begin();
}

void loop() {
  server.handleClient();
  static unsigned long lastUpdate = 0;
  if (millis() - lastUpdate > 2000) {
    lastUpdate = millis();
    updateOLED(dht.readTemperature(), dht.readHumidity(), analogRead(LDR_PIN),
               analogRead(SOIL_PIN), analogRead(RAIN_PIN));
  }
}