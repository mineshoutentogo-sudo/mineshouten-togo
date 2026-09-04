-- 峯商店 — إعدادات عامة للموقع (أول استخدام: وضع الصيانة من تبويب "メンテナンス" بلوحة الإدارة)
-- الصق هذا بالكامل في D1 Console وشغّله مرة واحدة (بعد تنفيذ 0001_init.sql، 0002_fulfillment.sql، 0003_admin_features.sql مسبقًا)

-- جدول عام key/value لإعدادات الموقع. maintenance_mode='1' يعني الموقع مغلق للصيانة
-- (يُقرأ من functions/_middleware.js على كل طلب لصفحة عامة). القيم الفارغة تعني
-- "استخدم النص الافتراضي" في صفحة الصيانة نفسها.
CREATE TABLE IF NOT EXISTS site_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO site_settings (key, value) VALUES
  ('maintenance_mode', '0'),
  ('maintenance_message', ''),
  ('maintenance_eta', '');
