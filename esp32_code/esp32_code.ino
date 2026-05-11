/*
 * SeraPro 360 AI - Ana ESP32 Kodu (MQTT + HTTP)
 *
 * Özellikler:
 *  - Sensör verilerini MQTT üzerinden buluta gönderir
 *  - Netlify'dan gelen MQTT komutlarıyla röleleri tetikler
 *  - Aynı ağdaki cihazlar için HTTP API'yi korur
 *  - OLED ekrana anlık verileri yazar
 *
 * Gerekli Kütüphaneler (Arduino IDE > Tools > Manage Libraries):
 *  - PubSubClient (Nick O'Leary)
 *  - Adafruit SSD1306
 *  - Adafruit GFX Library
 *  - DHT sensor library (Adafruit)
 */

#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <DHT.h>
#include <PubSubClient.h>
#include <WebServer.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <Wire.h>

// ============================================================
//  AYARLAR - BURAYA KENDİ BİLGİLERİNİZİ YAZIN
// ============================================================
const char *ssid = "Xiaomi15";     // Wi-Fi Adı
const char *password = "........"; // Wi-Fi Şifresi

// HiveMQ Cloud Bilgileri
const char *mqttHost = "ce79181754684d63abefda7c38d3a25f.s1.eu.hivemq.cloud";
const int mqttPort = 8883; // TLS Portu
const char *mqttUser = "yunopo42";
const char *mqttPassword = "Yunus_emre1903";
// ============================================================

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

#define RELAY_ON LOW
#define RELAY_OFF HIGH

bool lightState = false, pumpState = false, fanState = false;

DHT dht(DHTPIN, DHTTYPE);
WebServer server(80);

WiFiClientSecure wifiSecure;
PubSubClient mqttClient(wifiSecure);

unsigned long lastMqttPublish = 0;
const long publishInterval = 3000; // 3 saniyede bir sensör verisi gönder

// ============================================================
//  MQTT: Gelen Komutları İşle (Netlify'dan gelen buton tıklamaları)
// ============================================================
void mqttCallback(char *topic, byte *payload, unsigned int length) {
  String topicStr = String(topic);
  String msg = "";
  for (unsigned int i = 0; i < length; i++) {
    msg += (char)payload[i];
  }

  Serial.print("MQTT Mesaj Alındı [");
  Serial.print(topicStr);
  Serial.print("] -> ");
  Serial.println(msg);

  bool isON = (msg == "ON");

  if (topicStr == "sera/control/fan") {
    fanState = isON;
    digitalWrite(FAN_PIN, fanState ? HIGH : LOW);
    Serial.println(fanState ? "Fan AÇILDI" : "Fan KAPANDI");
  } else if (topicStr == "sera/control/pump") {
    pumpState = isON;
    digitalWrite(PUMP_RELAY, pumpState ? RELAY_ON : RELAY_OFF);
    Serial.println(pumpState ? "Pompa AÇILDI" : "Pompa KAPANDI");
  } else if (topicStr == "sera/control/led") {
    lightState = isON;
    digitalWrite(LIGHT_RELAY, lightState ? RELAY_ON : RELAY_OFF);
    Serial.println(lightState ? "Işık AÇILDI" : "Işık KAPANDI");
  }
}

// ============================================================
//  MQTT: Bağlan / Yeniden Bağlan
// ============================================================
void reconnectMQTT() {
  // Bağlı değilse bağlanmayı dene
  while (!mqttClient.connected()) {
    Serial.print("MQTT Bağlanılıyor...");
    String clientId = "ESP32_Sera_" + String(random(0xffff), HEX);

    if (mqttClient.connect(clientId.c_str(), mqttUser, mqttPassword)) {
      Serial.println(" Bağlandı!");

      // Kontrol kanallarına abone ol (Netlify'dan gelen komutlar)
      mqttClient.subscribe("sera/control/fan");
      mqttClient.subscribe("sera/control/pump");
      mqttClient.subscribe("sera/control/led");

      Serial.println("Kontrol kanallarına abone olundu.");
    } else {
      Serial.print("Başarısız, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" -> 5 saniye sonra tekrar denenecek.");
      delay(5000);
    }
  }
}

// ============================================================
//  MQTT: Sensör Verilerini Yayınla
// ============================================================
void publishSensorData() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  int ldr = analogRead(LDR_PIN);
  int soil = analogRead(SOIL_PIN);
  int rain = analogRead(RAIN_PIN);

  // Her sensörü ayrı konuya gönder (app.js updateSensorUI ile uyumlu)
  if (!isnan(t))
    mqttClient.publish("sera/sensor/sicaklik", String(t, 1).c_str(), true);
  if (!isnan(h))
    mqttClient.publish("sera/sensor/nem", String(h, 0).c_str(), true);
  mqttClient.publish("sera/sensor/isik", String(ldr).c_str(), true);
  mqttClient.publish("sera/sensor/toprak", String(soil).c_str(), true);
  mqttClient.publish("sera/sensor/yagmur", String(rain).c_str(), true);

  // Röle durumlarını AYRI bir topic'e yayınla (sera/status/)
  // NOT: sera/control/ topic'ine YAYINLAMAYINiz! Orası sadece UI'dan ESP32'ye
  // gelen komutlar içindir. Buraya publish yapılırsa, UI'dan gelen komutlar
  // ezilir ve fan/pompa açıp kapanamaz hale gelir.
  mqttClient.publish("sera/status/fan", fanState ? "ON" : "OFF", true);
  mqttClient.publish("sera/status/pump", pumpState ? "ON" : "OFF", true);
  mqttClient.publish("sera/status/led", lightState ? "ON" : "OFF", true);

  Serial.println("Sensör verileri MQTT'ye gönderildi.");
  updateOLED(t, h, ldr, soil, rain);
}

