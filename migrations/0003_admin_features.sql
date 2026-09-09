-- 峯商店 — لوحة الإدارة: تسعير ديناميكي + مصدر الطلب + وقت آخر تعديل
-- الصق هذا بالكامل في D1 Console وشغّله مرة واحدة (بعد تنفيذ 0001_init.sql و0002_fulfillment.sql مسبقًا)

-- سعر كل منتج (يُعدَّل من تبويب "設定" بلوحة الإدارة). إن لم يوجد صف لمنتج ما،
-- يُستخدَم السعر الثابت من كتالوج PRODUCTS في helpers.js كقيمة افتراضية آمنة.
CREATE TABLE IF NOT EXISTS product_prices (
  product_id TEXT PRIMARY KEY,
  price      INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- القيم الحالية (تطابق كتالوج PRODUCTS وقت كتابة هذا الملف) — نقطة بداية فقط،
-- تُعدَّل لاحقًا من لوحة الإدارة دون الحاجة لتشغيل SQL يدويًا مرة أخرى.
INSERT OR IGNORE INTO product_prices (product_id, price) VALUES
  ('set3', 2700),
  ('set5', 4500),
  ('chicken', 900),
  ('teacake', 2800),
  ('coffeecake', 2800),
  ('scone', 900);

-- 'online' = عبر KOMOJU (الافتراضي، يطابق كل الطلبات الحالية) / 'manual' = أُضيف يدويًا من لوحة الإدارة
ALTER TABLE orders ADD COLUMN source TEXT NOT NULL DEFAULT 'online';

-- وقت آخر تعديل يدوي على الطلب من لوحة الإدارة (NULL = لم يُعدَّل قط)
ALTER TABLE orders ADD COLUMN updated_at TEXT;
