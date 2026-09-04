-- 峯商店 — جدولة تلقائية لوضع الصيانة (فتح/إغلاق الموقع تلقائيًا في وقت محدد مسبقًا)
-- الصق هذا بالكامل في D1 Console وشغّله مرة واحدة (بعد تنفيذ 0001~0004 مسبقًا)

-- ISO 8601 (UTC، مثلاً 2026-09-10T02:00:00.000Z). فارغ = لا يوجد حجز.
-- تُقرأ من functions/_lib/helpers.js (computeMaintenanceState) لحساب هل الموقع
-- مغلق الآن فعليًا: التفعيل اليدوي (maintenance_mode) أو داخل هذه النافذة الزمنية.
INSERT OR IGNORE INTO site_settings (key, value) VALUES
  ('maintenance_schedule_start', ''),
  ('maintenance_schedule_end', '');
