/**
 * POST /api/admin/login
 * تسجيل الدخول للوحة إدارة الطلبات (/admin)، بخطوتين عند تفعيل 2FA:
 *   1) { step: 'password', password, token } — تحقّق Turnstile ثم كلمة المرور.
 *      نجاح + ADMIN_TOTP_SECRET مُعدّ → { needsTotp: true, pending } (بدون كوكيز بعد).
 *      نجاح + ADMIN_TOTP_SECRET غير مُعدّ → جلسة كاملة فورًا (سلوك اليوم بلا تغيير).
 *   2) { step: 'totp', pending, code } — تحقّق التوكن المؤقّت + رمز التطبيق (6 أرقام) → جلسة كاملة.
 * بدون جلسات مخزّنة على الخادم — كل توكن عبارة عن (تاريخ الانتهاء + توقيع HMAC).
 *
 * ⚠️ يتطلّب متغيّرين بيئة أساسيين (Cloudflare Pages → Settings → Environment variables → Add secret):
 *   - ADMIN_PASSWORD:        كلمة مرور الدخول الافتراضية (تبقى fallback حتى لو غُيّرت من「セキュリティ」)
 *   - ADMIN_SESSION_SECRET:  مفتاح عشوائي طويل لتوقيع الجلسة (مختلف عن أي مفتاح آخر بالمشروع)
 * بدون هذين المتغيّرين، تسجيل الدخول يُرفَض دائمًا (fail-closed، وليس فتحًا افتراضيًا).
 *   - ADMIN_TOTP_SECRET (اختياري): يفعّل خطوة التحقق الثانية إن لم يكن مفعّلاً من D1 أصلاً
 *
 * ⚠️ كلمة المرور الفعلية و/أو مفتاح TOTP قد يكونا الآن مُخزَّنين بـD1 (site_settings:
 * admin_password_hash / admin_totp_secret) بدل env، إذا غُيّرا من تبويب「セキュリティ」
 * بلوحة الإدارة (راجع functions/api/admin/security.js) — D1 له الأولوية دائمًا، وenv يبقى
 * fallback آمن لا يُستخدم إلا لو كانت قيمة D1 فارغة (verifyCurrentAdminPassword/getAdminTotpSecret).
 */
import {
  checkAdminRateLimit, recordAdminFailure, clearAdminFailures,
  createAdminSession, adminSessionCookieHeader,
  createPendingTwoFactorToken, verifyPendingTwoFactorToken, verifyTOTP,
  ADMIN_TOTP_ATTEMPT_KV_PREFIX,
  verifyTurnstile, FALLBACK_TURNSTILE_SECRET_KEY,
  verifyCurrentAdminPassword, getAdminTotpSecret,
} from '../../_lib/helpers.js';

async function handlePasswordStep(context, body) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json' };
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

  const rl = await checkAdminRateLimit(env, ip);
  if (rl.blocked) {
    return new Response(JSON.stringify({ error: '試行回数が多すぎます。15分後に再度お試しください。' }), { status: 429, headers });
  }

  // ⚠️ بوت-プロテクション: نفس تحقّق Turnstile المستخدم بنموذج التواصل ونموذج الدفع
  const remoteIp = request.headers.get('CF-Connecting-IP');
  const turnstileValid = await verifyTurnstile(body.token, env.TURNSTILE_SECRET_KEY || FALLBACK_TURNSTILE_SECRET_KEY, remoteIp);
  if (!turnstileValid) {
    return new Response(JSON.stringify({ error: 'ボット防止の確認に失敗しました。ページを再読み込みしてもう一度お試しください。' }), { status: 403, headers });
  }

  const password = String(body.password || '');
  const sessionSecret = env.ADMIN_SESSION_SECRET || '';

  // كلمة المرور المعتمدة اليوم: D1 لو غُيّرت من تبويب「セキュリティ」، وإلا env.ADMIN_PASSWORD كما هو الحال دائمًا
  const passwordOk = !!sessionSecret && await verifyCurrentAdminPassword(env, password);

  if (!passwordOk) {
    if (rl.key) await recordAdminFailure(env, rl.key, rl.attempts);
    if (!sessionSecret) console.error('Admin login blocked: ADMIN_SESSION_SECRET not configured');
    return new Response(JSON.stringify({ error: 'パスワードが正しくありません' }), { status: 401, headers });
  }

  if (rl.key) await clearAdminFailures(env, rl.key);

  // TOTPシークレットの有効な出どころ: D1（「セキュリティ」タブから有効化済み）→ env.ADMIN_TOTP_SECRET の順
  const activeTotpSecret = (await getAdminTotpSecret(env)) || env.ADMIN_TOTP_SECRET || '';

  // 2FA غير مُعدّ بعد على هذا الموقع → نُبقي السلوك القديم (جلسة كاملة فورًا) حتى لا يُقفَل الوصول
  if (!activeTotpSecret) {
    const token = await createAdminSession(sessionSecret);
    headers['Set-Cookie'] = adminSessionCookieHeader(token);
    return new Response(JSON.stringify({ ok: true }), { headers });
  }

  const pending = await createPendingTwoFactorToken(sessionSecret);
  return new Response(JSON.stringify({ ok: true, needsTotp: true, pending }), { headers });
}

async function handleTotpStep(context, body) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json' };
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const sessionSecret = env.ADMIN_SESSION_SECRET || '';

  const rl = await checkAdminRateLimit(env, ip, ADMIN_TOTP_ATTEMPT_KV_PREFIX);
  if (rl.blocked) {
    return new Response(JSON.stringify({ error: '試行回数が多すぎます。15分後に再度お試しください。' }), { status: 429, headers });
  }

  const pendingOk = await verifyPendingTwoFactorToken(body.pending, sessionSecret);
  if (!pendingOk) {
    return new Response(JSON.stringify({ error: 'セッションの有効期限が切れました。最初からやり直してください。' }), { status: 401, headers });
  }

  const activeTotpSecret = (await getAdminTotpSecret(env)) || env.ADMIN_TOTP_SECRET || '';
  const codeOk = activeTotpSecret && await verifyTOTP(activeTotpSecret, body.code);
  if (!codeOk) {
    if (rl.key) await recordAdminFailure(env, rl.key, rl.attempts);
    return new Response(JSON.stringify({ error: '認証コードが正しくありません' }), { status: 401, headers });
  }

  if (rl.key) await clearAdminFailures(env, rl.key);

  const token = await createAdminSession(sessionSecret);
  headers['Set-Cookie'] = adminSessionCookieHeader(token);
  return new Response(JSON.stringify({ ok: true }), { headers });
}

export async function onRequestPost(context) {
  const headers = { 'Content-Type': 'application/json' };
  let body;
  try { body = await context.request.json(); } catch { return new Response(JSON.stringify({ error: '無効なリクエストです' }), { status: 400, headers }); }

  const step = body.step === 'totp' ? 'totp' : 'password'; // 旧クライアント/デフォルトは常に 'password' ステップ
  return step === 'totp' ? handleTotpStep(context, body) : handlePasswordStep(context, body);
}
