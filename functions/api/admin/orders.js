/**
 * GET  /api/admin/orders?q=&from=&to=&pref=&shipped=&product=&limit=&offset=
 * قائمة الطلبات مع بحث/فلترة/صفحات (يتطلّب جلسة صالحة).
 *   q:       بحث بالاسم/الهاتف/رقم الطلب
 *   from/to: نطاق تاريخ (YYYY-MM-DD)، شامل الطرفين
 *   pref:    مفتاح منطقة شحن واحد (kanto, kyushu, okinawa ...)
 *   shipped: 'pending' | 'shipped' (فارغ = الكل)
 *   product: معرّف منتج واحد (set3, set5, chicken, teacake, coffeecake, scone)
 *
 * POST /api/admin/orders — إضافة طلب يدويًا (هاتف/حضور شخصي)، يتطلّب جلسة صالحة.
 *   body: { customer: {name,phone,email,pref,postal,address}, items: [{id,qty}], shipping_fee? }
 *   الأسعار/الأسماء/الأوزان تُحسم من getProducts(env) على الخادم دائمًا — لا نثق بأي
 *   سعر يُرسَل من المتصفح، بنفس منطق /api/checkout تمامًا.
 */
import { verifyAdminSession, getProducts, calcShipping, VALID_REGIONS } from '../../_lib/helpers.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json' };

  const authed = await verifyAdminSession(request, env.ADMIN_SESSION_SECRET);
  if (!authed) return new Response(JSON.stringify({ error: 'ログインが必要です' }), { status: 401, headers });

  if (!env.ORDERS_DB) {
    return new Response(JSON.stringify({ error: 'D1データベース（ORDERS_DB）が未設定です' }), { status: 500, headers });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim().slice(0, 60);
  const from = (url.searchParams.get('from') || '').trim().slice(0, 10);
  const to = (url.searchParams.get('to') || '').trim().slice(0, 10);
  const pref = (url.searchParams.get('pref') || '').trim().slice(0, 30);
  const shipped = (url.searchParams.get('shipped') || '').trim().slice(0, 10);
  const product = (url.searchParams.get('product') || '').trim().slice(0, 30);
  const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get('limit'), 10) || 20));
  const offset = Math.max(0, parseInt(url.searchParams.get('offset'), 10) || 0);

  const where = [];
  const params = [];
  if (q) {
    where.push('(customer_name LIKE ? OR customer_phone LIKE ? OR id LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (from)     { where.push('date(created_at) >= ?'); params.push(from); }
  if (to)       { where.push('date(created_at) <= ?'); params.push(to); }
  if (pref)     { where.push('customer_pref = ?'); params.push(pref); }
  if (shipped)  { where.push('shipped_status = ?'); params.push(shipped); }
  if (product)  { where.push('id IN (SELECT order_id FROM order_items WHERE product_id = ?)'); params.push(product); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const listSql = `SELECT id, created_at, customer_name, customer_phone, customer_pref, customer_postal, amount, shipping_fee, status, shipped_status, tracking_number
                      FROM orders ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const countSql = `SELECT COUNT(*) AS total FROM orders ${whereSql}`;

    const [list, count] = await Promise.all([
      env.ORDERS_DB.prepare(listSql).bind(...params, limit, offset).all(),
      env.ORDERS_DB.prepare(countSql).bind(...params).first(),
    ]);

    return new Response(JSON.stringify({
      orders: list.results || [],
      total: count?.total || 0,
      limit,
      offset,
    }), { headers });
  } catch (e) {
    console.error('admin/orders list failed:', e);
    return new Response(JSON.stringify({ error: '注文一覧の取得に失敗しました' }), { status: 500, headers });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json' };

  const authed = await verifyAdminSession(request, env.ADMIN_SESSION_SECRET);
  if (!authed) return new Response(JSON.stringify({ error: 'ログインが必要です' }), { status: 401, headers });

  if (!env.ORDERS_DB) {
    return new Response(JSON.stringify({ error: 'D1データベース（ORDERS_DB）が未設定です' }), { status: 500, headers });
  }

  let body;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: '無効なリクエストです' }), { status: 400, headers }); }

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
    if (!product || qty <= 0) continue;
    orderItems.push({ id: it.id, name: product.name, price: product.price, qty });
    subtotal += product.price * qty;
    totalWeight += product.weight * qty;
  }
  if (!orderItems.length) {
    return new Response(JSON.stringify({ error: '商品を1つ以上選択してください' }), { status: 400, headers });
  }

  // 送料: 管理者が明示的に金額を送ってきたらそれを優先（店頭受け取りなど0円指定も可）。
  // 何も送ってこなければ通常の送料計算式で自動算出する。
  let shippingFee = 0;
  if (body.shipping_fee !== undefined && body.shipping_fee !== null && body.shipping_fee !== '') {
    shippingFee = Math.max(0, Math.min(50000, parseInt(body.shipping_fee, 10) || 0));
  } else if (customer.pref) {
    const shipping = calcShipping(totalWeight, subtotal, customer.pref);
    shippingFee = shipping.fee || 0;
  }
  const amount = subtotal + shippingFee;

  const id = `manual_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const orderSummary = orderItems.map((it) => `${it.name} × ${it.qty}`).join('\n');

  try {
    const insertOrder = env.ORDERS_DB.prepare(
      `INSERT INTO orders (id, status, source, customer_name, customer_phone, customer_email, customer_pref, customer_postal, customer_address, subtotal, shipping_fee, amount, order_summary)
       VALUES (?, 'manual', 'manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, customer.name, customer.phone, customer.email, customer.pref, customer.postal, customer.address,
      subtotal, shippingFee, amount, orderSummary
    );
    const insertItem = env.ORDERS_DB.prepare(
      `INSERT OR IGNORE INTO order_items (order_id, product_id, product_name, quantity, unit_price) VALUES (?, ?, ?, ?, ?)`
    );
    await env.ORDERS_DB.batch([insertOrder, ...orderItems.map((it) => insertItem.bind(id, it.id, it.name, it.qty, it.price))]);

    return new Response(JSON.stringify({ ok: true, id }), { headers });
  } catch (e) {
    console.error('admin/orders create failed:', e);
    return new Response(JSON.stringify({ error: '注文の作成に失敗しました' }), { status: 500, headers });
  }
}
