-- ==============================================
-- SERAPRO 360 AI - SUPABASE VERİTABANI KURULUMU
-- ==============================================

-- 1. SENSÖR VERİLERİ TABLOSU
-- Sensörlerden gelen tüm geçmiş verilerin loglanacağı tablo.
CREATE TABLE public.sensor_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    temperature NUMERIC,
    humidity NUMERIC,
    soil_moisture NUMERIC,
    light NUMERIC,
    rain NUMERIC
);

-- 2. YAPAY ZEKA (AI) HASTALIK TESPİT LOGLARI
-- Kameranın tespit ettiği hastalıkların ve resim linklerinin loglanacağı tablo.
CREATE TABLE public.ai_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    disease_class VARCHAR(255) NOT NULL,
    confidence NUMERIC NOT NULL,
    image_url TEXT,
    treatment_advice TEXT
);

-- 3. STORAGE BUCKET (Resimleri Depolamak İçin)
-- 'disease_images' adında, herkesin okuyabildiği (public) bir bucket oluştururuz.
-- Not: Supabase arayüzünden Storage menüsüne girip 'disease_images' adında Public bir Bucket açmayı unutmayın!

-- 4. ANALİZ İÇİN İNDEKSLER (Performans Optimizasyonu)
CREATE INDEX idx_sensor_logs_created_at ON public.sensor_logs(created_at);
CREATE INDEX idx_ai_logs_created_at ON public.ai_logs(created_at);

-- 5. ENDÜSTRİYEL VERİMLİLİK İSTATİSTİKLERİ TABLOSU
CREATE TABLE public.industrial_stats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    energy_kwh NUMERIC,
    water_saved_liters NUMERIC,
    labor_saved_hours NUMERIC,
    efficiency_score NUMERIC
);
ALTER TABLE public.industrial_stats DISABLE ROW LEVEL SECURITY;
