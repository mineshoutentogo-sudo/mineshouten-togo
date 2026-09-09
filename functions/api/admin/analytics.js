/**
 * GET /api/admin/analytics?from=&to=
 * بيانات مجمّعة لتبويب "分析" (يتطلّب جلسة صالحة):
 *   - daily:    سلسلة الإيراد اليومي ضمن النطاق (لرسم بياني)
 *   - regions:  إجمالي الطلبات/الإيراد لكل منطقة شحن (كل المناطق، وليس فقط الأعلى)
 *   - products: ترتيب كامل للمنتجات حسب الكمية المباعة والإيراد
 * from/to افتراضيًا: آخر 30 يومًا إن لم تُحدَّد.
 */
import { verifyAdminSession, PRODUCTS } from '../../_lib/helpers.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json' };

  const authed = await verifyAdminSession(request, env.ADMIN_SESSION_SECRET);
  if (!authed) return new Response(JSON.stringify({ error: 'ログインが必要です' }), { status: 401, headers });

  if (!env.ORDERS_DB) {
    return new Response(JSON.stringify({ error: 'D1データベース（ORDERS_DB）が未設定です' }), { status: 500, headers });
  }

  const url = new URL(request.url);
  const to = (url.searchParams.get('to') || '').trim().slice(0, 10) || new Date().toISOString().slice(0, 10);
  let from = (url.searchParams.get('from') || '').trim().slice(0, 10);
  if (!from) {
    const d = new Date(to + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 29); // افتراضيًا: آخر 30 يومًا شاملة اليوم المحدَّد كنهاية
    from = d.toISOString().slice(0, 10);
  }

  try {
    const [daily, regions, products] = await Promise.all([
      env.ORDERS_DB.prepare(
        `SELECT date(created_at) AS day, COUNT(*) AS orders, COALESCE(SUM(amount),0) AS revenue
         FROM orders WHERE date(created_at) BETWEEN ? AND ?
         GROUP BY day ORDER BY day ASC`
      ).bind(from, to).all(),
      env.ORDERS_DB.prepare(
        `SELECT customer_pref AS pref, COUNT(*) AS orders, COALESCE(SUM(amount),0) AS revenue
         FROM orders WHERE date(created_at) BETWEEN ? AND ?
         GROUP BY pref ORDER BY revenue DESC`
      ).bind(from, to).all(),
      env.ORDERS_DB.prepare(
        `SELECT i.product_id, i.product_name, SUM(i.quantity) AS qty, SUM(i.quantity * i.unit_price) AS revenue
         FROM order_items i JOIN orders o ON o.id = i.order_id
         WHERE date(o.created_at) BETWEEN ? AND ?
         GROUP BY i.product_id ORDER BY revenue DESC`
      ).bind(from, to).all(),
    ]);

    // نضيف المنتجات التي لم تُطلَب إطلاقًا ضمن النطاق (صفر مبيعات) حتى يظهر الترتيب الكامل دائمًا
    const soldIds = new Set((products.results || []).map((p) => p.product_id));
    const zeroProducts = Object.keys(PRODUCTS)
      .filter((id) => !soldIds.has(id))
      .map((id) => ({ product_id: id, product_name: PRODUCTS[id].name, qty: 0, revenue: 0 }));

    return new Response(JSON.stringify({
      from, to,
      daily: daily.results || [],
      regions: regions.results || [],
      products: [...(products.results || []), ...zeroProducts],
    }), { headers });
  } catch (e) {
    console.error('admin/analytics failed:', e);
    return new Response(JSON.stringify({ error: '分析データの取得に失敗しました' }), { status: 500, headers });
  }
}
