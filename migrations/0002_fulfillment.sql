-- 峯商店 — إضافة تتبّع حالة الشحن الفعلي للطلبات (منفصل عن حالة الدفع payment status)
-- الصق هذا بالكامل في D1 Console وشغّله مرة واحدة (بعد تنفيذ 0001_init.sql مسبقًا)

ALTER TABLE orders ADD COLUMN shipped_status TEXT NOT NULL DEFAULT 'pending'; -- 'pending' | 'shipped'
ALTER TABLE orders ADD COLUMN tracking_number TEXT;
ALTER TABLE orders ADD COLUMN shipped_at TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_shipped_status ON orders(shipped_status);
