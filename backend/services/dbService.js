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

        return {
            average_temperature: avgTemp.toFixed(1),
            average_humidity: avgHum.toFixed(1),
            disease_distribution: diseaseCount,
            insight: insight,
            latest_ai_logs: aiData.slice(0, 5) // Son 5 hastalık
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
    supabase
};
