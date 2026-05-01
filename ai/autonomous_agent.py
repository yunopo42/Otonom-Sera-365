import paho.mqtt.client as mqtt
import joblib
import pandas as pd
import os
from dotenv import load_dotenv

# dotenv'i backend/.env yolundan okuyoruz
env_path = os.path.join(os.path.dirname(__file__), '..', 'backend', '.env')
load_dotenv(dotenv_path=env_path)

MQTT_HOST = os.getenv('MQTT_HOST', '').replace('tls://', '')
MQTT_PORT = int(os.getenv('MQTT_PORT', 8883))
MQTT_USER = os.getenv('MQTT_USERNAME')
MQTT_PASS = os.getenv('MQTT_PASSWORD')

# Global Yapay Zeka Modeli
try:
    model_path = os.path.join(os.path.dirname(__file__), 'sera_ai_model.pkl')
    model = joblib.load(model_path)
    print("[OK] Sera YZ Modeli hafizaya yuklendi.")
except Exception as e:
    print("[ERROR] Model yuklenemedi. Lutfen once train_model.py calistirin.")
    exit(1)

# Anlık tutulacak sensör verileri tamponu
sensor_buffer = {
    'Sıcaklık': 25.0,
    'Nem': 60,
    'Işık': 8000,
    'Toprak_Nemi': 60,
    'Yağmur': 0
}

last_hardware_state = {
    'fan': -1,
    'pump': -1,
    'led': -1,
    'heater': -1
}

def predict_and_act(client):
    try:
        # Sensörleri dataframe'e çevir
        df = pd.DataFrame([sensor_buffer])
        prediction = model.predict(df)[0]
        
        # prediction: [Fan, Pompa, Led, Isıtıcı] (1 veya 0 değerleri)
        fan_action = 'ON' if prediction[0] == 1 else 'OFF'
        pump_action = 'ON' if prediction[1] == 1 else 'OFF'
        led_action = 'ON' if prediction[2] == 1 else 'OFF'
        heater_action = 'ON' if prediction[3] == 1 else 'OFF'

        # Değişim varsa MQTT'ye yolla
        if prediction[0] != last_hardware_state['fan']:
            client.publish("sera/control/fan", fan_action)
            last_hardware_state['fan'] = prediction[0]
            print(f"[AI Karari] -> Fan: {fan_action} | Sensor: {sensor_buffer['Sıcaklık']}C")

        if prediction[1] != last_hardware_state['pump']:
            client.publish("sera/control/pump", pump_action)
            last_hardware_state['pump'] = prediction[1]
            print(f"[AI Karari] -> Pompa: {pump_action} | Toprak Nemi: {sensor_buffer['Toprak_Nemi']}%")

        if prediction[2] != last_hardware_state['led']:
            client.publish("sera/control/led", led_action)
            last_hardware_state['led'] = prediction[2]
            print(f"[AI Karari] -> LED: {led_action} | Isik: {sensor_buffer['Işık']}Lux")
            
    except Exception as e:
        print("Tahminleme hatası:", e)

def on_connect(client, userdata, flags, rc):
    print("[OK] Otonom AI Botu MQTT Cloud'a Baglandi!")
    client.subscribe("sera/sensor/#")
    predict_and_act(client) # Ilk tahmini baslangicta yap

def on_message(client, userdata, msg):
    topic = msg.topic
    value_str = msg.payload.decode("utf-8")
    sensor_type = topic.split('/')[-1]
    
    try:
        val = float(value_str)
        updated = False
        if sensor_type == 'sicaklik':
            sensor_buffer['Sıcaklık'] = val
            updated = True
        elif sensor_type == 'nem':
            sensor_buffer['Nem'] = val
            updated = True
        elif sensor_type == 'isik':
            sensor_buffer['Işık'] = val
            updated = True
        elif sensor_type == 'toprak':
            sensor_buffer['Toprak_Nemi'] = val
            updated = True
        elif sensor_type == 'yagmur':
            sensor_buffer['Yağmur'] = val
            updated = True

        if updated:
            predict_and_act(client)
        
    except ValueError:
        pass

def main():
    if not MQTT_HOST:
        print("HATA: .env dosyasında MQTT ayarları bulunamadı!")
        return

    print("YZ Ajanı Başlatılıyor...")
    client = mqtt.Client(client_id="ai_agent_autonomous")
    client.tls_set()
    client.username_pw_set(MQTT_USER, MQTT_PASS)

    client.on_connect = on_connect
    client.on_message = on_message

    print(f"Bağlanılıyor: {MQTT_HOST}:{MQTT_PORT}...")
    try:
        client.connect(MQTT_HOST, MQTT_PORT, 60)
        client.loop_forever()
    except Exception as e:
        print("Bağlantı hatası:", e)

if __name__ == '__main__':
    main()
