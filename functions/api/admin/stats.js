/**
 * GET /api/admin/stats
 * إحصائيات مختصرة للوحة الإدارة (يتطلّب جلسة صالحة).
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

  try {
    const [totals, today, pending] = await Promise.all([
      env.ORDERS_DB.prepare(`SELECT COUNT(*) AS order_count, COALESCE(SUM(amount),0) AS total_revenue FROM orders`).first(),
      env.ORDERS_DB.prepare(`SELECT COUNT(*) AS today_count, COALESCE(SUM(amount),0) AS today_revenue FROM orders WHERE date(created_at) = date('now')`).first(),
      env.ORDERS_DB.prepare(`SELECT COUNT(*) AS pending_count FROM orders WHERE shipped_status = 'pending'`).first(),
    ]);

    return new Response(JSON.stringify({
      orderCount: totals?.order_count || 0,
      totalRevenue: totals?.total_revenue || 0,
      todayCount: today?.today_count || 0,
      todayRevenue: today?.today_revenue || 0,
      pendingCount: pending?.pending_count || 0,
    }), { headers });
  } catch (e) {
    console.error('admin/stats failed:', e);
    return new Response(JSON.stringify({ error: '集計の取得に失敗しました' }), { status: 500, headers });
  }
}
