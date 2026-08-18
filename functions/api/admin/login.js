/**
 * POST /api/admin/login
 * تسجيل الدخول للوحة إدارة الطلبات (/admin). بدون جلسات مخزّنة على الخادم —
 * التوكن عبارة عن (تاريخ الانتهاء + توقيع HMAC) يُتحقق منه في كل طلب لاحق.
 *
 * ⚠️ يتطلّب متغيّرين بيئة (Cloudflare Pages → Settings → Environment variables → Add secret):
 *   - ADMIN_PASSWORD:        كلمة مرور الدخول للوحة
 *   - ADMIN_SESSION_SECRET:  مفتاح عشوائي طويل لتوقيع الجلسة (مختلف عن أي مفتاح آخر بالمشروع)
 * بدون هذين المتغيّرين، تسجيل الدخول يُرفَض دائمًا (fail-closed، وليس فتحًا افتراضيًا).
 */
import { checkAdminRateLimit, recordAdminFailure, clearAdminFailures, createAdminSession, adminSessionCookieHeader, timingSafeEqual } from '../../_lib/helpers.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json' };
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

  const rl = await checkAdminRateLimit(env, ip);
  if (rl.blocked) {
    return new Response(JSON.stringify({ error: '試行回数が多すぎます。15分後に再度お試しください。' }), { status: 429, headers });
  }

  let body;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: '無効なリクエストです' }), { status: 400, headers }); }

  const password = String(body.password || '');
  const correctPassword = env.ADMIN_PASSWORD || '';
  const sessionSecret = env.ADMIN_SESSION_SECRET || '';

  // مقارنة ثابتة الزمن فقط عندما يتطابق الطول (تجنّب رمي استثناء)، وإلا نرفض مباشرة
  const passwordOk = !!correctPassword && !!sessionSecret && password.length === correctPassword.length && timingSafeEqual(password, correctPassword);

  if (!passwordOk) {
    if (rl.key) await recordAdminFailure(env, rl.key, rl.attempts);
    if (!correctPassword || !sessionSecret) console.error('Admin login blocked: ADMIN_PASSWORD/ADMIN_SESSION_SECRET not configured');
    return new Response(JSON.stringify({ error: 'パスワードが正しくありません' }), { status: 401, headers });
  }

  if (rl.key) await clearAdminFailures(env, rl.key);

  const token = await createAdminSession(sessionSecret);
  headers['Set-Cookie'] = adminSessionCookieHeader(token);
  return new Response(JSON.stringify({ ok: true }), { headers });
}
