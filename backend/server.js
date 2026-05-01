require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const mqttService = require('./services/mqttService');
const dbService = require('./services/dbService');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// dist/ klasörünü statik olarak sun (Frontend HTTP üzerinden çalışsın)
app.use(express.static(path.join(__dirname, '..', 'dist')));

const PORT = process.env.PORT || 3000;

// Health Check API
app.get('/api/health', (req, res) => {
    res.json({ status: 'SeraPro Backend Running Perfectly!' });
});

// Manuel Kontrol API (Frontend'den ESP32'ye komut göndermek için)
app.post('/api/control', (req, res) => {
    const { device, action } = req.body;
    // device: 'fan', 'pump', 'led'
    // action: 'ON', 'OFF'
    
    if(!device || !action) {
        return res.status(400).json({ error: 'Device and action are required' });
    }

    try {
        mqttService.sendCommand(device, action);
        res.json({ message: `Command sent: ${device} -> ${action}` });
    } catch (err) {
        res.status(500).json({ error: 'Failed to send command' });
    }
});

// Cihazların güncel durumunu (ON/OFF) ve enerji verilerini dönen API
app.get('/api/device-status', (req, res) => {
    res.json(dbService.getDeviceStatus());
});

// Yapay Zeka (AI) Hastalık Loglama API'si (Resim yükleme dahil)
app.post('/api/ai-log', async (req, res) => {
    const { diseaseClass, confidence, treatmentAdvice, base64Image } = req.body;
    
    if (!diseaseClass || confidence === undefined) {
        return res.status(400).json({ error: 'Eksik parametreler.' });
    }

    try {
        const result = await dbService.saveAILog(diseaseClass, confidence, treatmentAdvice, base64Image);
        res.json({ message: 'AI analizi başarıyla kaydedildi.', data: result });
    } catch (err) {
        res.status(500).json({ error: 'Kayıt sırasında sunucu hatası.' });
    }
});

// Veri Madenciliği ve İstatistik API'si
app.get('/api/analytics', async (req, res) => {
    try {
        const analytics = await dbService.getAnalytics();
        if (analytics.error) {
            return res.status(503).json({ error: 'Veritabanı bağlantısı yok.' });
        }
        res.json(analytics);
    } catch (err) {
        res.status(500).json({ error: 'Analiz verisi alınamadı.' });
    }
});

// Başlatma
app.listen(PORT, () => {
    console.log(`[🚀] Sunucu HTTP://localhost:${PORT} üzerinde başlatıldı.`);
    
    // MQTT Bağlantısını Başlat
    mqttService.init();
});
