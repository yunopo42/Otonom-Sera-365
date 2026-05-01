import pandas as pd
import random
import os

# Sera için sahte sensör verisi üretimi
# Sensörler: Sicaklik, Nem, Isik (Lux), Toprak_Nemi, Yagmur (1: yağış var, 0: yok)
# Hedef Sınıflar (Class): Fan_Durumu (1/0), Pompa_Durumu (1/0), Led_Durumu (1/0), Isitici_Durumu (1/0)

def generate_mock_data(num_samples=5000):
    data = []
    for _ in range(num_samples):
        temp = round(random.uniform(10.0, 40.0), 1)
        humidity = random.randint(30, 95)
        light = random.randint(0, 15000)
        soil_moisture = random.randint(10, 100)
        rain = random.choice([0, 1])

        # Otonom Kurallar (Eğitim seti için etiketleme)
        fan = 1 if temp > 28 or (temp > 25 and humidity > 75) else 0
        pump = 1 if soil_moisture < 40 else 0
        led = 1 if light < 3000 else 0
        heater = 1 if temp < 18 else 0

        data.append([temp, humidity, light, soil_moisture, rain, fan, pump, led, heater])

    columns = ['Sıcaklık', 'Nem', 'Işık', 'Toprak_Nemi', 'Yağmur', 
               'Fan_Durumu', 'Pompa_Durumu', 'Led_Durumu', 'Isıtıcı_Durumu']
    
    df = pd.DataFrame(data, columns=columns)
    
    file_path = os.path.join(os.path.dirname(__file__), 'sera_dataset.csv')
    df.to_csv(file_path, index=False)
    print(f"Başarıyla {num_samples} satırlık veri üretildi: {file_path}")

if __name__ == '__main__':
    generate_mock_data()
