// app.js - SeroPro UI Logic & Mock Data Simulation

// --- AYARLAR ---
// ESP32'nin bağlandığı IP adresi:
const ESP_IP = "10.73.82.223"; 

document.addEventListener("DOMContentLoaded", () => {
    initClock();
    initChart();
    loadTFModel();
    fetchAnalytics(); // Veri madenciliği panelini doldur
    
    if (ESP_IP) {
        initLocalESP32();
    } else {
        // MQTT WebSocket Entegrasyonu Başlat
        initMQTT();
    }
});

// Update the Top Header Clock
function initClock() {
    const timeDisplay = document.getElementById("current-time");
    setInterval(() => {
        const now = new Date();
        timeDisplay.textContent = now.toLocaleTimeString('tr-TR', { hour12: false });
    }, 1000);
}

// Chart.js Configuration
let mainChart;
function initChart() {
    const ctx = document.getElementById('mainChart').getContext('2d');
    
    // Chart Defaults for Dark Theme
    Chart.defaults.color = "rgba(255, 255, 255, 0.5)";
    Chart.defaults.font.family = "'Inter', sans-serif";
    
    // Mock Data for 24h
    const labels = Array.from({length: 12}, (_, i) => `${i*2}:00`);
    const tempData = [22, 21.5, 21, 20.5, 20, 21, 22.5, 24, 25.5, 26, 25, 24.5];
    const humData = [60, 62, 65, 68, 70, 69, 65, 60, 55, 52, 58, 62];
    
    mainChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Sıcaklık (°C)',
                    data: tempData,
                    borderColor: '#F97316',
                    backgroundColor: 'rgba(249, 115, 22, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y'
                },
                {
                    label: 'Nem (%)',
                    data: humData,
                    borderColor: '#3B82F6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        boxWidth: 8
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    padding: 12,
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    min: 15,
                    max: 35
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: {
                        drawOnChartArea: false
                    },
                    min: 30,
                    max: 90
                }
            }
        }
    });
}

// Toggle Manual Override
function toggleManualOverride(toggleEl, fromNetwork = false) {
    const isManual = toggleEl.checked;
    
    // Ağdan gelmediyse, benim basışımı tüm cihazlara yay
    if (!fromNetwork && window.mqttClient) {
        window.mqttClient.publish('sera/control/mode', isManual ? 'MANUAL' : 'AUTO', { retain: true });
    }
    
    // Get all override controls (relay checkboxes)
    const relayToggles = document.querySelectorAll('.override-control input[type="checkbox"]');
    
    relayToggles.forEach(relay => {
        // In manual mode, user can control them. In autonomous mode, they are disabled (controlled by AI/Code)
        relay.disabled = !isManual;
        
        // Add event listeners if manual, to update UI texts dynamically
        if(isManual) {
            relay.onchange = function() {
                updateRelayUI(this.id, this.checked);
            }
        } else {
            relay.onchange = null;
        }
    });
    
    // Visual feedback
    if(isManual) {
        addAlert("Manuel Kontrol Aktif", "Sistem otonom kararları devre dışı bırakıldı. Kontrol sizde.", "warning");
    } else {
        addAlert("Otonom Mod Aktif", "Uzman sistem kararları devrede. Röleler otomatik yönetilecek.", "info");
    }
}

function updateRelayUI(id, isChecked) {
    let statusId = "";
    if(id === "relay-fan") statusId = "status-fan";
    if(id === "relay-led") statusId = "status-led";
    if(id === "relay-pump") statusId = "status-pump";
    
    const statusEl = document.getElementById(statusId);
    if(statusEl) {
        if(isChecked) {
            statusEl.textContent = "Şu anda ÇALIŞIYOR";
            statusEl.className = "status-text active";
        } else {
            statusEl.textContent = "Şu anda KAPALI";
            statusEl.className = "status-text inactive";
        }
    }
}

