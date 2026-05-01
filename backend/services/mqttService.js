const mqtt = require('mqtt');
const dbService = require('./dbService');
require('dotenv').config();

let client = null;

function init() {
    const host = process.env.MQTT_HOST;
    const port = process.env.MQTT_PORT;
    const clientId = `mqtt_${Math.random().toString(16).slice(3)}`;
    
    console.log(`[MQTT] Sunucuya bağlanılıyor: ${host}:${port}`);

    client = mqtt.connect(host, {
        clientId,
        port: Number(port),
        username: process.env.MQTT_USERNAME,
        password: process.env.MQTT_PASSWORD,
        clean: true,
        reconnectPeriod: 5000,
        rejectUnauthorized: false
    });

    client.on('connect', () => {
        console.log('[MQTT] Başarıyla HiveMQ Cloud\'a bağlandı!');
        
        // ESP32'den gelecek sensör verilerini dinliyoruz
        client.subscribe('sera/sensor/#', (err) => {
            if (!err) {
                console.log('[MQTT] "sera/sensor/#" konularına abone olundu.');
            }
        });
    });

    client.on('message', (topic, message) => {
        const msgStr = message.toString();
        console.log(`[MQTT] Yeni Mesaj Alındı -> ${topic}: ${msgStr}`);
        
        // Örn topic: sera/sensor/sicaklik -> message: 25.4
        // Burada gelen veriyi ayrıştırıp DB servisine yolluyoruz
        dbService.saveSensorData(topic, msgStr);
    });

    client.on('error', (err) => {
        console.error('[MQTT] Bağlantı Hatası: ', err.message);
    });
}

function sendCommand(device, action) {
    if(!client || !client.connected) {
        throw new Error('MQTT is not connected');
    }
    const topic = `sera/control/${device}`;
    client.publish(topic, action);
    console.log(`[MQTT] Komut Gönderildi -> ${topic}: ${action}`);
}

module.exports = {
    init,
    sendCommand
};
