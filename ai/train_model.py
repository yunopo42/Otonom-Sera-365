import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.multioutput import MultiOutputClassifier
from sklearn.metrics import accuracy_score
import joblib
import os

def train():
    file_path = os.path.join(os.path.dirname(__file__), 'sera_dataset.csv')
    
    if not os.path.exists(file_path):
        print("CSV bulunamadı! Önce generate_dataset.py çalıştırın.")
        return

    print("Veri yükleniyor...")
    df = pd.read_csv(file_path)

    # Girdi (Features)
    X = df[['Sıcaklık', 'Nem', 'Işık', 'Toprak_Nemi', 'Yağmur']]
    
    # Çıktı (Targets/Labels)
    Y = df[['Fan_Durumu', 'Pompa_Durumu', 'Led_Durumu', 'Isıtıcı_Durumu']]

    # %80 Eğitim, %20 Test olarak ayırma
    X_train, X_test, Y_train, Y_test = train_test_split(X, Y, test_size=0.2, random_state=42)

    print("Model eğitiliyor (RandomForest)...")
    # Çoklu çıktı destekleyen model sarmalayıcısı (Her donanım için ayrı tahminde bulunur)
    forest = RandomForestClassifier(n_estimators=100, random_state=42)
    model = MultiOutputClassifier(forest)
    
    model.fit(X_train, Y_train)

    print("Eğitim tamamlandı, test yapılıyor...")
    Y_pred = model.predict(X_test)
    
    # Tüm sınıflar üzerindeki ortalama doğruluk hesaplanır
    acc = accuracy_score(Y_test, Y_pred)
    print(f"Model Doğruluğu (Accuracy): %{acc * 100:.2f}")

    # Modeli diske kaydetme
    model_path = os.path.join(os.path.dirname(__file__), 'sera_ai_model.pkl')
    joblib.dump(model, model_path)
    print(f"AI Modeli kaydedildi: {model_path}")

if __name__ == '__main__':
    train()