function simulateUpload() {
    alert("Fotoğraf Yükleme Dialogu (Dosya seçici) açılacak.");
}

function capturePhoto() {
    // Fotoğrafın alınacağı ESP32 /capture adresi
    const captureUrl = "http://192.168.0.29/capture";
    
    // ESP32'den veriyi Fetch ile alıp kendi cihazımıza indiriyoruz
    fetch(captureUrl)
    .then(response => {
        if (!response.ok) throw new Error("Ağ yanıt vermedi");
        return response.blob();
    })
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        
        // Benzersiz dosya adı oluşturma: Örn: Sera_Kamera_2024-03-22T14-30-00.jpg
        const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
        a.download = `Sera_Kamera_${dateStr}.jpg`;
        
        document.body.appendChild(a);
        a.click();
        
        window.URL.revokeObjectURL(url);
        addAlert("Fotoğraf Kaydedildi", "Kameradan alınan anlık görüntü başarıyla indirildi.", "success");
    })
    .catch(err => {
        console.warn("Fetch API ile fotoğraf çekilemedi CORS veya ağ hatası:", err);
        // Fallback: CORS veya başka sebepten dolayı JS ile indiremezsek, fotoğrafı tarayıcıda yeni bir sekmede açıyoruz.
        addAlert("Bilgi", "İndirme başlatılamadı ancak fotoğraf yeni bir sekmede açılıyor...", "info");
        window.open(captureUrl, '_blank');
    });
}

function deleteAlert(btnEl) {
    const alertItem = btnEl.closest('.alert-item');
    if (alertItem) {
        alertItem.style.opacity = '0';
        alertItem.style.transform = 'scale(0.95)';
        alertItem.style.transition = 'all 0.3s ease';
        setTimeout(() => {
            alertItem.remove();
        }, 300);
    }
}

function clearAllAlerts() {
    const list = document.querySelector('.alert-list');
    if (list) {
        list.innerHTML = "";
    }
}

function addAlert(title, message, type="info", isCritical=false) {
    const list = document.querySelector('.alert-list');
    
    const alertEl = document.createElement('div');
    alertEl.className = `alert-item ${type} ${isCritical ? 'critical' : ''}`;
    
    const iconClass = type === "warning" || type === "danger" ? "fa-triangle-exclamation" : "fa-info-circle";
    
    alertEl.innerHTML = `
        <i class="fa-solid ${iconClass} alert-icon"></i>
        <div class="alert-content">
            <strong>${title}</strong>
            <p>${message}</p>
            <span class="time">Şimdi</span>
        </div>
        <button class="btn-delete-alert" onclick="deleteAlert(this)" title="Sil"><i class="fa-solid fa-times"></i></button>
    `;
    
    list.prepend(alertEl);
    
    // Keep max 10 items
    if(list.children.length > 10) {
        list.removeChild(list.lastChild);
    }
}

