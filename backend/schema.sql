-- SeraProjesiUI - Supabase Sensör Verileri Tablosu

CREATE TABLE sensor_verileri (
    id SERIAL PRIMARY KEY,
    tur VARCHAR(50) NOT NULL,
    deger FLOAT NOT NULL,
    zaman TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- (Eğer Row Level Security yüzünden sorun yaşamak istemiyorsanız test amaçlı devre dışı bırakabilirsiniz)
-- ALTER TABLE sensor_verileri DISABLE ROW LEVEL SECURITY;
