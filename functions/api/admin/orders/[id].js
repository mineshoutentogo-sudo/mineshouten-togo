/**
 * GET   /api/admin/orders/:id — تفاصيل طلب واحد كاملة (رأس الطلب + كل سطور المنتجات)
 * PATCH /api/admin/orders/:id — تحديث حالة الشحن الفعلي (発送状況) ورقم التتبع
 * كلاهما يتطلّب جلسة صالحة.
 */
import { verifyAdminSession } from '../../../_lib/helpers.js';

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const headers = { 'Content-Type': 'application/json' };

  const authed = await verifyAdminSession(request, env.ADMIN_SESSION_SECRET);
  if (!authed) return new Response(JSON.stringify({ error: 'ログインが必要です' }), { status: 401, headers });

  if (!env.ORDERS_DB) {
    return new Response(JSON.stringify({ error: 'D1データベース（ORDERS_DB）が未設定です' }), { status: 500, headers });
  }

  const id = String(params.id || '').slice(0, 120);
  if (!id) return new Response(JSON.stringify({ error: '無効な注文IDです' }), { status: 400, headers });

  try {
    const [order, items] = await Promise.all([
      env.ORDERS_DB.prepare(`SELECT * FROM orders WHERE id = ?`).bind(id).first(),
      env.ORDERS_DB.prepare(`SELECT product_id, product_name, quantity, unit_price FROM order_items WHERE order_id = ?`).bind(id).all(),
    ]);

    if (!order) return new Response(JSON.stringify({ error: '注文が見つかりません' }), { status: 404, headers });

    return new Response(JSON.stringify({ order, items: items.results || [] }), { headers });
  } catch (e) {
    console.error('admin/orders detail failed:', e);
    return new Response(JSON.stringify({ error: '注文詳細の取得に失敗しました' }), { status: 500, headers });
  }
}

export async function onRequestPatch(context) {
  const { request, env, params } = context;
  const headers = { 'Content-Type': 'application/json' };

  const authed = await verifyAdminSession(request, env.ADMIN_SESSION_SECRET);
  if (!authed) return new Response(JSON.stringify({ error: 'ログインが必要です' }), { status: 401, headers });

  if (!env.ORDERS_DB) {
    return new Response(JSON.stringify({ error: 'D1データベース（ORDERS_DB）が未設定です' }), { status: 500, headers });
  }

  const id = String(params.id || '').slice(0, 120);
  if (!id) return new Response(JSON.stringify({ error: '無効な注文IDです' }), { status: 400, headers });

  let body;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: '無効なリクエストです' }), { status: 400, headers }); }

  const shippedStatus = body.shipped_status === 'shipped' ? 'shipped' : 'pending';
  const trackingNumber = String(body.tracking_number || '').trim().slice(0, 60);
  const shippedAt = shippedStatus === 'shipped' ? new Date().toISOString() : null;

  try {
    const result = await env.ORDERS_DB.prepare(
      `UPDATE orders SET shipped_status = ?, tracking_number = ?, shipped_at = ? WHERE id = ?`
    ).bind(shippedStatus, trackingNumber || null, shippedAt, id).run();

    if (!result.meta || result.meta.changes === 0) {
      return new Response(JSON.stringify({ error: '注文が見つかりません' }), { status: 404, headers });
    }

    return new Response(JSON.stringify({ ok: true, shipped_status: shippedStatus, tracking_number: trackingNumber, shipped_at: shippedAt }), { headers });
  } catch (e) {
    console.error('admin/orders patch failed:', e);
    return new Response(JSON.stringify({ error: '更新に失敗しました' }), { status: 500, headers });
  }
}