// -------------------------
// MQTT CANLI BAĞLANTI (WSS)
// -------------------------
function initMQTT() {
    // HiveMQ Cloud Credentials & Config (WebSocket portu 8884'tür)
    const host = "wss://ce79181754684d63abefda7c38d3a25f.s1.eu.hivemq.cloud:8884/mqtt";
    const clientId = "web_ui_" + Math.random().toString(16).substr(2, 8);
    const options = {
        keepalive: 60,
        clientId: clientId,
        protocolId: 'MQTT',
        protocolVersion: 4,
        clean: true,
        reconnectPeriod: 2000,
        connectTimeout: 30 * 1000,
        username: "yunopo42",   
        password: "Yunus_emre1903", 
        rejectUnauthorized: false
    };

    console.log("MQTT Sunucusuna (WSS) bağlanılıyor...");
    const client = mqtt.connect(host, options);
    window.mqttClient = client; // Global referans

    client.on('error', function (err) {
        console.error("MQTT Hata: ", err);
        addAlert("Bağlantı Hatası", "MQTT Bulutuna bağlanılamadı.", "danger", true);
        client.end();
    });

    client.on('connect', function () {
        console.log("MQTT Sunucusuna Başarıyla Bağlandı!");
        addAlert("Bulut Bağlantısı", "MQTT (WSS) Socket iletişimi sağlandı. (Canlı Veri Bekleniyor)", "success");
        
        document.getElementById('led-mqtt').className = "led status-healthy";
        document.getElementById('led-db').className = "led status-healthy";
        document.getElementById('led-sensor').className = "led status-healthy";
        
        // Kanallara abone (Subscribe) ol
        client.subscribe('sera/sensor/#');
        client.subscribe('sera/control/#');
        client.subscribe('sera/kamera'); // Resimlere de abone ol
    });

    client.on('message', function (topic, message) {
        if (topic === 'sera/kamera') {
            // file:/// ile açılan sayfalarda güvenliğe takılmaması için Blob yerine Evrensel Base64 Yöntemi
            try {
                let bytes = new Uint8Array(message);
                let binary = '';
                for (let i = 0; i < bytes.length; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                const imgEl = document.getElementById('video-stream');
                if (imgEl) {
                    imgEl.style.display = 'block';
                    const fallbackEl = document.getElementById('stream-fallback');
                    if (fallbackEl) fallbackEl.style.display = 'none';
                    imgEl.src = 'data:image/jpeg;base64,' + window.btoa(binary);
                }
            } catch(e) {
                console.log("Kamera okuma hatasi:", e);
            }
            return;
        }

        const payload = message.toString();
        const parts = topic.split('/');
        const endpoint = parts[2]; // 'sicaklik', 'nem', 'fan', vb.

        if (topic === 'sera/control/mode') {
            const overrideEl = document.getElementById('override-toggle');
            if (overrideEl) {
                const isManual = (payload === 'MANUAL');
                if (overrideEl.checked !== isManual) {
                    overrideEl.checked = isManual;
                    toggleManualOverride(overrideEl, true); // fromNetwork = true
                }
            }
            return;
        }

        if (topic.includes('sensor')) {
            updateSensorUI(endpoint, parseFloat(payload));
        } else if (topic.includes('control')) {
            updateControlUI(endpoint, payload);
        }
    });

    setupManualOverridePublishers(client);
}

// -------------------------
// CANLI UI GÜNCELLEMELERİ
// -------------------------
function updateSensorUI(type, value) {
    if (type === 'sicaklik') {
        document.getElementById('val-temp').innerText = value.toFixed(1);
        updateMainChartData(0, value); // 0. Dataset Sıcaklık
        updateCircularProgress('.circular-chart.orange .circle', value, 50); 
    } 
    else if (type === 'nem') {
        document.getElementById('val-hum').innerText = Math.round(value);
        updateMainChartData(1, value); // 1. Dataset Nem
        updateCircularProgress('.circular-chart.blue .circle', value, 100);
    }
    else if (type === 'isik') {
        document.getElementById('val-light').innerText = Math.round(value);
        updateCircularProgress('.circular-chart.yellow .circle', value, 4095); 
    }
    else if (type === 'toprak') {
        const soilEl = document.getElementById('val-soil');
        if(soilEl) soilEl.innerText = Math.round(value);
        
        // 4095 kuru, 0 çok ıslak. Ters orantı ile nem yüzdesi gibi gösterelim (sadece grafik için)
        // Ya da direkt değeri 4095'e bölerek dolduralım:
        updateCircularProgress('.circular-chart.green .circle', value, 4095);
    }
    else if (type === 'yagmur') {
        const rainEl = document.getElementById('val-rain');
        if(rainEl) rainEl.innerText = Math.round(value);
        
        updateCircularProgress('.circular-chart.cyan .circle', value, 4095);
    }
}

function updateCircularProgress(selector, value, maxVal) {
    const el = document.querySelector(selector);
    if(el) {
        let percent = (value / maxVal) * 100;
        if(percent > 100) percent = 100;
        el.setAttribute('stroke-dasharray', `${percent}, 100`);
    }
}

function updateControlUI(device, action) {
    const isChecked = (action === 'ON');
    let toggleId = "";
    
    if (device === 'fan') toggleId = 'relay-fan';
    if (device === 'led') toggleId = 'relay-led';
    if (device === 'pump') toggleId = 'relay-pump';

    const toggleEl = document.getElementById(toggleId);
    if (toggleEl) {
        toggleEl.checked = isChecked;
        updateRelayUI(toggleId, isChecked);
        
        const overrideEl = document.getElementById('override-toggle');
        if(!overrideEl.checked) {
             addAlert("AI Kararı", `Sistem otonom olarak ${device} donanımını ${action.replace('ON','AÇTI').replace('OFF','KAPATTI')}.`, "info");
        }
    }
}

function updateMainChartData(datasetIndex, newValue) {
    if(!mainChart) return;
    const dataset = mainChart.data.datasets[datasetIndex];
    if(dataset.data.length > 20) {
        dataset.data.shift(); // Sol baştakini at
        if(datasetIndex === 0) {  
             const now = new Date();
             mainChart.data.labels.shift();
             mainChart.data.labels.push(`${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`);
        }
    } else {
        if(datasetIndex === 0) {
             const now = new Date();
             mainChart.data.labels.push(`${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`);
        }
    }
    dataset.data.push(newValue);
    mainChart.update();
}

function setupManualOverridePublishers(client) {
    const relays = {
        'relay-fan': 'sera/control/fan',
        'relay-led': 'sera/control/led',
        'relay-pump': 'sera/control/pump'
    };

    for(const id in relays) {
        const toggle = document.getElementById(id);
        const topic = relays[id];
        
        toggle.addEventListener('click', (e) => {
            const overrideMode = document.getElementById('override-toggle').checked;
            if (overrideMode) {
                const cmd = e.target.checked ? 'ON' : 'OFF';
                client.publish(topic, cmd, { retain: true });
                addAlert('Manuel Geçersiz Kılma', `Talebiniz buluta gitti: ${topic} -> ${cmd}`, 'warning');
            } else {
                e.preventDefault(); 
            }
        });
    }
}

function toggleTheme() {
    const body = document.body;
    const isLight = body.getAttribute("data-theme") === "light";
    const btnIcon = document.querySelector("#theme-btn i");
    
    if (isLight) {
        body.removeAttribute("data-theme");
        btnIcon.className = "fa-solid fa-moon";
        updateChartTheme("dark");
    } else {
        body.setAttribute("data-theme", "light");
        btnIcon.className = "fa-solid fa-sun";
        updateChartTheme("light");
    }
}

function updateChartTheme(theme) {
    if (!mainChart) return;
    const textColor = theme === "light" ? "#475569" : "rgba(255, 255, 255, 0.5)";
    const gridColor = theme === "light" ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.05)";
    
    // Update axes and legends
    mainChart.options.scales.x.grid.color = gridColor;
    if (!mainChart.options.scales.x.ticks) mainChart.options.scales.x.ticks = {};
    mainChart.options.scales.x.ticks.color = textColor;
    
    mainChart.options.scales.y.grid.color = gridColor;
    if (!mainChart.options.scales.y.ticks) mainChart.options.scales.y.ticks = {};
    mainChart.options.scales.y.ticks.color = textColor;
    
    if (!mainChart.options.scales.y1.ticks) mainChart.options.scales.y1.ticks = {};
    mainChart.options.scales.y1.ticks.color = textColor;
    
    mainChart.options.plugins.legend.labels.color = textColor;
    
    mainChart.update();
}

