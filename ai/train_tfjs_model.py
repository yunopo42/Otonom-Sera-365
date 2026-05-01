import os
import tensorflow as tf
from tensorflow.keras.preprocessing.image import ImageDataGenerator
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras.layers import Dense, GlobalAveragePooling2D, Dropout
from tensorflow.keras.models import Model
import tensorflowjs as tfjs

# VERİ SETİ YOLLARI (Klasör isimlerini kendi sistemine göre düzenleyebilirsin)
# Eğer bu dosya 'ai' klasörünün içindeyse ve 'tomatoModel' ana dizindeyse yollar şu şekilde olmalı:
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRAIN_DIR = os.path.join(BASE_DIR, 'tomatoModel', 'Tomato Leaf Disease', 'train')
VALID_DIR = os.path.join(BASE_DIR, 'tomatoModel', 'Tomato Leaf Disease', 'test') # Eğer test veya validasyon varsa
MODEL_SAVE_DIR = os.path.join(BASE_DIR, 'dist', 'model') # Veya 'public/model' gibi bir klasör

# 10 Sınıf için Hyperparametreler
IMG_SIZE = (224, 224)
BATCH_SIZE = 32
EPOCHS = 10 # Hızlı sonuç için 10, başarıyı artırmak için 20-30 yapılabilir.
NUM_CLASSES = 10

def build_model():
    # Web'de hızlı çalışması için MobileNetV2 altyapısını (Transfer Learning) kullanıyoruz.
    base_model = MobileNetV2(weights='imagenet', include_top=False, input_shape=(224, 224, 3))
    
    # Base modelin ağırlıklarını dondur (Hızlı eğitim için)
    base_model.trainable = False
    
    # Sınıflandırıcı katmanlar ekle
    x = base_model.output
    x = GlobalAveragePooling2D()(x)
    x = Dense(128, activation='relu')(x)
    x = Dropout(0.5)(x) # Aşırı öğrenmeyi (Overfitting) engellemek için
    predictions = Dense(NUM_CLASSES, activation='softmax')(x)
    
    model = Model(inputs=base_model.input, outputs=predictions)
    
    model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])
    return model

def train_and_export():
    print(f"Eğitim verisi aranıyor: {TRAIN_DIR}")
    
    if not os.path.exists(TRAIN_DIR):
        print("HATA: Eğitim klasörü bulunamadı!")
        return

    # Veri artırma ve yükleme (Data Augmentation)
    train_datagen = ImageDataGenerator(
        rescale=1./255,
        rotation_range=20,
        width_shift_range=0.2,
        height_shift_range=0.2,
        horizontal_flip=True,
        validation_split=0.2 # Test klasörü yoksa %20'sini validasyon için kullan
    )

    # Eğitim verisi seti
    train_generator = train_datagen.flow_from_directory(
        TRAIN_DIR,
        target_size=IMG_SIZE,
        batch_size=BATCH_SIZE,
        class_mode='categorical',
        subset='training'
    )

    # Doğrulama (Validation) verisi seti
    val_generator = train_datagen.flow_from_directory(
        TRAIN_DIR,
        target_size=IMG_SIZE,
        batch_size=BATCH_SIZE,
        class_mode='categorical',
        subset='validation'
    )

    # Modeli oluştur
    print("Model oluşturuluyor...")
    model = build_model()

    # Modeli eğit
    print("Model eğitimi başlıyor...")
    model.fit(
        train_generator,
        epochs=EPOCHS,
        validation_data=val_generator
    )

    # Sınıf isimlerini kaydet
    class_indices = train_generator.class_indices
    classes = {v: k for k, v in class_indices.items()}
    print("\n--- Sınıf İndeksleri ---")
    for i in range(NUM_CLASSES):
        print(f"{i}: {classes[i]}")

    # TensorFlow.js formatında dışa aktarma (Klasör yoksa oluşturulur)
    if not os.path.exists(MODEL_SAVE_DIR):
        os.makedirs(MODEL_SAVE_DIR)

    print(f"\nModel TFJS formatına dönüştürülüyor ve kaydediliyor: {MODEL_SAVE_DIR}")
    # Modeli Keras (.h5) formatında geçici olarak kaydedip sonra tfjs'ye çeviriyoruz
    temp_h5_path = os.path.join(BASE_DIR, 'ai', 'temp_model.h5')
    model.save(temp_h5_path)
    
    # TensorFlowJS kütüphanesi kullanarak dönüştürme işlemi
    tfjs.converters.save_keras_model(model, MODEL_SAVE_DIR)
    
    print("\n[BAŞARILI] Eğitim tamamlandı ve web uyumlu (TFJS) model dosyaları çıkarıldı!")
    print("dist/model klasörü altındaki 'model.json' ve '.bin' dosyalarını web projesinde kullanabilirsiniz.")

if __name__ == "__main__":
    print("UYARI: Bu scripti çalıştırmadan önce 'pip install tensorflow tensorflowjs' komutu ile gerekli kütüphaneleri kurduğunuzdan emin olun.\n")
    train_and_export()
