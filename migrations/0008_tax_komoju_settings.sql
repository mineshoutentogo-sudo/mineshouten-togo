-- 峯商店 — 消費税・KOMOJU手数料の表示設定（管理画面「設定」タブ）
-- 既存の汎用 site_settings テーブルに新しいキーを追加するだけなので、テーブル作成は不要。
-- 貼り付けて一度だけ実行してください（0001〜0007 実行済みの前提）。

INSERT OR IGNORE INTO site_settings (key, value) VALUES
  ('tax_enabled', '0'),
  ('tax_rate', '10'),
  ('komoju_fee_enabled', '0'),
  ('komoju_fee_rate', '3.6');
