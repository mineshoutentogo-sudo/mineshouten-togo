/**
 * GET /api/admin/orders?q=&from=&to=&pref=&limit=&offset=
 * قائمة الطلبات مع بحث/فلترة/صفحات (يتطلّب جلسة صالحة).
 *   q:      بحث بالاسم/الهاتف/رقم الطلب
 *   from/to: نطاق تاريخ (YYYY-MM-DD)، شامل الطرفين
 *   pref:   مفتاح منطقة شحن واحد (kanto, kyushu, okinawa ...)
 */
import { verifyAdminSession } from '../../_lib/helpers.js';

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
  const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get('limit'), 10) || 20));
  const offset = Math.max(0, parseInt(url.searchParams.get('offset'), 10) || 0);

  const where = [];
  const params = [];
  if (q) {
    where.push('(customer_name LIKE ? OR customer_phone LIKE ? OR id LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (from) { where.push('date(created_at) >= ?'); params.push(from); }
  if (to)   { where.push('date(created_at) <= ?'); params.push(to); }
  if (pref) { where.push('customer_pref = ?'); params.push(pref); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const listSql = `SELECT id, created_at, customer_name, customer_phone, customer_pref, customer_postal, amount, shipping_fee, status
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
