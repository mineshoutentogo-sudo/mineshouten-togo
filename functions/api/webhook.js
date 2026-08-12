/**
 * POST /api/webhook
 * يستقبل تنبيه KOMOJU عند اكتمال الدفع، ويرسل بريدًا بتفاصيل الطلب.
 * ⚠️ إن كنت فعّلت Webhook سابقًا من لوحة KOMOJU على الرابط القديم، لازم تحدّثه
 * ليصير: https://mineshouten-togo.pages.dev/api/webhook
 */
import { verifyKomojuSignature, sendOrderEmail, saveCustomerRecord } from '../_lib/helpers.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  const rawBody = await request.text();
  const signature = request.headers.get('X-Komoju-Signature');
  const valid = await verifyKomojuSignature(rawBody, signature, env.KOMOJU_WEBHOOK_SECRET);
  if (!valid) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401 });
  }

  let event;
  try { event = JSON.parse(rawBody); } catch { return new Response('Bad payload', { status: 400 }); }

  if (event.type === 'payment.captured' || event.type === 'payment.authorized') {
    const payment = event.data;
    const md = payment.metadata || {};

    try { await sendOrderEmail(env, payment); }
    catch (e) { console.error('sendOrderEmail failed:', e); } // لا نفشل الاستجابة لـ KOMOJU حتى لو فشل إرسال البريد

    // نحفظ بيانات التوصيل بـ KV عشان تُستحضَر تلقائيًا بالطلب القادم (رقم الهاتف + آخر 4 أرقام بريدي)
    try {
      await saveCustomerRecord(env, {
        name: md.customer_name, phone: md.customer_phone, email: md.customer_email || payment.payment_details?.email,
        pref: md.customer_pref, postal: md.customer_postal, address: md.customer_address,
      });
    } catch (e) { console.error('saveCustomerRecord failed:', e); }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
}
