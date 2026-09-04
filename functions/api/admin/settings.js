/**
 * GET   /api/admin/settings — إعدادات الموقع العامة الحالية (وضع الصيانة اليدوي + رسالته
 *   + الحجز الزمني التلقائي + الحالة الفعلية المحسوبة الآن)، يتطلّب جلسة صالحة
 * PATCH /api/admin/settings — تحديث وضع الصيانة. body:
 *   { maintenance_mode, maintenance_message, maintenance_eta,
 *     maintenance_schedule_start, maintenance_schedule_end }
 *   (يتطلّب جلسة صالحة). القراءة الفعلية لهذه القيم أثناء تصفّح الموقع تتم من
 *   functions/_middleware.js مباشرة (بنفس منطق computeMaintenanceState).
 */
import { verifyAdminSession, readMaintenanceSettings, computeMaintenanceState } from '../../_lib/helpers.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json' };

  const authed = await verifyAdminSession(request, env.ADMIN_SESSION_SECRET);
  if (!authed) return new Response(JSON.stringify({ error: 'ログインが必要です' }), { status: 401, headers });

  try {
    const map = await readMaintenanceSettings(env);
    const state = computeMaintenanceState(map);
    return new Response(JSON.stringify({
      maintenance_mode: state.manual,
      maintenance_message: state.message,
      maintenance_eta: state.eta,
      maintenance_schedule_start: state.scheduleStart,
      maintenance_schedule_end: state.scheduleEnd,
      schedule_status: state.scheduleStatus,
      effective: state.effective,
    }), { headers });
  } catch (e) {
    console.error('admin/settings GET failed:', e);
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

  const mode = body.maintenance_mode ? '1' : '0';
  const message = String(body.maintenance_message || '').slice(0, 500);
  const eta = String(body.maintenance_eta || '').slice(0, 100);

  const scheduleStartRaw = String(body.maintenance_schedule_start || '').trim();
  const scheduleEndRaw = String(body.maintenance_schedule_end || '').trim();
  if (!!scheduleStartRaw !== !!scheduleEndRaw) {
    return new Response(JSON.stringify({ error: '予約は開始日時・終了日時の両方を入力するか、両方空欄にしてください。' }), { status: 400, headers });
  }
  let scheduleStart = '', scheduleEnd = '';
  if (scheduleStartRaw && scheduleEndRaw) {
    const startMs = Date.parse(scheduleStartRaw);
    const endMs = Date.parse(scheduleEndRaw);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      return new Response(JSON.stringify({ error: '予約の日時が正しくありません。' }), { status: 400, headers });
    }
    if (endMs <= startMs) {
      return new Response(JSON.stringify({ error: '終了日時は開始日時より後にしてください。' }), { status: 400, headers });
    }
    scheduleStart = new Date(startMs).toISOString();
    scheduleEnd = new Date(endMs).toISOString();
  }

  try {
    const stmt = env.ORDERS_DB.prepare(
      `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    );
    await env.ORDERS_DB.batch([
      stmt.bind('maintenance_mode', mode),
      stmt.bind('maintenance_message', message),
      stmt.bind('maintenance_eta', eta),
      stmt.bind('maintenance_schedule_start', scheduleStart),
      stmt.bind('maintenance_schedule_end', scheduleEnd),
    ]);

    const state = computeMaintenanceState({
      maintenance_mode: mode,
      maintenance_message: message,
      maintenance_eta: eta,
      maintenance_schedule_start: scheduleStart,
      maintenance_schedule_end: scheduleEnd,
    });

    return new Response(JSON.stringify({
      ok: true,
      maintenance_mode: state.manual,
      maintenance_message: state.message,
      maintenance_eta: state.eta,
      maintenance_schedule_start: state.scheduleStart,
      maintenance_schedule_end: state.scheduleEnd,
      schedule_status: state.scheduleStatus,
      effective: state.effective,
    }), { headers });
  } catch (e) {
    console.error('admin/settings PATCH failed:', e);
    return new Response(JSON.stringify({ error: '設定の保存に失敗しました' }), { status: 500, headers });
  }
}
