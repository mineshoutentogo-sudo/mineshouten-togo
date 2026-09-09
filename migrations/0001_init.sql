-- 峯商店 — قاعدة بيانات الطلبات (Cloudflare D1)
-- الصق هذا المحتوى بالكامل في لوحة D1 → Console وشغّله مرة واحدة (خطوة 2 من دليل التطبيق)

CREATE TABLE IF NOT EXISTS orders (
  id               TEXT PRIMARY KEY,              -- معرّف الدفعة من KOMOJU (payment.id)
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  status           TEXT NOT NULL,                 -- captured / authorized
  customer_name    TEXT,
  customer_phone   TEXT,
  customer_email   TEXT,
  customer_pref    TEXT,                          -- مفتاح منطقة الشحن (kanto, kyushu, okinawa ...)
  customer_postal  TEXT,
  customer_address TEXT,
  subtotal         INTEGER NOT NULL,               -- مجموع المنتجات قبل الشحن (ين)
  shipping_fee     INTEGER NOT NULL,               -- رسوم الشحن (ين)
  amount           INTEGER NOT NULL,               -- الإجمالي المدفوع فعليًا (ين)
  order_summary    TEXT                             -- نص وصفي مختصر لسطور الطلب
);

CREATE TABLE IF NOT EXISTS order_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     TEXT NOT NULL REFERENCES orders(id),
  product_id   TEXT NOT NULL,                       -- set3 / set5 / chicken / teacake / coffeecake / scone
  product_name TEXT NOT NULL,
  quantity     INTEGER NOT NULL,
  unit_price   INTEGER NOT NULL,                    -- السعر وقت الطلب فعليًا (سجل تاريخي ثابت، لا يتغيّر لو تغيّر السعر لاحقًا)
  UNIQUE(order_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
