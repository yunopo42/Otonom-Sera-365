import paho.mqtt.client as mqtt
import os
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(__file__), '..', 'backend', '.env')
load_dotenv(dotenv_path=env_path)

MQTT_HOST = os.getenv('MQTT_HOST', '').replace('tls://', '')
MQTT_PORT = int(os.getenv('MQTT_PORT', 8883))
MQTT_USER = os.getenv('MQTT_USERNAME')
MQTT_PASS = os.getenv('MQTT_PASSWORD')

def on_connect(client, userdata, flags, rc):
    print("Test istemcisi baglandi, kamera kanali dinleniyor...")
    client.subscribe("sera/kamera")

def on_message(client, userdata, msg):
    print(f"Kamera mesaji alindi! Boyut: {len(msg.payload)} bytes")
    client.disconnect() # Mesaji alinca kapat

client = mqtt.Client(client_id="test_cam_123")
client.tls_set()
client.username_pw_set(MQTT_USER, MQTT_PASS)
client.on_connect = on_connect
client.on_message = on_message
client.connect(MQTT_HOST, MQTT_PORT, 60)
client.loop_forever()
