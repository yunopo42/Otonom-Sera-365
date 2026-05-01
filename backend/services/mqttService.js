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
        
        // Sensör, durum ve kontrol (manuel) konularına abone oluyoruz
        client.subscribe(['sera/sensor/#', 'sera/status/#', 'sera/control/#'], (err) => {
            if (!err) {
                console.log('[MQTT] "sera/#" konularına (sensor, status, control) abone olundu.');
            }
        });
    });

    client.on('message', (topic, message) => {
        const msgStr = message.toString();
        console.log(`[MQTT] Yeni Mesaj Alındı -> ${topic}: ${msgStr}`);
        
        // Sensör verisi mi, durum bilgisi mi yoksa kontrol komutu mu?
        if (topic.startsWith('sera/sensor/')) {
            dbService.saveSensorData(topic, msgStr);
        } else if (topic.startsWith('sera/status/') || topic.startsWith('sera/control/')) {
            const device = topic.split('/').pop();
            
            // Eğer mod değişikliği ise
            if (device === 'mode') {
                dbService.updateSystemMode(msgStr); // msgStr: 'AUTO' veya 'MANUAL'
            }
            // Diğer donanımlar
            else if(['fan', 'led', 'pump'].includes(device)) {
                dbService.updateDeviceStatus(device, msgStr);
            }
        }
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
    
    // Verimlilik hesabı için durumu hemen güncelle (Senkronizasyon)
    dbService.updateDeviceStatus(device, action);
    
    console.log(`[MQTT] Komut Gönderildi -> ${topic}: ${action}`);
}

module.exports = {
    init,
    sendCommand
};