// ==========================================
// KAMERA KONTROLLERİ (FOTOĞRAF ÇEK / YÜKLE)
// ==========================================
window.capturePhoto = function() {
    const imgEl = document.getElementById('video-stream');
    // Eğer resim henüz yüklenmediyse hata ver:
    if (!imgEl || !imgEl.src || imgEl.src.includes('R0lGODlhAQABAIAAAAAAAP')) {
        alert("Henüz buluttan kamera görüntüsü ulaşmadı! Lütfen bekleyin.");
        return;
    }
    
    // Görüntüyü bilgisayara JPG olarak indirme tetikleyicisi
    const a = document.createElement('a');
    a.href = imgEl.src;
    a.download = `Sera_Snapshot_${new Date().getTime()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// -------------------------
// TENSORFLOW.JS AI ENTEGRASYONU
// -------------------------
let tfModel;

const DISEASE_CLASSES = {
    0: { name: "Bakteriyel Leke", treatment: "Bakır içerikli bakterisitler uygulayın. Hastalıklı yaprakları budayın ve havalandırmayı artırın." },
    1: { name: "Erken Yanıklık (Early Blight)", treatment: "Chlorothalonil veya bakır bazlı fungisitler kullanın. Alt yaprakları budayarak toprak temasını kesin." },
    2: { name: "Geç Yanıklık (Late Blight)", treatment: "Hemen sistemik bir fungisit uygulayın (Mancozeb). Seradaki nemi düşürmek için fanları acilen çalıştırın." },
    3: { name: "Yaprak Küfü (Leaf Mold)", treatment: "Hava sirkülasyonunu artırın. Sera içi nemi %85'in altına düşürün. Gerekirse fungisit uygulayın." },
    4: { name: "Septoria Yaprak Lekesi", treatment: "Hastalıklı alt yaprakları yok edin. Bakır veya chlorothalonil içeren fungisitler püskürtün." },
    5: { name: "Kırmızı Örümcek (Spider Mites)", treatment: "Akarisit (miticide) uygulayın. Zararlılar kuru ortamı sevdiği için yaprakları nemlendirmek faydalı olabilir." },
    6: { name: "Hedef Leke (Target Spot)", treatment: "Hava akımını artırın ve koruyucu fungisitler kullanın. Sulamayı yaprakları ıslatmadan dipten yapın." },
    7: { name: "Sarı Yaprak Kıvırcıklığı Virüsü", treatment: "Virüsü taşıyan beyaz sineklerle (whitefly) mücadele edin. Enfekte bitkileri söküp imha edin." },
    8: { name: "Mozaik Virüsü", treatment: "Tedavisi yoktur. Hastalıklı bitkileri hemen sökün ve yakın. Ekipmanlarınızı dezenfekte edin." },
    9: { name: "Sağlıklı", treatment: "Bitki sağlıklı görünüyor. Mevcut bakım rutinine devam edin." }
};

async function loadTFModel() {
    try {
        console.log("TFJS Modeli yükleniyor...");
        tfModel = await tf.loadGraphModel('model/model.json?v=4');
        console.log("Model başarıyla yüklendi!");
        addAlert("Yapay Zeka Aktif", "Tarayıcı tabanlı analiz modeli (TFJS) başarıyla yüklendi.", "success");
    } catch (err) {
        console.error("Model yüklenemedi:", err);
        addAlert("Yapay Zeka Modeli Bekleniyor", "Model henüz eğitilmemiş. Lütfen ai/train_tfjs_model.py scriptini çalıştırarak modeli eğitin.", "warning");
    }
}

async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const imgEl = document.getElementById('video-stream');
    imgEl.src = URL.createObjectURL(file);
    imgEl.style.display = 'block';
    
    const fallbackEl = document.getElementById('stream-fallback');
    if(fallbackEl) fallbackEl.style.display = 'none';

    imgEl.onload = () => {
        predictImage(imgEl);
    };
}

async function analyzeCameraStream() {
    const imgEl = document.getElementById('video-stream');
    if (!imgEl || !imgEl.src || imgEl.src.includes('R0lGODlhAQABAIAAAAAAAP')) {
        alert("Analiz edilecek görüntü bulunamadı.");
        return;
    }
    predictImage(imgEl);
}

async function predictImage(imgElement) {
    if (!tfModel) {
        alert("Model henüz yüklenmedi veya bulunamadı.");
        return;
    }
    
    try {
        // Görüntüyü tensöre çevirme (MobileNetV2 preprocess)
        let tensor = tf.browser.fromPixels(imgElement)
            .resizeNearestNeighbor([224, 224])
            .toFloat();
            
        // 0-255'i 0-1 aralığına çek (ImageDataGenerator rescale=1./255 ile uyumlu)
        tensor = tensor.div(tf.scalar(255.0));
        tensor = tensor.expandDims(0); 
        
        const predictions = await tfModel.predict(tensor).data();
        
        const maxProb = Math.max(...predictions);
        const classIdx = predictions.indexOf(maxProb);
        const result = DISEASE_CLASSES[classIdx];
        const confidence = (maxProb * 100).toFixed(1);
        
        document.getElementById('ai-confidence').textContent = `${confidence}%`;
        const fillEl = document.querySelector('.progress-bar-fill');
        if (fillEl) fillEl.style.width = `${confidence}%`;
        
        const statusEl = document.getElementById('ai-status');
        if (classIdx === 9) { // Healthy
            statusEl.className = "status-badge status-healthy";
            statusEl.style.background = "rgba(34, 197, 94, 0.1)";
            statusEl.style.color = "#4ade80";
            statusEl.innerHTML = `<i class="fa-solid fa-check-circle"></i> <span>${result.name}</span>`;
            addAlert("Analiz Sonucu: Sağlıklı", result.treatment, "success");
        } else {
            statusEl.className = "status-badge"; 
            statusEl.style.background = "rgba(248, 113, 113, 0.1)"; // Red
            statusEl.style.color = "#f87171";
            statusEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span>${result.name}</span>`;
            addAlert(`Hastalık Tespit Edildi: ${result.name}`, `Doğruluk: %${confidence}. Öneri: ${result.treatment}`, "danger", true);
            
            // Eğer Geç Yanıklık veya Erken Yanıklık veya Yaprak Küfü ise havalandırmayı çalıştır
            const overrideMode = document.getElementById('override-toggle')?.checked;
            if (!overrideMode && (classIdx === 1 || classIdx === 2 || classIdx === 3)) {
                 fetch(`http://${ESP_IP}/api/control?device=fan&state=ON`).catch(e=>console.log(e));
                 addAlert("Otonom Karar", "Hastalık riski nedeniyle fan sistemi (havalandırma) otomatik olarak çalıştırıldı.", "warning");
                 updateRelayUI('relay-fan', true);
                 const toggleEl = document.getElementById('relay-fan');
                 if(toggleEl) toggleEl.checked = true;
            }
        }
        
        // Veritabanı ve Veri Madenciliği İçin Backend'e Gönder (Resim Dahil)
        try {
            const canvas = document.createElement("canvas");
            canvas.width = imgElement.naturalWidth || imgElement.width || 224;
            canvas.height = imgElement.naturalHeight || imgElement.height || 224;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);
            const base64Image = canvas.toDataURL("image/jpeg", 0.7); // Optimize edilmiş boyut
            
            fetch('http://localhost:3000/api/ai-log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    diseaseClass: result.name,
                    confidence: maxProb * 100,
                    treatmentAdvice: result.treatment,
                    base64Image: base64Image
                })
            }).catch(e => console.log("AI Log gönderilemedi:", e));
        } catch(e) {
            console.error("Resim çevrilirken hata:", e);
        }
        
    } catch (error) {
        console.error("Tahmin sırasında hata:", error);
    }
}

