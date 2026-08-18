/**
 * GET /api/admin/orders/:id
 * تفاصيل طلب واحد كاملة (رأس الطلب + كل سطور المنتجات) — يتطلّب جلسة صالحة.
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
