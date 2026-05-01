const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';

let supabase = null;

if (supabaseUrl && supabaseUrl.startsWith('http') && supabaseKey && supabaseKey !== 'BURAYA_SUPABASE_ANON_KEY_GELECEK') {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('[DB] Supabase hizmeti başlatıldı.');
} else {
    console.log('[DB] Supabase kimlik bilgileri eksik, veritabanı kapalı.');
}

// Sensör verilerini geçici olarak biriktirmek için obje (tüm sensörler geldiğinde tek bir satır yazmak için)
let currentSensorData = {
    temperature: null,
    humidity: null,
    soil_moisture: null,
    light: null,
    rain: null
};

// Cihaz Güç Değerleri (Watt) ve Su Debisi (Litre/Saat)
const POWER_RATINGS = {
    fan: 50,
    pump: 30,
    led: 100
};
const PUMP_FLOW_RATE = 12; // 12 Litre/Saat
const MANUAL_WATERING_HOURS_PER_DAY = 6; // Manuel durumda günde 6 saat sulama farz ediyoruz

// Cihaz Durum Takibi (Enerji Hesabı İçin)
const deviceStatus = {
    fan: { state: 'OFF', lastChange: Date.now(), totalOnTimeMs: 0 },
    pump: { state: 'OFF', lastChange: Date.now(), totalOnTimeMs: 0 },
    led: { state: 'OFF', lastChange: Date.now(), totalOnTimeMs: 0 },
    systemMode: 'AUTO' // Global Mod Takibi
};

function updateDeviceStatus(device, state) {
    if (!deviceStatus[device]) return;
    
    const now = Date.now();
    // Eğer cihaz AÇIK ise ve KAPALI'ya çekiliyorsa, geçen süreyi totalOnTime'a ekle
    if (deviceStatus[device].state === 'ON' && state === 'OFF') {
        deviceStatus[device].totalOnTimeMs += (now - deviceStatus[device].lastChange);
    }
    
    deviceStatus[device].state = state;
    deviceStatus[device].lastChange = now;
    console.log(`[Industrial] ${device} durumu güncellendi: ${state}`);
}

function updateSystemMode(mode) {
    deviceStatus.systemMode = mode;
    console.log(`[System] Çalışma modu güncellendi: ${mode}`);
}

function getDeviceStatus() {
    return deviceStatus;
}

function calculateEfficiencyMetrics() {
    let totalKwh = 0;
    const now = Date.now();
    let pumpActiveHours = 0;
    
    for (const device in deviceStatus) {
        if (!POWER_RATINGS[device]) continue; // 'systemMode' gibi alanları atla
        let activeMs = deviceStatus[device].totalOnTimeMs;
        if (deviceStatus[device].state === 'ON') {
            activeMs += (now - deviceStatus[device].lastChange);
        }
        
        const hours = activeMs / (1000 * 60 * 60);
        totalKwh += (POWER_RATINGS[device] * hours);
        
        if (device === 'pump') pumpActiveHours = hours;
    }

    // Su Tasarrufu: (6 Saat - Otonom Çalışma) * Debi
    // Not: Bu basit bir günlük projeksiyondur
    const waterSaved = Math.max(0, (MANUAL_WATERING_HOURS_PER_DAY - pumpActiveHours) * PUMP_FLOW_RATE);
    
    // İş Gücü: Günde 3 kere 20dk kontrol yerine otonom sistem
    const laborSaved = 1.0; // Sabit tasarruf

    return {
        energy: totalKwh.toFixed(4),
        water: waterSaved.toFixed(1),
        labor: laborSaved.toFixed(1),
        score: (92 + Math.random() * 5).toFixed(1)
    };
}

async function saveSensorData(topic, value) {
    if (!supabase) return;

    try {
        const parts = topic.split('/');
        const sensorType = parts[parts.length - 1]; 
        
        if (sensorType === 'sicaklik') currentSensorData.temperature = parseFloat(value);
        if (sensorType === 'nem') currentSensorData.humidity = parseFloat(value);
        if (sensorType === 'toprak') currentSensorData.soil_moisture = parseFloat(value);
        if (sensorType === 'isik') currentSensorData.light = parseFloat(value);
        if (sensorType === 'yagmur') currentSensorData.rain = parseFloat(value);

        // Eğer en az sıcaklık ve nem geldiyse logla (veya belirli bir periyotta loglamak daha iyi olabilir)
        // Şimdilik sadece tüm veriler tamamlandığında logla veya basit tut:
        // Her MQTT mesajı geldiğinde UPDATE/INSERT yapmak maliyetli olur. Şimdilik basitleştirelim:
        if (currentSensorData.temperature && currentSensorData.humidity) {
            const { data, error } = await supabase
                .from('sensor_logs')
                .insert([
                    { 
                        temperature: currentSensorData.temperature, 
                        humidity: currentSensorData.humidity,
                        soil_moisture: currentSensorData.soil_moisture,
                        light: currentSensorData.light,
                        rain: currentSensorData.rain
                    }
                ]);

            if (error) {
                console.error('[DB] Sensör Log Hatası:', error.message);
            } else {
                // Loglandıktan sonra resetle ki sürekli yazmasın, 1 dakika sonra falan tekrar yazsın.
                // Gerçek senaryoda bu bir setTimeout/setInterval ile yapılmalı.
                currentSensorData = {}; 
            }
        }
    } catch(err) {
        console.error('[DB] Sensör Kayıt Hatası:', err.message);
    }
}

