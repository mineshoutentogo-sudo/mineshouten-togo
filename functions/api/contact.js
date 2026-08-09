/**
 * POST /api/contact
 * يستقبل نموذج "お問い合わせ" مع التحقق عبر Cloudflare Turnstile، ويرسل بريدًا للمالك.
 */
import {
  verifyTurnstile,
  sendContactEmail,
  FALLBACK_TURNSTILE_SECRET_KEY,
} from '../_lib/helpers.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json' };

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: '無効なリクエストです' }), { status: 400, headers });
  }

  const clean = (v, max) => String(v || '').trim().slice(0, max || 200);
  const contact = {
    name:    clean(body.name, 60),
    email:   clean(body.email, 120),
    subject: clean(body.subject, 120),
    message: clean(body.message, 3000),
  };
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email);
  if (!contact.name || !emailOk || !contact.message) {
    return new Response(JSON.stringify({ error: 'お名前・メールアドレス・メッセージは必須です' }), { status: 400, headers });
  }

  // ⚠️ التحقق الحقيقي من Turnstile يتم هنا على الخادم (لا يمكن تزويره من المتصفح)
  const remoteIp = request.headers.get('CF-Connecting-IP');
  const turnstileValid = await verifyTurnstile(body.token, env.TURNSTILE_SECRET_KEY || FALLBACK_TURNSTILE_SECRET_KEY, remoteIp);
  if (!turnstileValid) {
    return new Response(JSON.stringify({ error: '認証チェックに失敗しました。もう一度お試しください。' }), { status: 403, headers });
  }

  try {
    await sendContactEmail(env, contact);
  } catch (err) {
    // ⚠️ لا نُرجع تفاصيل الخطأ الداخلية (err) للمتصفح — أي زائر يفتح
    // أدوات المطوّر يقدر يشوفها. نسجّلها بسجلات Cloudflare فقط (Logs / Tail)
    // ونعرض للزبون رسالة عامة بدل ذلك.
    console.error('sendContactEmail failed:', err);
    return new Response(JSON.stringify({ error: 'メール送信に失敗しました。時間をおいて再度お試しいただくか、お電話にてご連絡ください。' }), { status: 500, headers });
  }

  return new Response(JSON.stringify({ ok: true }), { headers });
}
