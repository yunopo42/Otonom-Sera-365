const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY; // service_role key

if (!supabaseUrl || !supabaseKey) {
    console.error("Hata: .env dosyasında SUPABASE_URL veya SUPABASE_KEY eksik!");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedData() {
    console.log("🚀 Veritabanına test verileri yükleniyor...");

    // 1. Sensör Verileri (Son 24 saat için her 15 dakikada bir veri)
    const sensorLogs = [];
    const now = new Date();
    
    for (let i = 0; i < 96; i++) {
        const time = new Date(now.getTime() - (i * 15 * 60 * 1000));
        
        // Rastgele ama gerçekçi değerler
        const temp = 22 + Math.random() * 8; // 22-30 derece
        const hum = 60 + Math.random() * 30; // %60-90 nem
        const soil = 2000 + Math.random() * 1000;
        const light = 400 + Math.random() * 500;
        const rain = Math.random() > 0.8 ? 1 : 0;

        sensorLogs.push({
            created_at: time.toISOString(),
            temperature: parseFloat(temp.toFixed(1)),
            humidity: parseFloat(hum.toFixed(1)),
            soil_moisture: parseFloat(soil.toFixed(0)),
            light: parseFloat(light.toFixed(0)),
            rain: rain
        });
    }

    const { error: sensorError } = await supabase.from('sensor_logs').insert(sensorLogs);
    if (sensorError) console.error("Sensör log hatası:", sensorError);
    else console.log("✅ 96 adet sensör verisi başarıyla eklendi.");

    // 2. Yapay Zeka Logları (Birkaç hastalık tespiti)
    const diseases = [
        { name: "Yaprak Küfü (Leaf Mold)", advice: "Nemi düşürün." },
        { name: "Erken Yanıklık (Early Blight)", advice: "Budama yapın." },
        { name: "Sağlıklı", advice: "Her şey yolunda." }
    ];

    const aiLogs = [];
    for (let i = 0; i < 10; i++) {
        const time = new Date(now.getTime() - (Math.random() * 24 * 60 * 60 * 1000));
        const disease = diseases[Math.floor(Math.random() * diseases.length)];
        
        aiLogs.push({
            created_at: time.toISOString(),
            disease_class: disease.name,
            confidence: 70 + Math.random() * 29,
            treatment_advice: disease.advice,
            image_url: "https://via.placeholder.com/640x480.png?text=Test+Yaprak+Goruntusu"
        });
    }

    const { error: aiError } = await supabase.from('ai_logs').insert(aiLogs);
    if (aiError) console.error("AI log hatası:", aiError);
    else console.log("✅ 10 adet yapay zeka tespiti başarıyla eklendi.");

    console.log("\n🎉 İşlem tamamlandı! Dashboard'u yenileyip 'Veri Madenciliği' kartını kontrol edebilirsiniz.");
}

seedData();
