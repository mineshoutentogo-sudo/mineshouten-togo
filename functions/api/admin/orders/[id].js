/**
 * GET    /api/admin/orders/:id — تفاصيل طلب واحد كاملة (رأس الطلب + كل سطور المنتجات)
 * PATCH  /api/admin/orders/:id — تحديث حالة الشحن الفعلي (発送状況) ورقم التتبع، أو تعديل شامل
 *                                 (بيانات العميل/المنتجات/رسوم الشحن) عند إرسال الحقول المقابلة
 * DELETE /api/admin/orders/:id — حذف الطلب نهائيًا (رأس الطلب + كل سطور المنتجات)
 * الكل يتطلّب جلسة صالحة.
 */
import { verifyAdminSession, getProducts, calcShipping, VALID_REGIONS } from '../../../_lib/helpers.js';

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

  // このリクエストが「発送状況のみの更新」か「注文内容の全体編集」かを判定
  // （既存のクライアント/呼び出しは shipped_status/tracking_number しか送らない — 挙動は変えない）
  const isFullEdit = body.customer || Array.isArray(body.items) || body.shipping_fee !== undefined;

  try {
    const existing = await env.ORDERS_DB.prepare(`SELECT id FROM orders WHERE id = ?`).bind(id).first();
    if (!existing) return new Response(JSON.stringify({ error: '注文が見つかりません' }), { status: 404, headers });

    if (isFullEdit) {
      const clean = (v, max) => String(v || '').trim().slice(0, max || 200);
      const c = body.customer || {};
      const customer = {
        name:    clean(c.name, 60),
        phone:   clean(c.phone, 30),
        email:   clean(c.email, 120),
        pref:    clean(c.pref, 30),
        postal:  clean(c.postal, 12),
        address: clean(c.address, 200),
      };
      if (!customer.name || !customer.phone) {
        return new Response(JSON.stringify({ error: 'お名前と電話番号は必須です' }), { status: 400, headers });
      }
      if (customer.pref && !VALID_REGIONS.includes(customer.pref)) {
        return new Response(JSON.stringify({ error: '都道府県が正しくありません' }), { status: 400, headers });
      }

      const products = await getProducts(env);
      const reqItems = Array.isArray(body.items) ? body.items : [];
      const orderItems = [];
      let subtotal = 0;
      let totalWeight = 0;
      for (const it of reqItems) {
        const product = products[it.id];
        const qty = Math.max(0, Math.min(99, parseInt(it.qty, 10) || 0));
        // 管理者が特別価格（値引き等）を指定した場合はそれを尊重、指定なしなら現行カタログ価格
        const unitPrice = it.price !== undefined && it.price !== null && it.price !== ''
          ? Math.max(0, Math.min(1000000, parseInt(it.price, 10) || 0))
          : (product ? product.price : 0);
        if (!product || qty <= 0) continue;
        orderItems.push({ id: it.id, name: product.name, price: unitPrice, qty });
        subtotal += unitPrice * qty;
        totalWeight += product.weight * qty;
      }
      if (!orderItems.length) {
        return new Response(JSON.stringify({ error: '商品を1つ以上選択してください' }), { status: 400, headers });
      }

      let shippingFee;
      if (body.shipping_fee !== undefined && body.shipping_fee !== null && body.shipping_fee !== '') {
        shippingFee = Math.max(0, Math.min(50000, parseInt(body.shipping_fee, 10) || 0));
      } else if (customer.pref) {
        shippingFee = calcShipping(totalWeight, subtotal, customer.pref).fee || 0;
      } else {
        shippingFee = 0;
      }
      const amount = subtotal + shippingFee;
      const orderSummary = orderItems.map((it) => `${it.name} × ${it.qty}`).join('\n');
      const now = new Date().toISOString();

      const updateOrder = env.ORDERS_DB.prepare(
        `UPDATE orders SET customer_name = ?, customer_phone = ?, customer_email = ?, customer_pref = ?, customer_postal = ?, customer_address = ?,
                            subtotal = ?, shipping_fee = ?, amount = ?, order_summary = ?, updated_at = ?
         WHERE id = ?`
      ).bind(
        customer.name, customer.phone, customer.email, customer.pref, customer.postal, customer.address,
        subtotal, shippingFee, amount, orderSummary, now, id
      );
      const deleteItems = env.ORDERS_DB.prepare(`DELETE FROM order_items WHERE order_id = ?`).bind(id);
      const insertItem = env.ORDERS_DB.prepare(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price) VALUES (?, ?, ?, ?, ?)`
      );
      await env.ORDERS_DB.batch([updateOrder, deleteItems, ...orderItems.map((it) => insertItem.bind(id, it.id, it.name, it.qty, it.price))]);

      return new Response(JSON.stringify({ ok: true, subtotal, shipping_fee: shippingFee, amount }), { headers });
    }

    // --- 発送状況のみの更新（従来どおり） ---
    const shippedStatus = body.shipped_status === 'shipped' ? 'shipped' : 'pending';
    const trackingNumber = String(body.tracking_number || '').trim().slice(0, 60);
    const shippedAt = shippedStatus === 'shipped' ? new Date().toISOString() : null;

    await env.ORDERS_DB.prepare(
      `UPDATE orders SET shipped_status = ?, tracking_number = ?, shipped_at = ? WHERE id = ?`
    ).bind(shippedStatus, trackingNumber || null, shippedAt, id).run();

    return new Response(JSON.stringify({ ok: true, shipped_status: shippedStatus, tracking_number: trackingNumber, shipped_at: shippedAt }), { headers });
  } catch (e) {
    console.error('admin/orders patch failed:', e);
    return new Response(JSON.stringify({ error: '更新に失敗しました' }), { status: 500, headers });
  }
}

export async function onRequestDelete(context) {
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
    const existing = await env.ORDERS_DB.prepare(`SELECT id FROM orders WHERE id = ?`).bind(id).first();
    if (!existing) return new Response(JSON.stringify({ error: '注文が見つかりません' }), { status: 404, headers });

    await env.ORDERS_DB.batch([
      env.ORDERS_DB.prepare(`DELETE FROM order_items WHERE order_id = ?`).bind(id),
      env.ORDERS_DB.prepare(`DELETE FROM orders WHERE id = ?`).bind(id),
    ]);

    return new Response(JSON.stringify({ ok: true }), { headers });
  } catch (e) {
    console.error('admin/orders delete failed:', e);
    return new Response(JSON.stringify({ error: '削除に失敗しました' }), { status: 500, headers });
  }
}
