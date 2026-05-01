import paho.mqtt.client as mqtt
import time
import random
import os
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(__file__), '..', 'backend', '.env')
load_dotenv(dotenv_path=env_path)

MQTT_HOST = os.getenv('MQTT_HOST', '').replace('tls://', '')
MQTT_PORT = int(os.getenv('MQTT_PORT', 8883))
MQTT_USER = os.getenv('MQTT_USERNAME')
MQTT_PASS = os.getenv('MQTT_PASSWORD')

def main():
    client = mqtt.Client(client_id="sensor_simulator_002")
    client.tls_set()
    client.username_pw_set(MQTT_USER, MQTT_PASS)

    print("Sensor Simulatoru Baslatiliyor...")
    client.connect(MQTT_HOST, MQTT_PORT, 60)
    
    # Baslangic değerleri (Tehlike yok)
    temp = 20.0
    hum = 50.0
    light = 8000.0
    soil = 60.0

    print("Sensor verileri gonderilmeye baslandi... (Hava isinacak)")
    try:
        while True:
            # Zekanın tetiklenmesi için Sıcaklığı yapay olarak artıralım
            temp += 1.5 
            hum += random.uniform(-1, 2)
            soil -= random.uniform(0.5, 2)
            
            # Dongu tamamlaninca basa sar
            if temp > 35:
                temp = 15.0  

            client.publish("sera/sensor/sicaklik", f"{temp:.1f}")
            client.publish("sera/sensor/nem", f"{hum:.1f}")
            client.publish("sera/sensor/isik", f"{light:.1f}")
            client.publish("sera/sensor/toprak", f"{soil:.1f}")
            
            print(f"[Simulator] Sicaklik: {temp:.1f}C | Nem: {hum:.1f}% yollandi.")
            time.sleep(3)
    except KeyboardInterrupt:
        print("\nSimulasyon Durduruldu!")
        client.disconnect()

if __name__ == '__main__':
    main()