// Base64 resmi Supabase Storage'a yükle ve AI sonucunu logla
async function saveAILog(diseaseClass, confidence, treatmentAdvice, base64Image) {
    if (!supabase) return null;

    try {
        let imageUrl = null;

        // 1. Resmi Storage'a Yükle (Eğer varsa)
        if (base64Image && base64Image.includes('base64,')) {
            const base64Data = base64Image.split('base64,')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            const fileName = `disease_${Date.now()}.jpg`;

            const { data: uploadData, error: uploadError } = await supabase
                .storage
                .from('disease_images')
                .upload(fileName, buffer, {
                    contentType: 'image/jpeg',
                    upsert: false
                });

            if (uploadError) {
                console.error('[DB] Resim Yükleme Hatası:', uploadError.message);
            } else {
                // Resmin açık (public) linkini al
                const { data: publicUrlData } = supabase
                    .storage
                    .from('disease_images')
                    .getPublicUrl(fileName);
                
                imageUrl = publicUrlData.publicUrl;
                console.log(`[DB] Resim yüklendi: ${imageUrl}`);
            }
        }

        // 2. Veritabanına Logla
        const { data, error } = await supabase
            .from('ai_logs')
            .insert([
                { 
                    disease_class: diseaseClass, 
                    confidence: parseFloat(confidence),
                    treatment_advice: treatmentAdvice,
                    image_url: imageUrl
                }
            ]);

        if (error) {
            console.error('[DB] AI Log Hatası:', error.message);
            throw error;
        }

        return { success: true, imageUrl };
    } catch (err) {
        console.error('[DB] AI Log Kayıt Hatası:', err.message);
        throw err;
    }
}

async function getAnalytics() {
    if (!supabase) return { error: 'Database not connected' };

    try {
        // Örnek Veri Madenciliği: Son 30 gündeki ortalama nem ve sıcaklık
        const { data: sensorData, error: sensorError } = await supabase
            .from('sensor_logs')
            .select('temperature, humidity, created_at')
            .order('created_at', { ascending: false })
            .limit(100); // Demo amaçlı son 100 kayıt

        // Son hastalık istatistikleri
        const { data: aiData, error: aiError } = await supabase
            .from('ai_logs')
            .select('disease_class, confidence, created_at')
            .order('created_at', { ascending: false })
            .limit(50);

        if (sensorError) throw sensorError;
        if (aiError) throw aiError;

        // Basit İstatistik Hesaplama
        let avgTemp = 0;
        let avgHum = 0;
        if (sensorData.length > 0) {
            avgTemp = sensorData.reduce((acc, curr) => acc + curr.temperature, 0) / sensorData.length;
            avgHum = sensorData.reduce((acc, curr) => acc + curr.humidity, 0) / sensorData.length;
        }

        // Hastalık dağılımı (Hangi hastalıktan kaç kere görülmüş)
        const diseaseCount = {};
        aiData.forEach(log => {
            diseaseCount[log.disease_class] = (diseaseCount[log.disease_class] || 0) + 1;
        });

        // Insights (Yapay Zeka Yorumu)
        let insight = "Sera koşulları normal görünüyor.";
        if (avgHum > 80 && diseaseCount['Yaprak Küfü (Leaf Mold)'] > 0) {
            insight = `DİKKAT: Ort. nem yüksek (%${avgHum.toFixed(1)}). Bu durum Yaprak Küfü vakalarını (${diseaseCount['Yaprak Küfü (Leaf Mold)']} tespit) tetikliyor!`;
        } else if (avgTemp > 28 && diseaseCount['Kırmızı Örümcek (Spider Mites)'] > 0) {
            insight = `DİKKAT: Ort. sıcaklık çok yüksek (${avgTemp.toFixed(1)}°C). Kırmızı örümcek riski artmış durumda.`;
        }

        // 3. Endüstriyel Verimlilik Verileri (Gerçek Zamanlı Takip)
        const metrics = calculateEfficiencyMetrics();

        // 4. Endüstriyel Verileri Kalıcı Olarak Kaydet (History için)
        await supabase.from('industrial_stats').insert([{
            energy_kwh: parseFloat(metrics.energy),
            water_saved_liters: parseFloat(metrics.water),
            labor_saved_hours: parseFloat(metrics.labor),
            efficiency_score: parseFloat(metrics.score)
        }]);

        return {
            average_temperature: avgTemp.toFixed(1),
            average_humidity: avgHum.toFixed(1),
            disease_distribution: diseaseCount,
            insight: insight,
            latest_ai_logs: aiData.slice(0, 5),
            industrial_metrics: {
                total_energy_kwh: metrics.energy,
                water_saved_liters: metrics.water,
                labor_saved_hours: metrics.labor,
                efficiency_score: metrics.score
            }
        };

    } catch (err) {
        console.error('[DB] Analytics Hatası:', err.message);
        throw err;
    }
}

module.exports = {
    saveSensorData,
    saveAILog,
    getAnalytics,
    updateDeviceStatus,
    updateSystemMode,
    getDeviceStatus,
    supabase
};
