/*
 * SeraPro 360 AI - ESP32-CAM Kodu (MQTT üzerinden görüntü aktarımı)
 *
 * Özellikler:
 *  - Kamera görüntüsünü JPEG olarak çeker
 *  - Base64'e çevirip MQTT üzerinden "sera/kamera" konusuna gönderir
 *  - Netlify'daki arayüzde anlık kamera akışı görünür
 *
 * Kart Ayarı (Arduino IDE):
 *  Tools > Board > "AI Thinker ESP32-CAM"
 *
 * Gerekli Kütüphaneler:
 *  - PubSubClient (Nick O'Leary)
 *  - Arduino base64 library: "base64" by Densaugeo
 *    (Tools > Manage Libraries > "base64 by Densaugeo" ara ve yükle)
 *
 * ÖNEMLI NOT:
 *  ESP32-CAM'de USB-Serial programlayıcı yoktur.
 *  Yüklemek için IO0 pinini GND'ye bağlayarak reset atın,
 *  yükleme bittikten sonra IO0'ı GND'den çekin.
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include "esp_camera.h"
#include <base64.h>

// ============================================================
//  AYARLAR - BURAYA KENDİ BİLGİLERİNİZİ YAZIN
// ============================================================
const char* ssid     = "Xiaomi15";      // Wi-Fi Adı
const char* password = "........";       // Wi-Fi Şifresi

// HiveMQ Cloud Bilgileri
const char* mqttHost     = "ce79181754684d63abefda7c38d3a25f.s1.eu.hivemq.cloud";
const int   mqttPort     = 8883;
const char* mqttUser     = "yunopo42";
const char* mqttPassword = "Yunus_emre1903";

// Kaç saniyede bir fotoğraf gönderilsin? (saniye)
const int captureIntervalSec = 2;
// ============================================================

// AI Thinker ESP32-CAM Pin Haritası
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

WiFiClientSecure wifiSecure;
PubSubClient mqttClient(wifiSecure);
unsigned long lastCapture = 0;

// ============================================================
//  Kamerayı Başlat
// ============================================================
void initCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;
  config.pin_d0       = Y2_GPIO_NUM;
  config.pin_d1       = Y3_GPIO_NUM;
  config.pin_d2       = Y4_GPIO_NUM;
  config.pin_d3       = Y5_GPIO_NUM;
  config.pin_d4       = Y6_GPIO_NUM;
  config.pin_d5       = Y7_GPIO_NUM;
  config.pin_d6       = Y8_GPIO_NUM;
  config.pin_d7       = Y9_GPIO_NUM;
  config.pin_xclk     = XCLK_GPIO_NUM;
  config.pin_pclk     = PCLK_GPIO_NUM;
  config.pin_vsync    = VSYNC_GPIO_NUM;
  config.pin_href     = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn     = PWDN_GPIO_NUM;
  config.pin_reset    = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size   = FRAMESIZE_QQVGA; // 160x120 - En küçük boyut, buffer'a kesinlikle sığar
  config.jpeg_quality = 40;              // 40 = daha fazla sıkıştırma, daha küçük dosya
  config.fb_count     = 1;

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Kamera başlatılamadı! Hata: 0x%x\n", err);
    return;
  }
  Serial.println("Kamera başarıyla başlatıldı.");
}

// ============================================================
//  MQTT: Bağlan / Yeniden Bağlan
// ============================================================
void reconnectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("MQTT Bağlanılıyor (CAM)...");
    String clientId = "ESP32CAM_" + String(random(0xffff), HEX);

    if (mqttClient.connect(clientId.c_str(), mqttUser, mqttPassword)) {
      Serial.println(" Bağlandı!");
    } else {
      Serial.print("Başarısız, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" -> 5s sonra tekrar.");
      delay(5000);
    }
  }
}

// ============================================================
//  Görüntüyü Çek ve MQTT'ye Gönder
// ============================================================
void captureAndPublish() {
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("Kamera goruntusu alinamadi!");
    return;
  }

  // JPEG baytlarını Base64'e çevir
  String encoded = base64::encode(fb->buf, fb->len);
  esp_camera_fb_return(fb); // Belleği hemen serbest bırak

  Serial.printf("[CAM] Ham JPEG boyutu : %d byte\n", (int)(encoded.length() * 3 / 4));
  Serial.printf("[CAM] Base64 boyutu  : %d byte\n", encoded.length());

  if (encoded.length() > 59000) {
    Serial.println("[CAM] UYARI: Goruntu cok buyuk! jpeg_quality degerini artirin (50-60).");
    return;
  }

  bool published = mqttClient.publish(
    "sera/kamera",
    (const uint8_t*)encoded.c_str(),
    encoded.length(),
    false // retain kapali (anlik goruntu)
  );

  if (published) {
    Serial.printf("[CAM] Goruntu basariyla gonderildi! Boyut: %d byte\n", encoded.length());
  } else {
    Serial.println("[CAM] HATA: Goruntu gonderilemedi!");
    Serial.printf("[CAM] MQTT bagli mi: %s\n", mqttClient.connected() ? "EVET" : "HAYIR");
    Serial.printf("[CAM] MQTT state   : %d\n", mqttClient.state());
  }
}

// ============================================================
//  SETUP
// ============================================================
void setup() {
  Serial.begin(115200);

  // Kamerayı Başlat
  initCamera();

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

  // MQTT Ayarla
  wifiSecure.setInsecure(); // TLS doğrulama kapalı (HiveMQ Free ile uyumlu)
  mqttClient.setServer(mqttHost, mqttPort);
  mqttClient.setBufferSize(60000); // 60KB - Görüntü gönderimi için büyük buffer
  
  Serial.println("ESP32-CAM MQTT hazır.");
}

// ============================================================
//  LOOP
// ============================================================
void loop() {
  // MQTT Bağlantısını Koru
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  mqttClient.loop();

  // Belirlenen aralıkta görüntü gönder
  unsigned long now = millis();
  if (now - lastCapture > (captureIntervalSec * 1000UL)) {
    lastCapture = now;
    captureAndPublish();
  }
}
