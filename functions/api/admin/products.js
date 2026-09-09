/**
 * GET   /api/admin/products — قائمة المنتجات مع سعرها الفعلي الحالي (يتطلّب جلسة صالحة)
 * PATCH /api/admin/products — تعديل سعر منتج واحد. body: { id, price } (يتطلّب جلسة صالحة)
 *   id يجب أن يكون أحد معرّفات كتالوج PRODUCTS الثابتة (منع إدراج معرّفات عشوائية)،
 *   price عدد صحيح موجب ضمن حدّ معقول.
 */
import { verifyAdminSession, getProducts, PRODUCTS } from '../../_lib/helpers.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json' };

  const authed = await verifyAdminSession(request, env.ADMIN_SESSION_SECRET);
  if (!authed) return new Response(JSON.stringify({ error: 'ログインが必要です' }), { status: 401, headers });

  const products = await getProducts(env);
  const list = Object.keys(products).map((id) => ({ id, name: products[id].name, price: products[id].price, weight: products[id].weight }));
  return new Response(JSON.stringify({ products: list }), { headers });
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

  const id = String(body.id || '');
  if (!PRODUCTS[id]) {
    return new Response(JSON.stringify({ error: '不明な商品IDです' }), { status: 400, headers });
  }
  const price = parseInt(body.price, 10);
  if (!Number.isFinite(price) || price <= 0 || price > 1000000) {
    return new Response(JSON.stringify({ error: '価格は1〜1,000,000円の範囲で入力してください' }), { status: 400, headers });
  }

  try {
    await env.ORDERS_DB.prepare(
      `INSERT INTO product_prices (product_id, price, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(product_id) DO UPDATE SET price = excluded.price, updated_at = excluded.updated_at`
    ).bind(id, price).run();

    return new Response(JSON.stringify({ ok: true, id, price }), { headers });
  } catch (e) {
    console.error('admin/products patch failed:', e);
    return new Response(JSON.stringify({ error: '価格の更新に失敗しました' }), { status: 500, headers });
  }
}