// ============================================================
//  OLED Ekran Güncelle
// ============================================================
void updateOLED(float t, float h, int ldr, int soil, int rain) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("     SERA DURUM     ");
  display.println("--------------------");

  if (isnan(t))
    display.println("Sicaklik: HATA");
  else {
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
  display.print(" L:");
  display.print(lightState ? "ON" : "OFF");
  display.print(" P:");
  display.println(pumpState ? "ON" : "OFF");
  display.display();
}

// ============================================================
//  HTTP API: JSON Veri (/api/data)
// ============================================================
void handleApiData() {
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
}

// ============================================================
//  HTTP API: Röle Kontrol (/api/control?device=fan&state=ON)
// ============================================================
void handleApiControl() {
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
    server.send(400, "text/plain",
                "Bad Request: 'device' ve 'state' parametreleri gerekli");
  }
}

// ============================================================
//  SETUP
// ============================================================
void setup() {
  Serial.begin(115200);
  dht.begin();

  // OLED Başlat
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("OLED Hatası!");
  }
  display.clearDisplay();
  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(10, 10);
  display.println("SERA PRO");
  display.setTextSize(1);
  display.setCursor(15, 40);
  display.println("Baglaniyor...");
  display.display();

  // Pinleri Ayarla
  pinMode(LIGHT_RELAY, OUTPUT);
  pinMode(PUMP_RELAY, OUTPUT);
  pinMode(FAN_PIN, OUTPUT);
  digitalWrite(LIGHT_RELAY, RELAY_OFF);
  digitalWrite(PUMP_RELAY, RELAY_OFF);
  digitalWrite(FAN_PIN, LOW);

  // Wi-Fi'ye Bağlan
  WiFi.begin(ssid, password);
  Serial.print("Wi-Fi bağlanıyor");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("Bağlandı! IP: ");
  Serial.println(WiFi.localIP());

  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("Wi-Fi Baglandi!");
  display.print("IP: ");
  display.println(WiFi.localIP());
  display.display();
  delay(2000);

  // MQTT Ayarla (TLS - Sertifika doğrulaması kapalı, HiveMQ Cloud Free ile
  // uyumlu)
  wifiSecure.setInsecure();
  mqttClient.setServer(mqttHost, mqttPort);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(1024); // Büyük mesajlar için

  // HTTP Sunucu Rotaları
  server.on("/api/data", HTTP_GET, handleApiData);
  server.on("/api/control", HTTP_GET, handleApiControl);
  server.on("/", []() {
    server.send(200, "text/plain",
                "SeraPro ESP32 Aktif! IP: " + WiFi.localIP().toString());
  });
  server.onNotFound([]() {
    if (server.method() == HTTP_OPTIONS) {
      server.sendHeader("Access-Control-Allow-Origin", "*");
      server.sendHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      server.sendHeader("Access-Control-Allow-Headers", "*");
      server.send(204);
    } else {
      server.sendHeader("Access-Control-Allow-Origin", "*");
      server.send(404, "text/plain", "Not Found");
    }
  });
  server.begin();
  Serial.println("HTTP Sunucu Başlatıldı.");
}

// ============================================================
//  LOOP
// ============================================================
void loop() {
  // HTTP İsteklerini Yanıtla
  server.handleClient();

  // MQTT Bağlantısını Koru
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  mqttClient.loop();

  // Belirli aralıklarla sensör verilerini MQTT'ye gönder
  unsigned long now = millis();
  if (now - lastMqttPublish > publishInterval) {
    lastMqttPublish = now;
    publishSensorData();
  }
}