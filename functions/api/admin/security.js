/**
 * GET  /api/admin/security — حالة الأمان الحالية (هل TOTP مفعّل الآن)، يتطلب جلسة صالحة.
 * POST /api/admin/security — عمليات تبويب「セキュリティ」حسب { action }:
 *   - changePassword: { currentPassword, newPassword } → يغيّر كلمة المرور (يُخزَّن hash بـD1)
 *   - generateTotp:   { password } → يتحقق من كلمة المرور، يولّد مفتاح TOTP جديد (لم يُفعَّل بعد،
 *                      يُخزَّن مؤقتًا بـ admin_totp_pending فقط) ويرجّعه مع otpauthUri لعرض QR بالمتصفح
 *   - activateTotp:   { code } → يتحقق من الرمز الأول من التطبيق مقابل المفتاح المؤقت، ولو صحّ
 *                      يُفعَّله فعليًا (admin_totp_secret) — خطوتين حتى لا يُقفَل الدخول لو فشل الإعداد
 *   - disableTotp:    { password } → يعطّل TOTP (يمسح admin_totp_secret/admin_totp_pending)
 * كل العمليات محمية بحدّ محاولات منفصل (ADMIN_SECURITY_ATTEMPT_KV_PREFIX) عن تسجيل الدخول العادي.
 */
import {
  verifyAdminSession, verifyTOTP,
  hashPassword, verifyCurrentAdminPassword, getAdminTotpSecret,
  checkAdminRateLimit, recordAdminFailure, clearAdminFailures,
  ADMIN_SECURITY_ATTEMPT_KV_PREFIX,
} from '../../_lib/helpers.js';

async function putSetting(env, key, value) {
  await env.ORDERS_DB.prepare(
    `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(key, value).run();
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json' };

  const authed = await verifyAdminSession(request, env.ADMIN_SESSION_SECRET);
  if (!authed) return new Response(JSON.stringify({ error: 'ログインが必要です' }), { status: 401, headers });

  const activeTotpSecret = (await getAdminTotpSecret(env)) || env.ADMIN_TOTP_SECRET || '';
  return new Response(JSON.stringify({ totpEnabled: !!activeTotpSecret }), { headers });
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

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rl = await checkAdminRateLimit(env, ip, ADMIN_SECURITY_ATTEMPT_KV_PREFIX);
  if (rl.blocked) {
    return new Response(JSON.stringify({ error: '試行回数が多すぎます。15分後に再度お試しください。' }), { status: 429, headers });
  }

  if (body.action === 'changePassword') {
    const currentPassword = String(body.currentPassword || '');
    const newPassword = String(body.newPassword || '');

    const currentOk = await verifyCurrentAdminPassword(env, currentPassword);
    if (!currentOk) {
      if (rl.key) await recordAdminFailure(env, rl.key, rl.attempts);
      return new Response(JSON.stringify({ error: '現在のパスワードが正しくありません' }), { status: 401, headers });
    }
    if (newPassword.length < 8) {
      return new Response(JSON.stringify({ error: '新しいパスワードは8文字以上にしてください' }), { status: 400, headers });
    }
    if (rl.key) await clearAdminFailures(env, rl.key);

    await putSetting(env, 'admin_password_hash', await hashPassword(newPassword));
    return new Response(JSON.stringify({ ok: true }), { headers });
  }

  if (body.action === 'generateTotp') {
    const password = String(body.password || '');
    const passwordOk = await verifyCurrentAdminPassword(env, password);
    if (!passwordOk) {
      if (rl.key) await recordAdminFailure(env, rl.key, rl.attempts);
      return new Response(JSON.stringify({ error: 'パスワードが正しくありません' }), { status: 401, headers });
    }

    // الأدمن يكتب/يلصق الرمز بنفسه (Base32) بدل توليده عشوائيًا بالسيرفر — ننظّفه بنفس
    // منطق base32Decode بالضبط عشان الـQR والقيمة المخزَّنة يطابقان دائمًا بعضهما
    const secret = String(body.secret || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
    if (secret.length < 16) {
      return new Response(JSON.stringify({ error: 'コードは英字(A-Z)と数字(2-7)で16文字以上入力してください' }), { status: 400, headers });
    }
    if (rl.key) await clearAdminFailures(env, rl.key);

    await putSetting(env, 'admin_totp_pending', secret);

    const label = encodeURIComponent('峯商店管理画面');
    const issuer = encodeURIComponent('峯商店');
    const otpauthUri = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
    return new Response(JSON.stringify({ ok: true, secret, otpauthUri }), { headers });
  }

  if (body.action === 'activateTotp') {
    const code = String(body.code || '');
    const row = await env.ORDERS_DB.prepare(`SELECT value FROM site_settings WHERE key = 'admin_totp_pending'`).first();
    const pendingSecret = (row && row.value) || '';
    if (!pendingSecret) {
      return new Response(JSON.stringify({ error: '先に「追加」から認証用のQRコードを発行してください' }), { status: 400, headers });
    }

    const codeOk = await verifyTOTP(pendingSecret, code);
    if (!codeOk) {
      if (rl.key) await recordAdminFailure(env, rl.key, rl.attempts);
      return new Response(JSON.stringify({ error: '確認コードが正しくありません' }), { status: 401, headers });
    }
    if (rl.key) await clearAdminFailures(env, rl.key);

    await putSetting(env, 'admin_totp_secret', pendingSecret);
    await putSetting(env, 'admin_totp_pending', '');
    return new Response(JSON.stringify({ ok: true }), { headers });
  }

  if (body.action === 'disableTotp') {
    const password = String(body.password || '');
    const passwordOk = await verifyCurrentAdminPassword(env, password);
    if (!passwordOk) {
      if (rl.key) await recordAdminFailure(env, rl.key, rl.attempts);
      return new Response(JSON.stringify({ error: 'パスワードが正しくありません' }), { status: 401, headers });
    }
    if (rl.key) await clearAdminFailures(env, rl.key);

    await putSetting(env, 'admin_totp_secret', '');
    await putSetting(env, 'admin_totp_pending', '');
    return new Response(JSON.stringify({ ok: true }), { headers });
  }

  return new Response(JSON.stringify({ error: '不明な操作です' }), { status: 400, headers });
}
