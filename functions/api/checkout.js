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

  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) {
    return new Response(JSON.stringify({ error: 'カートが空です' }), { status: 400, headers });
  }

  // إعادة بناء السلة والمجموع من الخادم فقط — لا نثق بأي سعر يُرسَل من المتصفح
  const line_items = [];
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
      JSON.stringify({ error: '大変申し訳ございません。ご注文の合計重量が大きいため、クール便でのお届けができません（クール宅急便は120サイズ〔15kg〕までのお取り扱いとなります）。お手数ですが、分割発送のご相談も可能ですので、お電話（080-3957-5729）、Instagram DM等よりご連絡くださいませ。' }),
      { status: 400, headers }
    );
  }
  if (shipping.fee > 0) {
    line_items.push({ description: '送料（クール便込み）', amount: shipping.fee, quantity: 1 });
    summaryLines.push(`送料（クール便込み） × 1 (¥${shipping.fee.toLocaleString('ja-JP')})`);
  } else if (shipping.free) {
    summaryLines.push('送料無料（¥11,000以上のご注文）');
  }
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
          order_summary: summaryLines.join('\n'),
        },
      }),
    });

    const session = await komojuRes.json();

    if (!komojuRes.ok || !session.session_url) {
      return new Response(
        JSON.stringify({ error: 'KOMOJUセッションの作成に失敗しました', detail: session }),
        { status: 502, headers }
      );
    }

    return new Response(JSON.stringify({ session_url: session.session_url }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'サーバーエラー', detail: String(err) }), {
      status: 500,
      headers,
    });
  }
}
