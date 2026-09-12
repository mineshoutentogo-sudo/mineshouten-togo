/**
 * GET   /api/admin/topbar — حالة شريط الإشعار العلوي الحالية (「サイト準備中」／「デモ版」)
 * PATCH /api/admin/topbar — تحديثهما. body: { construction, trial } (كلاهما boolean،
 *   مستقلان تمامًا عن بعض ويمكن تفعيلهما معًا). يتطلّب جلسة صالحة.
 *   القراءة الفعلية أثناء تصفّح الموقع العام تتم من functions/api/topbar.js مباشرة.
 */
import { verifyAdminSession, readTopbarSettings, computeTopbarState } from '../../_lib/helpers.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json' };

  const authed = await verifyAdminSession(request, env.ADMIN_SESSION_SECRET);
  if (!authed) return new Response(JSON.stringify({ error: 'ログインが必要です' }), { status: 401, headers });

  try {
    const map = await readTopbarSettings(env);
    return new Response(JSON.stringify(computeTopbarState(map)), { headers });
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

  try {
    const stmt = env.ORDERS_DB.prepare(
      `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    );
    await env.ORDERS_DB.batch([
      stmt.bind('topbar_construction_enabled', construction),
      stmt.bind('topbar_trial_enabled', trial),
    ]);

    return new Response(JSON.stringify({
      ok: true,
      construction: construction === '1',
      trial: trial === '1',
    }), { headers });
  } catch (e) {
    console.error('admin/topbar PATCH failed:', e);
    return new Response(JSON.stringify({ error: '設定の保存に失敗しました' }), { status: 500, headers });
  }
}
