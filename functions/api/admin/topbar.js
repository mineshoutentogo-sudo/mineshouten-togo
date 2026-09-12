/**
 * GET   /api/admin/topbar — حالة شريط الإشعار العلوي الحالية (「サイト準備中」／「デモ版」)
 *   يرجّع: { construction, trialEnabled, trialUntil, trialExpired, trial }
 *   trialEnabled = المفتاح اليدوي الخام، trial = الحالة الفعلية المعروضة للزوار الآن
 *   (trialEnabled && لم ينتهِ trialUntil بعد)، trialExpired = انتهى الموعد لكن المفتاح
 *   اليدوي لا يزال ON (يفيد لعرض تنبيه بلوحة الإدارة).
 * PATCH /api/admin/topbar — تحديثها. body: { construction, trial, trialUntil }
 *   construction/trial: boolean. trialUntil: نص فارغ (بدون انتهاء تلقائي) أو تاريخ/وقت
 *   صالح (ISO). يتطلّب جلسة صالحة. القراءة الفعلية أثناء تصفّح الموقع العام تتم من
 *   functions/api/topbar.js مباشرة.
 */
import { verifyAdminSession, readTopbarSettings, computeTopbarState } from '../../_lib/helpers.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json' };

  const authed = await verifyAdminSession(request, env.ADMIN_SESSION_SECRET);
  if (!authed) return new Response(JSON.stringify({ error: 'ログインが必要です' }), { status: 401, headers });

  try {
    const map = await readTopbarSettings(env);
    const state = computeTopbarState(map);
    return new Response(JSON.stringify({
      construction: state.construction,
      trialEnabled: state.trialEnabled,
      trialUntil: state.trialUntil,
      trialExpired: state.trialExpired,
      trial: state.trial,
    }), { headers });
  } catch (e) {
    console.error('admin/topbar GET failed:', e);
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

  const construction = body.construction ? '1' : '0';
  const trial = body.trial ? '1' : '0';

  const trialUntilRaw = String(body.trialUntil || '').trim();
  let trialUntil = '';
  if (trialUntilRaw) {
    const ms = Date.parse(trialUntilRaw);
    if (!Number.isFinite(ms)) {
      return new Response(JSON.stringify({ error: 'トライアルの終了日時が正しくありません。' }), { status: 400, headers });
    }
    trialUntil = new Date(ms).toISOString();
  }

  try {
    const stmt = env.ORDERS_DB.prepare(
      `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    );
    await env.ORDERS_DB.batch([
      stmt.bind('topbar_construction_enabled', construction),
      stmt.bind('topbar_trial_enabled', trial),
      stmt.bind('topbar_trial_until', trialUntil),
    ]);

    const now = Date.now();
    const trialExpired = !!trialUntil && now >= Date.parse(trialUntil);
    return new Response(JSON.stringify({
      ok: true,
      construction: construction === '1',
      trialEnabled: trial === '1',
      trialUntil,
      trialExpired,
      trial: trial === '1' && !trialExpired,
    }), { headers });
  } catch (e) {
    console.error('admin/topbar PATCH failed:', e);
    return new Response(JSON.stringify({ error: '設定の保存に失敗しました' }), { status: 500, headers });
  }
}