// -------------------------
// VERİ MADENCİLİĞİ & İSTATİSTİKLER (PostgreSQL/Supabase)
// -------------------------
function fetchAnalytics() {
    const icon = document.querySelector('.analytics-header .fa-sync');
    if(icon) icon.classList.add('fa-spin');

    fetch('http://localhost:3000/api/analytics')
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                console.warn("Veri Madenciliği:", data.error);
                return;
            }
            document.getElementById('stat-avg-temp').textContent = `${data.average_temperature} °C`;
            document.getElementById('stat-avg-hum').textContent = `${data.average_humidity} %`;
            document.getElementById('stat-insight').textContent = data.insight;
        })
        .catch(err => console.error("Analiz verisi alınamadı:", err))
        .finally(() => {
            if(icon) icon.classList.remove('fa-spin');
        });
}

// -------------------------
// YEREL ESP32 HTTP BAĞLANTISI (Doğrudan Cihazdan Veri Çekme)
// -------------------------
function initLocalESP32() {
    console.log(`Yerel ESP32 cihazına bağlanılıyor: http://${ESP_IP}`);
    addAlert("Yerel Bağlantı", `ESP32 (${ESP_IP}) üzerinden veri bekleniyor...`, "info");
    
    document.getElementById('led-sensor').className = "led status-healthy";
    document.getElementById('led-mqtt').className = "led"; // MQTT Pasif
    document.getElementById('led-db').className = "led";   // DB pasif
    
    // Her 2 saniyede bir verileri çek (Polling)
    setInterval(() => {
        fetch(`http://${ESP_IP}/api/data`)
            .then(res => res.json())
            .then(data => {
                // UI Güncellemeleri
                updateSensorUI('sicaklik', data.temp);
                updateSensorUI('nem', data.hum);
                updateSensorUI('isik', data.ldr);
                updateSensorUI('toprak', data.soil);
                updateSensorUI('yagmur', data.rain);
                
                // Röle durumlarını otonom moddayken web'e yansıtma (manuel moddaysa Web tabanlı karar geçerlidir)
                const overrideMode = document.getElementById('override-toggle').checked;
                if (!overrideMode) {
                    // Cihazdan okunan durumu doğrudan UI üzerine yaz
                    updateControlUI('led', data.light ? 'ON' : 'OFF');
                    updateControlUI('pump', data.pump ? 'ON' : 'OFF');
                    updateControlUI('fan', data.fan ? 'ON' : 'OFF');
                    
                    // OTONOM ZEKAYI ÇALIŞTIR
                    runAutonomousLogic(data);
                }
            })
            .catch(err => {
                console.warn("ESP32 API Bekleyişi... Lütfen cihaz bağlantısını kontrol edin.");
            });
    }, 2000);
    
    // Buton eventlerini HTTP için ayarla
    setupLocalManualOverride();
}

