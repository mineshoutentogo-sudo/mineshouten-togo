/**
 * GET   /api/admin/settings — إعدادات الموقع العامة الحالية (وضع الصيانة + رسالته)، يتطلّب جلسة صالحة
 * PATCH /api/admin/settings — تحديث وضع الصيانة. body: { maintenance_mode, maintenance_message, maintenance_eta }
 *   (يتطلّب جلسة صالحة). القراءة الفعلية لهذه القيم أثناء تصفّح الموقع تتم من functions/_middleware.js مباشرة.
 */
import { verifyAdminSession } from '../../_lib/helpers.js';

const KEYS = ['maintenance_mode', 'maintenance_message', 'maintenance_eta'];

export async function onRequestGet(context) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json' };

  const authed = await verifyAdminSession(request, env.ADMIN_SESSION_SECRET);
  if (!authed) return new Response(JSON.stringify({ error: 'ログインが必要です' }), { status: 401, headers });

  if (!env.ORDERS_DB) {
    return new Response(JSON.stringify({ maintenance_mode: false, maintenance_message: '', maintenance_eta: '' }), { headers });
  }

  try {
    const { results } = await env.ORDERS_DB.prepare(
      `SELECT key, value FROM site_settings WHERE key IN (${KEYS.map(() => '?').join(',')})`
    ).bind(...KEYS).all();
    const map = {};
    for (const row of results || []) map[row.key] = row.value;
    return new Response(JSON.stringify({
      maintenance_mode: map.maintenance_mode === '1',
      maintenance_message: map.maintenance_message || '',
      maintenance_eta: map.maintenance_eta || '',
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

  try {
    const stmt = env.ORDERS_DB.prepare(
      `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    );
    await env.ORDERS_DB.batch([
      stmt.bind('maintenance_mode', mode),
      stmt.bind('maintenance_message', message),
      stmt.bind('maintenance_eta', eta),
    ]);

    return new Response(JSON.stringify({
      ok: true, maintenance_mode: mode === '1', maintenance_message: message, maintenance_eta: eta,
    }), { headers });
  } catch (e) {
    console.error('admin/settings PATCH failed:', e);
    return new Response(JSON.stringify({ error: '設定の保存に失敗しました' }), { status: 500, headers });
  }
}
