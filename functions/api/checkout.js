/**
 * POST /api/checkout
 * ينشئ جلسة دفع KOMOJU لسلة الزبون. يحل محل POST / في نسخة الـ Worker المستقل.
 * بما أن هذا يعمل على نفس نطاق الموقع (Cloudflare Pages Functions)، لا حاجة لأي
 * إعدادات CORS — الطلب من نفس الأصل (same-origin) دائمًا.
 */
import {
  PRODUCTS,
  VALID_REGIONS,
  calcShipping,
  FALLBACK_TEST_SECRET_KEY,
  verifyTurnstile,
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

  // ⚠️ بوت-プロテクション: نتحقق من Turnstile هنا بالسيرفر قبل أي معالجة أخرى
  // (نفس التحقق المستخدم بنموذج التواصل، الآن يحمي أيضًا نقطة إنشاء الدفع)
  const remoteIp = request.headers.get('CF-Connecting-IP');
  const turnstileValid = await verifyTurnstile(body.token, env.TURNSTILE_SECRET_KEY || FALLBACK_TURNSTILE_SECRET_KEY, remoteIp);
  if (!turnstileValid) {
    return new Response(JSON.stringify({ error: 'ボット防止の確認に失敗しました。ページを再読み込みしてもう一度お試しください。' }), { status: 403, headers });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) {
    return new Response(JSON.stringify({ error: 'カートが空です' }), { status: 400, headers });
  }

  // إعادة بناء السلة والمجموع من الخادم فقط — لا نثق بأي سعر يُرسَل من المتصفح
  const line_items = [];
  const orderItems = []; // نسخة مخصّصة لتخزين D1 لاحقًا: id/name/price كما احتُسبت هنا فعليًا (سجل تاريخي ثابت)
  let amount = 0;
  let totalWeight = 0;
  const summaryLines = [];
  for (const it of items) {
    const product = PRODUCTS[it.id];
    const qty = Math.max(0, Math.min(99, parseInt(it.quantity, 10) || 0));
    if (!product || qty <= 0) continue;
    line_items.push({
      description: product.name,
      amount: product.price,
      quantity: qty,
    });
    orderItems.push({ id: it.id, name: product.name, price: product.price, qty });
    amount += product.price * qty;
    totalWeight += product.weight * qty;
    summaryLines.push(`${product.name} × ${qty}`);
  }

  if (!line_items.length || amount <= 0) {
    return new Response(JSON.stringify({ error: '有効な商品がありません' }), { status: 400, headers });
  }

  // --- بيانات الشحن (الاسم/الهاتف/البريد/العنوان/المحافظة) — نتحقق منها أيضًا هنا ---
  const c = body.customer || {};
  const clean = (v, max) => String(v || '').trim().slice(0, max || 200);
  const customer = {
    name:    clean(c.name, 60),
    phone:   clean(c.phone, 30),
    email:   clean(c.email, 120),
    pref:    clean(c.pref, 30),
    postal:  clean(c.postal, 12),
    address: clean(c.address, 200),
  };
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email);
  if (!customer.name || !customer.phone || !emailOk || !customer.postal || !customer.address) {
    return new Response(JSON.stringify({ error: 'お届け先情報が未入力または不正です' }), { status: 400, headers });
  }
  if (!VALID_REGIONS.includes(customer.pref)) {
    return new Response(JSON.stringify({ error: '都道府県が正しく選択されていません' }), { status: 400, headers });
  }

  // --- 送料計算（サーバー側で確定） ---
  const shipping = calcShipping(totalWeight, amount, customer.pref);
  if (shipping.tooHeavy || shipping.fee == null) {
    return new Response(
      JSON.stringify({ error: '大変申し訳ございません。ご注文の合計重量が大きいため、通常のクール便でのお届けができません（クール宅急便でのお取り扱いは20kgまでとなります）。お手数ですが、分割発送のご相談も可能ですので、お電話（080-3957-5729）、Instagram DM等よりご連絡くださいませ。' }),
      { status: 400, headers }
    );
  }
  if (shipping.fee > 0) {
    line_items.push({ description: '送料（クール便込み）', amount: shipping.fee, quantity: 1 });
    summaryLines.push(`送料（クール便込み） × 1 (¥${shipping.fee.toLocaleString('ja-JP')})`);
  } else if (shipping.free) {
    summaryLines.push('送料無料（¥11,000以上のご注文）');
  }
  const subtotal = amount; // 送料を足す前の商品小計（D1保存用）
  amount += shipping.fee;

  const returnUrl = new URL(request.url).origin + '/?paid=1';

  try {
    const komojuRes = await fetch('https://komoju.com/api/v1/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + btoa((env.KOMOJU_SECRET_KEY || FALLBACK_TEST_SECRET_KEY) + ':'),
      },
      body: JSON.stringify({
        amount,
        currency: 'JPY',
        default_locale: 'ja',
        return_url: returnUrl,
        email: customer.email,
        line_items,
        // metadata: بيانات إضافية تظهر في لوحة تحكم KOMOJU، وتصل أيضًا مع تنبيه /api/webhook
        metadata: {
          customer_name: customer.name,
          customer_phone: customer.phone,
          customer_pref: customer.pref,
          customer_postal: customer.postal,
          customer_address: customer.address,
          customer_email: customer.email,
          shipping_fee: String(shipping.fee),
          subtotal: String(subtotal),
          order_summary: summaryLines.join('\n'),
          items_json: JSON.stringify(orderItems), // لِـ /api/webhook: تفكيك سطور الطلب عند الحفظ بقاعدة D1
        },
      }),
    });

    const session = await komojuRes.json();

    if (!komojuRes.ok || !session.session_url) {
      // ⚠️ لا نُرجع رد KOMOJU الخام (session) للمتصفح — قد يحتوي تفاصيل داخلية.
      console.error('KOMOJU session creation failed:', session);
      return new Response(
        JSON.stringify({ error: 'ただいま決済処理でエラーが発生しております。時間をおいて再度お試しいただくか、お電話にてご連絡ください。' }),
        { status: 502, headers }
      );
    }

    return new Response(JSON.stringify({ session_url: session.session_url }), { headers });
  } catch (err) {
    console.error('checkout error:', err);
    return new Response(JSON.stringify({ error: 'サーバーエラーが発生しました。時間をおいて再度お試しください。' }), {
      status: 500,
      headers,
    });
  }
}