function setupLocalManualOverride() {
    const relays = {
        'relay-fan': 'fan',
        'relay-led': 'led',
        'relay-pump': 'pump'
    };

    for(const id in relays) {
        const toggle = document.getElementById(id);
        const device = relays[id];
        
        // Önceki event listenerların çakışmaması için basit kontrol
        toggle.addEventListener('click', (e) => {
            const overrideMode = document.getElementById('override-toggle').checked;
            if (overrideMode) {
                const cmd = e.target.checked ? 'ON' : 'OFF';
                fetch(`http://${ESP_IP}/api/control?device=${device}&state=${cmd}`)
                    .then(() => {
                        addAlert('Manuel Kontrol', `${device.toUpperCase()} -> ${cmd} komutu ESP32'ye iletildi.`, 'warning');
                    })
                    .catch(err => {
                        addAlert('Bağlantı Hatası', `Komut iletilemedi. Lütfen cihazı kontrol edin.`, 'danger');
                        e.preventDefault(); 
                    });
            } else {
                e.preventDefault(); 
            }
        });
    }
}

// -------------------------
// OTONOM KARAR ALGORİTMASI
// -------------------------
let lastAutonomousActionTime = 0; // Çok sık işlem yapmayı engellemek için

function runAutonomousLogic(data) {
    const now = Date.now();
    // Her 5 saniyede bir değerlendirme yap
    if (now - lastAutonomousActionTime < 5000) return;

    let actionTaken = false;

    // 1. KURAL: SICAKLIK KONTROLÜ (Hedef 22-26°C)
    if (data.temp > 26 && data.fan === false) {
        setRelayAutonomous('fan', 'ON');
        addAlert("Yüksek Sıcaklık", `Sıcaklık yüksek (${data.temp}°C). Soğutma Fanı çalıştırıldı.`, "warning");
        actionTaken = true;
    } else if (data.temp <= 24 && data.fan === true) {
        setRelayAutonomous('fan', 'OFF');
        addAlert("Sıcaklık Normale Döndü", "Fan durduruldu.", "info");
        actionTaken = true;
    }

    // 2. KURAL: TOPRAK NEMİ KONTROLÜ (Kapasitif Sensör genelde >3000 Kuru, <2000 Islak)
    // Değerler kullandığınız sensörün kalibrasyonuna göre değişebilir.
    if (data.soil > 3000 && data.pump === false) {
         setRelayAutonomous('pump', 'ON');
         addAlert("Toprak Kurudu", `Nem seviyesi kritik (${data.soil}). Su Pompası devreye alındı.`, "warning");
         actionTaken = true;
    } else if (data.soil < 2000 && data.pump === true) {
         setRelayAutonomous('pump', 'OFF');
         addAlert("Yeterli Sulama", "Toprak neme doydu. Pompa durduruldu.", "info");
         actionTaken = true;
    }

    // 3. KURAL: IŞIK ŞİDDETİ (LDR < 1000 Karanlık, > 2000 Aydınlık vs.)
    if (data.ldr < 1000 && data.light === false) {
         setRelayAutonomous('led', 'ON');
         addAlert("Güneş Yetersiz", "Sera karanlık. Fotosentez için Grow LED açıldı.", "info");
         actionTaken = true;
    } else if (data.ldr >= 1500 && data.light === true) {
         setRelayAutonomous('led', 'OFF');
         addAlert("Yeterli Gün Işığı", "Grow LED kapatıldı, enerji tasarrufu sağlanıyor.", "info");
         actionTaken = true;
    }

    if (actionTaken) {
        lastAutonomousActionTime = now;
    }
}

function setRelayAutonomous(device, state) {
    // Gerçek cihaz üzerinde uygula, fetch ile:
    fetch(`http://${ESP_IP}/api/control?device=${device}&state=${state}`)
        .then(() => console.log(`Otonom Karar: ${device} -> ${state}`))
        .catch(e => console.error("Otonom Komut Hatası:", e));
}

// Sayfa yüklendiğinde modeli belleğe al
window.addEventListener('DOMContentLoaded', () => {
    loadTFModel();
    
    // Otonom AI Analiz Döngüsü (Her 30 saniyede bir)
    setInterval(() => {
        const overrideToggle = document.getElementById('override-toggle');
        // Eğer manuel moddaysa (checked) otonom AI çalışmasın
        if (overrideToggle && overrideToggle.checked) return;

        const imgEl = document.getElementById('video-stream');
        // Görüntü yoksa veya kullanıcı kendi fotoğraf yüklediyse ('blob:') analiz etme
        if (!imgEl || !imgEl.src || imgEl.src.includes('R0lGODlhAQABAIAAAAAAAP') || imgEl.src.startsWith('blob:')) {
            return;
        }

        console.log("Otonom AI Analizi tetiklendi...");
        predictImage(imgEl);
    }, 30000); // 30 saniye
});
