/**
 * POST /api/admin/reset-data
 * ⚠️ إجراء تدميري لا رجعة فيه: يمسح كل الطلبات (orders + order_items من D1) وكل
 * سجلات العملاء المحفوظة للتعبئة التلقائية (customer:* من CUSTOMERS_KV).
 * لا يمسّ أبدًا: product_prices (أسعار المنتجات) ولا site_settings (وضع الصيانة،
 * ساعات العمل) — هذي تبقى كما هي.
 *
 * يتطلب جلسة إدارية صالحة (verifyAdminSession) + إعادة إدخال كلمة مرور الأدمن
 * بالـ body كتأكيد إضافي منفصل (طبقة حماية ثانية غير الجلسة نفسها، بمعدّل محاولات
 * خاص بها ADMIN_RESET_ATTEMPT_KV_PREFIX — منفصل عن معدّل تسجيل الدخول العادي).
 * body: { password }
 */
import {
  verifyAdminSession, verifyCurrentAdminPassword,
  checkAdminRateLimit, recordAdminFailure, clearAdminFailures,
  ADMIN_RESET_ATTEMPT_KV_PREFIX, CUSTOMER_KV_PREFIX,
} from '../../_lib/helpers.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json' };

  const authed = await verifyAdminSession(request, env.ADMIN_SESSION_SECRET);
  if (!authed) return new Response(JSON.stringify({ error: 'ログインが必要です' }), { status: 401, headers });

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rl = await checkAdminRateLimit(env, ip, ADMIN_RESET_ATTEMPT_KV_PREFIX);
  if (rl.blocked) {
    return new Response(JSON.stringify({ error: '試行回数が多すぎます。15分後に再度お試しください。' }), { status: 429, headers });
  }

  let body;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: '無効なリクエストです' }), { status: 400, headers }); }

  // ⚠️ يجب مطابقة نفس منطق كل نقطة نهاية حساسة أخرى (login.js/security.js): كلمة المرور
  // المعتمدة هي D1 (لو غُيّرت من تبويب「セキュリティ」) وإلا env.ADMIN_PASSWORD كاحتياط —
  // وليس env.ADMIN_PASSWORD مباشرة، وإلا كلمة مرور قديمة تُرِكت تعمل لهذا الإجراء التدميري
  // حتى بعد تغييرها من لوحة الإدارة.
  const password = String(body.password || '');
  const passwordOk = await verifyCurrentAdminPassword(env, password);

  if (!passwordOk) {
    if (rl.key) await recordAdminFailure(env, rl.key, rl.attempts);
    return new Response(JSON.stringify({ error: 'パスワードが正しくありません' }), { status: 401, headers });
  }
  if (rl.key) await clearAdminFailures(env, rl.key);

  if (!env.ORDERS_DB) {
    return new Response(JSON.stringify({ error: 'D1データベース（ORDERS_DB）が未設定です' }), { status: 500, headers });
  }

  let deletedOrders = 0;
  try {
    const countRow = await env.ORDERS_DB.prepare(`SELECT COUNT(*) AS n FROM orders`).first();
    deletedOrders = (countRow && countRow.n) || 0;

    // order_items が orders を参照するため、先に子テーブルを削除
    await env.ORDERS_DB.batch([
      env.ORDERS_DB.prepare(`DELETE FROM order_items`),
      env.ORDERS_DB.prepare(`DELETE FROM orders`),
    ]);
  } catch (e) {
    console.error('admin/reset-data D1 wipe failed:', e);
    return new Response(JSON.stringify({ error: '注文データの削除に失敗しました' }), { status: 500, headers });
  }

  let deletedKvKeys = 0;
  if (env.CUSTOMERS_KV) {
    try {
      let cursor;
      do {
        const page = await env.CUSTOMERS_KV.list({ prefix: CUSTOMER_KV_PREFIX, cursor });
        await Promise.all(page.keys.map((k) => env.CUSTOMERS_KV.delete(k.name)));
        deletedKvKeys += page.keys.length;
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
    } catch (e) {
      // D1 صار فارغ بالفعل — لا نفشل الطلب كليًا، فقط نبلّغ عن خلل جزئي بمسح الـKV
      console.error('admin/reset-data KV wipe failed:', e);
      return new Response(JSON.stringify({
        ok: true, partial: true, deletedOrders, deletedKvKeys,
        error: '顧客キャッシュ（自動入力用データ）の削除中に一部エラーが発生しました。注文データ（D1）は削除済みです。',
      }), { headers });
    }
  }

  return new Response(JSON.stringify({ ok: true, deletedOrders, deletedKvKeys }), { headers });
}
