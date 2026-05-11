// app.js - SeroPro UI Logic & Mock Data Simulation

// --- AYARLAR ---
// ESP32'nin bağlandığı IP adresi:
const ESP_IP = "10.73.82.223";

// --- SUPABASE AYARLARI ---
const SUPABASE_URL = "https://jtlnqbkigtcgnvmouwit.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0bG5xYmtpZ3RjZ252bW91d2l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MTcwMzUsImV4cCI6MjA5MjA5MzAzNX0.J8wYFU-6VAH_0Mp2GOHafJTj-1xQWT92_Dsgdp9Er1Y"; // <-- BURAYA DASHBOARD'DAN ALDIĞINIZ ANON KEY'İ YAPIŞTIRIN
let supabaseClient = null;

if (typeof supabase !== 'undefined') {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

document.addEventListener("DOMContentLoaded", () => {
    initClock();
    initChart();
    loadTFModel();
    fetchAnalytics(); // Veri madenciliği panelini doldur

    // Uygulama Durumunu Geri Yükle (Hafızadan)
    restoreAppState();

    // Bulut ortamında (Netlify vb.) miyiz yoksa lokalde (localhost/file) miyiz kontrol et
    window.isCloudEnvironment = window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1' &&
        window.location.protocol !== 'file:';

    if (ESP_IP && !window.isCloudEnvironment) {
        initLocalESP32();
    } else if (window.isCloudEnvironment) {
        console.log("Bulut ortamı algılandı. Yerel ESP32 (HTTP) istekleri devre dışı bırakıldı, sadece MQTT kullanılacak.");
    }

    // MQTT her durumda başlatılmalı (Özellikle Kamera yayını bulut üzerinden geldiği için)
    initMQTT();

    // Otonom AI Analiz Döngüsü (Her 30 saniyede bir kamera görüntüsünü analiz et)
    setInterval(() => {
        const overrideToggle = document.getElementById('override-toggle');
        if (overrideToggle && overrideToggle.checked) return; // Manuel moddaysa çalışmasın

        const imgEl = document.getElementById('video-stream');
        if (!imgEl || !imgEl.src || imgEl.src.includes('R0lGODlhAQABAIAAAAAAAP') || imgEl.src.startsWith('blob:')) {
            return;
        }

        console.log("Otonom AI Analizi tetiklendi...");
        predictImage(imgEl);
    }, 30000);
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
    const labels = Array.from({ length: 12 }, (_, i) => `${i * 2}:00`);
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
window.toggleManualOverride = function (toggleEl, fromNetwork = false) {
    const isManual = toggleEl.checked;

    // Modu hafızaya kaydet
    localStorage.setItem('seraMode', isManual ? 'MANUAL' : 'AUTO');

    // Ağdan gelmediyse, benim basışımı tüm cihazlara yay
    if (!fromNetwork) {
        if (window.mqttClient) {
            window.mqttClient.publish('sera/control/mode', isManual ? 'MANUAL' : 'AUTO', { retain: true });
        }
        if (supabaseClient && SUPABASE_ANON_KEY !== "BURAYA_SUPABASE_ANON_KEY_GELECEK") {
            supabaseClient.from('device_states').update({ state: isManual ? 'MANUAL' : 'AUTO' }).eq('device', 'systemMode').then();
        }
    }

    // Get all override controls (relay checkboxes)
    const relayToggles = document.querySelectorAll('.override-control input[type="checkbox"]');

    relayToggles.forEach(relay => {
        // In manual mode, user can control them. In autonomous mode, they are disabled (controlled by AI/Code)
        relay.disabled = !isManual;

        // Add event listeners if manual, to update UI texts dynamically
        if (isManual) {
            relay.onchange = function () {
                updateRelayUI(this.id, this.checked);
            }
        } else {
            relay.onchange = null;
        }
    });

    // Visual feedback
    if (isManual) {
        addAlert("Manuel Kontrol Aktif", "Sistem otonom kararları devre dışı bırakıldı. Kontrol sizde.", "warning");
    } else {
        addAlert("Otonom Mod Aktif", "Uzman sistem kararları devrede. Röleler otomatik yönetilecek.", "info");
    }
}

// Uygulama açılışında en son durumu backend'den ve localStorage'dan geri yükle
function restoreAppState() {
    console.log("Uygulama durumu geri yükleniyor...");

    // Eğer Supabase yapılandırıldıysa doğrudan Supabase'den çek
    if (supabaseClient && SUPABASE_ANON_KEY !== "BURAYA_SUPABASE_ANON_KEY_GELECEK") {
        supabaseClient
            .from('device_states')
            .select('*')
            .then(({ data, error }) => {
                if (error || !data) {
                    console.error("Supabase'den durum alınamadı:", error);
                    return;
                }

                let statusMap = {};
                data.forEach(item => {
                    statusMap[item.device] = { state: item.state };
                });

                // 1. Modu Geri Yükle
                const overrideToggle = document.getElementById('override-toggle');
                if (statusMap['systemMode'] && statusMap['systemMode'].state === 'MANUAL') {
                    overrideToggle.checked = true;
                    toggleManualOverride(overrideToggle, true);
                } else {
                    overrideToggle.checked = false;
                    toggleManualOverride(overrideToggle, true);
                }

                // 2. Röle Durumlarını Geri Yükle
                ['fan', 'pump', 'led'].forEach(device => {
                    if (statusMap[device]) {
                        const isChecked = statusMap[device].state === 'ON';
                        const toggleId = `relay-${device}`;
                        const toggleEl = document.getElementById(toggleId);
                        if (toggleEl) {
                            toggleEl.checked = isChecked;
                            updateRelayUI(toggleId, isChecked);
                        }
                    }
                });

                // Supabase Realtime'ı başlat (Diğer cihazlardan anlık güncellemeleri dinle)
                initSupabaseRealtime();
            });
    } else {
        // Eski yöntem (Render Backend'den çek, Supabase KEY eklenene kadar çalışır)
        fetch('https://otonom-sera-365.onrender.com/api/device-status')
            .then(res => res.json())
            .then(statusMap => {
                const overrideToggle = document.getElementById('override-toggle');
                if (statusMap.systemMode === 'MANUAL') {
                    overrideToggle.checked = true;
                    toggleManualOverride(overrideToggle, true);
                } else {
                    overrideToggle.checked = false;
                    toggleManualOverride(overrideToggle, true);
                }

                for (const device in statusMap) {
                    if (device === 'systemMode') continue;
                    const isChecked = statusMap[device].state === 'ON';
                    const toggleId = `relay-${device}`;
                    const toggleEl = document.getElementById(toggleId);
                    if (toggleEl) {
                        toggleEl.checked = isChecked;
                        updateRelayUI(toggleId, isChecked);
                    }
                }
            })
            .catch(err => {
                console.warn("Başlangıç durumları backend'den alınamadı, yerel hafıza deneniyor:", err);
                const savedMode = localStorage.getItem('seraMode');
                const overrideToggle = document.getElementById('override-toggle');
                if (savedMode === 'MANUAL') {
                    overrideToggle.checked = true;
                    toggleManualOverride(overrideToggle, true);
                }
            });
    }
}

function initSupabaseRealtime() {
    supabaseClient
        .channel('device-updates')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'device_states' }, payload => {
            console.log("Supabase Realtime Güncellemesi:", payload.new);
            const device = payload.new.device;
            const state = payload.new.state;

            if (device === 'systemMode') {
                const overrideToggle = document.getElementById('override-toggle');
                const isManual = (state === 'MANUAL');
                if (overrideToggle && overrideToggle.checked !== isManual) {
                    overrideToggle.checked = isManual;
                    toggleManualOverride(overrideToggle, true); // true = fromNetwork (sonsuz döngüyü engeller)
                }
            } else if (['fan', 'pump', 'led'].includes(device)) {
                const isChecked = (state === 'ON');
                const toggleId = `relay-${device}`;
                const toggleEl = document.getElementById(toggleId);
                if (toggleEl && toggleEl.checked !== isChecked) {
                    toggleEl.checked = isChecked;
                    updateRelayUI(toggleId, isChecked);
                }
            }
        })
        .subscribe();
}

function updateRelayUI(id, isChecked) {
    let statusId = "";
    if (id === "relay-fan") statusId = "status-fan";
    if (id === "relay-led") statusId = "status-led";
    if (id === "relay-pump") statusId = "status-pump";

    const statusEl = document.getElementById(statusId);
    if (statusEl) {
        if (isChecked) {
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

function addAlert(title, message, type = "info", isCritical = false) {
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
    if (list.children.length > 10) {
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

        document.getElementById('led-mqtt').className = "led green";
        document.getElementById('led-db').className = "led green";
        document.getElementById('led-sensor').className = "led green";

        // Kanallara abone (Subscribe) ol
        client.subscribe('sera/sensor/#');
        client.subscribe('sera/control/#');  // UI'dan giden komutların geri yankısı
        client.subscribe('sera/status/#');   // ESP32'den gelen röle durum bildirimleri
        client.subscribe('sera/kamera'); // Resimlere de abone ol
    });

    client.on('message', function (topic, message) {
        console.log("MQTT Mesaj Geldi -> Konu:", topic, "Boyut:", message.length);

        // 1. KAMERA GÖRÜNTÜSÜ
        if (topic === 'sera/kamera' || topic === 'sera/camera') {
            try {
                console.log("[CAM] Mesaj alindi! Boyut:", message.length, "byte");

                const firstByte = new Uint8Array(message)[0];
                let base64String;

                if (firstByte === 0xFF) {
                    // Ham JPEG binary → base64'e çevir
                    const bytes = new Uint8Array(message);
                    let binary = '';
                    for (let i = 0; i < bytes.byteLength; i++) {
                        binary += String.fromCharCode(bytes[i]);
                    }
                    base64String = window.btoa(binary);
                    console.log("[CAM] Mod: Ham JPEG → base64 cevrimi yapildi");
                } else {
                    // Base64 string (ESP32-CAM'den) → direkt al
                    base64String = message.toString();
                    console.log("[CAM] Mod: Base64 string alindi");
                }

                // ÖNEMLİ: Arduino base64 kütüphanesi her 76 karakterde \n ekler.
                // Bu karakterler data URL'yi bozar → görüntü render edilmez.
                // Tüm whitespace karakterlerini temizle:
                base64String = base64String.replace(/[\r\n\t ]/g, '');

                console.log("[CAM] Islenen base64 uzunlugu:", base64String.length);
                console.log("[CAM] Ilk 50 karakter:", base64String.substring(0, 50));
                // /9j/ ile baslamiyorsa JPEG degil demektir
                if (!base64String.startsWith('/9j/')) {
                    console.warn("[CAM] UYARI: Base64 /9j/ ile baslamıyor! Gelen veri JPEG olmayabilir.");
                }

                const imgEl = document.getElementById('video-stream');
                if (imgEl) {
                    imgEl.src = 'data:image/jpeg;base64,' + base64String;
                    imgEl.style.display = 'block';
                    const fallbackEl = document.getElementById('stream-fallback');
                    if (fallbackEl) fallbackEl.style.display = 'none';
                    console.log("[CAM] imgEl.src guncellendi. Goruntu yukleniyor...");
                } else {
                    console.error("[CAM] HATA: 'video-stream' elementi bulunamadi!");
                }
            } catch (e) {
                console.error("[CAM] Kamera verisi isleme hatasi:", e);
            }
            return;
        }

        const payload = message.toString();
        const parts = topic.split('/');
        const category = parts[1]; // 'sensor', 'control' veya 'status'
        const endpoint = parts[2]; // 'sicaklik', 'fan', 'mode' vb.

        // 2. MOD VE CİHAZ SENKRONİZASYONU
        // sera/control/ = UI'dan ESP32'ye giden komutlar (mod degisikligi vs.)
        // sera/status/  = ESP32'den UI'ya gelen röle durum bildirimleri
        if (category === 'control' || category === 'status') {
            if (endpoint === 'mode') {
                const overrideEl = document.getElementById('override-toggle');
                const isManual = (payload === 'MANUAL');
                if (overrideEl && overrideEl.checked !== isManual) {
                    overrideEl.checked = isManual;
                    toggleManualOverride(overrideEl, true);
                }
            } else if (['fan', 'led', 'pump'].includes(endpoint)) {
                const isON = (payload === 'ON');
                const toggleId = `relay-${endpoint}`;
                const toggleEl = document.getElementById(toggleId);
                // Sadece 'status' kanalından gelen bildirimlerle UI'yı güncelle
                // 'control' kanalından gelen yankiyi yoksay (kendi gönderdiğimiz komut)
                if (category === 'status' && toggleEl && toggleEl.checked !== isON) {
                    toggleEl.checked = isON;
                    updateRelayUI(toggleId, isON);
                }
            }
        }

        // 3. SENSÖR VERİLERİ
        if (category === 'sensor') {
            updateSensorUI(endpoint, payload);
        }
    });

    setupManualOverridePublishers(client);
}

// -------------------------
// CANLI UI GÜNCELLEMELERİ
// -------------------------
function updateSensorUI(type, value) {
    // MQTT string olarak gönderir, parseFloat ile sayıya çevir
    const numVal = parseFloat(value);
    if (isNaN(numVal)) return;

    if (type === 'sicaklik') {
        document.getElementById('val-temp').innerText = numVal.toFixed(1);
        updateMainChartData(0, numVal); // 0. Dataset Sıcaklık
        updateCircularProgress('.circular-chart.orange .circle', numVal, 50);
    }
    else if (type === 'nem') {
        document.getElementById('val-hum').innerText = Math.round(numVal);
        updateMainChartData(1, numVal); // 1. Dataset Nem
        updateCircularProgress('.circular-chart.blue .circle', numVal, 100);
    }
    else if (type === 'isik') {
        document.getElementById('val-light').innerText = Math.round(numVal);
        updateCircularProgress('.circular-chart.yellow .circle', numVal, 4095);
    }
    else if (type === 'toprak') {
        const soilEl = document.getElementById('val-soil');
        if (soilEl) soilEl.innerText = Math.round(numVal);

        // 4095 kuru, 0 çok ıslak. Ters orantı ile nem yüzdesi gibi gösterelim (sadece grafik için)
        // Ya da direkt değeri 4095'e bölerek dolduralım:
        updateCircularProgress('.circular-chart.green .circle', numVal, 4095);
    }
    else if (type === 'yagmur') {
        const rainEl = document.getElementById('val-rain');
        if (rainEl) rainEl.innerText = Math.round(numVal);

        updateCircularProgress('.circular-chart.cyan .circle', numVal, 4095);
    }
}

function updateCircularProgress(selector, value, maxVal) {
    const el = document.querySelector(selector);
    if (el) {
        let percent = (value / maxVal) * 100;
        if (percent > 100) percent = 100;
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

        // AI Kararını Supabase'e Yaz (Diğer cihazlara yayılması için)
        if (supabaseClient && SUPABASE_ANON_KEY !== "BURAYA_SUPABASE_ANON_KEY_GELECEK") {
            supabaseClient.from('device_states').update({ state: action }).eq('device', device).then();
        }

        const overrideEl = document.getElementById('override-toggle');
        if (!overrideEl.checked) {
            addAlert("AI Kararı", `Sistem otonom olarak ${device} donanımını ${action.replace('ON', 'AÇTI').replace('OFF', 'KAPATTI')}.`, "info");
        }
    }
}

function updateMainChartData(datasetIndex, newValue) {
    if (!mainChart) return;
    const dataset = mainChart.data.datasets[datasetIndex];
    if (dataset.data.length > 20) {
        dataset.data.shift(); // Sol baştakini at
        if (datasetIndex === 0) {
            const now = new Date();
            mainChart.data.labels.shift();
            mainChart.data.labels.push(`${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`);
        }
    } else {
        if (datasetIndex === 0) {
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

    for (const id in relays) {
        const toggle = document.getElementById(id);
        const topic = relays[id];

        toggle.addEventListener('click', (e) => {
            const overrideMode = document.getElementById('override-toggle').checked;
            if (overrideMode) {
                const cmd = e.target.checked ? 'ON' : 'OFF';
                client.publish(topic, cmd, { retain: true });

                // Supabase'e Yaz (Diğer cihazları anında güncellemek için)
                if (supabaseClient && SUPABASE_ANON_KEY !== "BURAYA_SUPABASE_ANON_KEY_GELECEK") {
                    const devName = id.replace('relay-', '');
                    supabaseClient.from('device_states').update({ state: cmd }).eq('device', devName).then();
                }

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
// Manuel Analiz Tetikleyici (Butona basıldığında)
window.runManualAnalysis = function () {
    const imgEl = document.getElementById('video-stream');
    if (!imgEl || !imgEl.src || imgEl.src.includes('R0lGODlhAQABAIAAAAAAAP')) {
        addAlert("Hata", "Henüz bir görüntü ulaşmadı! Lütfen kameranın bağlanmasını bekleyin.", "danger");
        return;
    }

    addAlert("Analiz Başladı", "Görüntü yapay zeka modeline gönderiliyor...", "info");
    predictImage(imgEl);
}

window.capturePhoto = function () {
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
    if (fallbackEl) fallbackEl.style.display = 'none';

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
                if (!window.isCloudEnvironment) {
                    fetch(`http://${ESP_IP}/api/control?device=fan&state=ON`).catch(e => console.log(e));
                }
                // MQTT üzerinden de gönder
                if (window.mqttClient) {
                    window.mqttClient.publish('sera/control/fan', 'ON', { retain: true });
                }
                addAlert("Otonom Karar", "Hastalık riski nedeniyle fan sistemi (havalandırma) otomatik olarak çalıştırıldı.", "warning");
                updateRelayUI('relay-fan', true);
                const toggleEl = document.getElementById('relay-fan');
                if (toggleEl) toggleEl.checked = true;
            }
        }

        // Veritabanı ve Veri Madenciliği İçin Backend'e Gönder (Resim Dahil)
        try {
            const canvas = document.createElement("canvas");
            // Resmi çok büyük göndermemek için max 640px ile sınırla
            const MAX_SIZE = 640;
            let width = imgElement.naturalWidth || imgElement.width || 224;
            let height = imgElement.naturalHeight || imgElement.height || 224;

            if (width > MAX_SIZE) {
                height *= MAX_SIZE / width;
                width = MAX_SIZE;
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(imgElement, 0, 0, width, height);
            const base64Image = canvas.toDataURL("image/jpeg", 0.6); // Kaliteyi %60 yaparak boyutu iyice düşür

            fetch('https://otonom-sera-365.onrender.com/api/ai-log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    diseaseClass: result.name,
                    confidence: maxProb * 100,
                    treatmentAdvice: result.treatment,
                    base64Image: base64Image
                })
            }).catch(e => console.log("AI Log gönderilemedi:", e));
        } catch (e) {
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
    if (icon) icon.classList.add('fa-spin');

    fetch('https://otonom-sera-365.onrender.com/api/analytics')
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                console.warn("Veri Madenciliği:", data.error);
                return;
            }
            document.getElementById('stat-avg-temp').textContent = `${data.average_temperature} °C`;
            document.getElementById('stat-avg-hum').textContent = `${data.average_humidity} %`;
            document.getElementById('stat-insight').textContent = data.insight;

            // Endüstriyel Metrikleri Güncelle
            if (data.industrial_metrics) {
                document.getElementById('ind-energy').textContent = data.industrial_metrics.total_energy_kwh;
                document.getElementById('ind-water').textContent = data.industrial_metrics.water_saved_liters;
                document.getElementById('ind-labor').textContent = data.industrial_metrics.labor_saved_hours;
                document.getElementById('ind-score').textContent = data.industrial_metrics.efficiency_score;
            }

            // Veritabanı bağlı LED'ini yak
            const dbLed = document.getElementById('led-db');
            if (dbLed) dbLed.className = "led green";
        })
        .catch(err => {
            console.error("Analiz verisi alınamadı:", err);
            const dbLed = document.getElementById('led-db');
            if (dbLed) dbLed.className = "led"; // Hata durumunda griye çek
        })
        .finally(() => {
            if (icon) icon.classList.remove('fa-spin');
        });
}

// -------------------------
// YEREL ESP32 HTTP BAĞLANTISI (Doğrudan Cihazdan Veri Çekme)
// -------------------------
function initLocalESP32() {
    console.log(`Yerel ESP32 cihazına bağlanılıyor: http://${ESP_IP}`);
    addAlert("Yerel Bağlantı", `ESP32 (${ESP_IP}) üzerinden veri bekleniyor...`, "info");

    document.getElementById('led-sensor').className = "led green";
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

    for (const id in relays) {
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

// Otonom AI Analiz Döngüsü artık ana DOMContentLoaded bloğuna taşındı (satır 24-35).
