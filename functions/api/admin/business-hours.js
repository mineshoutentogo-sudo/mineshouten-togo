/**
 * GET   /api/admin/business-hours — ساعات العمل الأسبوعية الحالية + حالة الإظهار (يتطلب جلسة صالحة)
 * PATCH /api/admin/business-hours — تحديثها. body:
 *   { enabled, hours: [{day,closed,open,close} × 7 بترتيب BUSINESS_DAYS], note }
 *   القراءة الفعلية أثناء تصفّح الموقع العام تتم من functions/api/business-hours.js مباشرة
 *   (بنفس منطق computeBusinessHoursState) حتى يحسب الطرفان دائمًا نفس النتيجة.
 */
import { verifyAdminSession, readBusinessHoursSettings, computeBusinessHoursState, BUSINESS_DAYS } from '../../_lib/helpers.js';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_LABELS_JA = { mon: '月曜日', tue: '火曜日', wed: '水曜日', thu: '木曜日', fri: '金曜日', sat: '土曜日', sun: '日曜日' };

export async function onRequestGet(context) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json' };

  const authed = await verifyAdminSession(request, env.ADMIN_SESSION_SECRET);
  if (!authed) return new Response(JSON.stringify({ error: 'ログインが必要です' }), { status: 401, headers });

  try {
    const map = await readBusinessHoursSettings(env);
    return new Response(JSON.stringify(computeBusinessHoursState(map)), { headers });
  } catch (e) {
    console.error('admin/business-hours GET failed:', e);
    return new Response(JSON.stringify({ error: '設定の取得に失敗しました' }), { status: 500, headers });
  }
}

export async function onRequestPatch(context) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json' };

  const authed = await verifyAdminSession(request, env.ADMIN_SESSION_SECRET);
  if (!authed) return new Response(JSON.stringify({ error: 'ログインが必要です' }), { status: 401, headers });

  if (!env.ORDERS_DB) {
    return new Response(JSON.stringify({ error: 'D1データベース（ORDERS_DB）が未設定です' }), { status: 500, headers });
  }

  let body;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: '無効なリクエストです' }), { status: 400, headers }); }

  const incoming = Array.isArray(body.hours) ? body.hours : [];
  const byDay = {};
  for (const row of incoming) { if (row && BUSINESS_DAYS.includes(row.day)) byDay[row.day] = row; }

  const hours = [];
  for (const day of BUSINESS_DAYS) {
    const row = byDay[day] || {};
    const closed = !!row.closed;
    if (!closed) {
      if (!TIME_RE.test(row.open) || !TIME_RE.test(row.close)) {
        return new Response(JSON.stringify({ error: DAY_LABELS_JA[day] + 'の営業時間が正しくありません（HH:MM形式で入力してください）' }), { status: 400, headers });
      }
      if (row.open >= row.close) {
        return new Response(JSON.stringify({ error: DAY_LABELS_JA[day] + 'の終了時刻は開始時刻より後にしてください' }), { status: 400, headers });
      }
    }
    hours.push({ day, closed, open: closed ? '' : row.open, close: closed ? '' : row.close, note: String(row.note || '').slice(0, 40) });
  }

  const enabled = body.enabled ? '1' : '0';
  const note = String(body.note || '').slice(0, 200);

  try {
    const stmt = env.ORDERS_DB.prepare(
      `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    );
    await env.ORDERS_DB.batch([
      stmt.bind('business_hours_enabled', enabled),
      stmt.bind('business_hours', JSON.stringify(hours)),
      stmt.bind('business_hours_note', note),
    ]);

    return new Response(JSON.stringify({ ok: true, enabled: enabled === '1', hours, note }), { headers });
  } catch (e) {
    console.error('admin/business-hours PATCH failed:', e);
    return new Response(JSON.stringify({ error: '設定の保存に失敗しました' }), { status: 500, headers });
  }
}
