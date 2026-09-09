-- 峯商店 — 週間営業時間（管理画面の「営業時間」タブから編集、公開サイトの表示ON/OFFも可能）
-- 既存の site_settings（key/value）テーブルをそのまま利用。0001〜0005 実行済みが前提。
-- 貼り付けて D1 Console で一度だけ実行してください。

-- business_hours_enabled: '1' で公開サイトに「営業時間」ウィジェットを表示、'0' で非表示。
-- business_hours: 月曜始まり・日曜終わりの7要素JSON配列。各要素は
--   {"day":"mon|tue|wed|thu|fri|sat|sun","closed":true|false,"open":"HH:MM","close":"HH:MM"}
-- business_hours_note: 任意の特記事項（例：年末年始休業のお知らせ）。空欄なら非表示。
-- 初期値は下書きなので、実際の営業時間に合わせて管理画面から編集してからONにしてください。
INSERT OR IGNORE INTO site_settings (key, value) VALUES
  ('business_hours_enabled', '0'),
  ('business_hours', '[{"day":"mon","closed":false,"open":"10:00","close":"18:00"},{"day":"tue","closed":false,"open":"10:00","close":"18:00"},{"day":"wed","closed":false,"open":"10:00","close":"18:00"},{"day":"thu","closed":false,"open":"10:00","close":"18:00"},{"day":"fri","closed":false,"open":"10:00","close":"18:00"},{"day":"sat","closed":false,"open":"10:00","close":"18:00"},{"day":"sun","closed":true,"open":"","close":""}]'),
  ('business_hours_note', '');
