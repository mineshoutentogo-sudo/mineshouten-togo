/**
 * أدوات مشتركة بين كل نقاط النهاية (functions/api/*.js)
 * ⚠️ اسم الملف يبدأ بـ "_" داخل مجلد يبدأ بـ "_lib" حتى لا يتعامل معه Cloudflare
 * Pages Functions كمسار (route) مستقل — هو فقط ملف مشترك يُستورد من الملفات الأخرى.
 *
 * ⚠️ هام: حدّث كتالوج PRODUCTS أدناه ليطابق تمامًا الكتالوج الموجود في index.html
 * (نفس المعرّفات id، ونفس الأسعار) في كل مرة تُغيّر فيها المنتجات أو الأسعار.
 */

// ⚠️ مفتاح اختبار مؤقت (sk_test_...) — آمن نسبيًا لأنه للتجربة فقط وليس للمعاملات الحقيقية.
// يُفضَّل دائمًا وضع المفتاح كمتغيّر بيئة مشفّر من لوحة Pages
// (Settings → Environment variables → Add secret → KOMOJU_SECRET_KEY)
// بدل تركه هنا كنص ظاهر في الكود — خصوصًا عند الانتقال لاحقًا لمفتاح sk_live_ الحقيقي.
export const FALLBACK_TEST_SECRET_KEY = 'sk_test_d3xty0w30lv04dhdiyqd4dm8';

// ⚠️ عدّل هذا لبريدك الإلكتروني الحقيقي — هنا ستصلك إشعارات كل طلب جديد
export const OWNER_EMAIL = 'mineshouten.togo@gmail.com';

// ⚠️ Secret Key الخاص بـ Cloudflare Turnstile (نموذج CONTACT).
export const FALLBACK_TURNSTILE_SECRET_KEY = '0x4AAAAAAEKOKCqQZ28evVCYoA1jFPtJyCU';

// ⚠️ مفتاح API الخاص بـ Resend (لإرسال بريد الطلبات وبريد نموذج التواصل).
export const FALLBACK_RESEND_API_KEY = 're_GCUW5hQN_LnywCEUHebAKp7ZcmXZDUHtH';

export const PRODUCTS = {
  set3:       { name: '季節のおまかせ3種',              price: 2700, weight: 750  },
  set5:       { name: '季節のおまかせ5種',              price: 4500, weight: 1250 },
  chicken:    { name: 'チキンカレー（辛味なし）',        price: 900,  weight: 250  },
  teacake:    { name: '知覧茶バスクチーズケーキ',        price: 2800, weight: 1700 },
  coffeecake: { name: '黒糖のコーヒーバスクチーズケーキ', price: 2800, weight: 1700 },
  scone:      { name: '季節のスコーン 3個セット',        price: 900,  weight: 180  },
};

// ===== 送料計算 =====
// ⚠️ عند تغيير هذا الجدول، حدّث نفس الجدول في index.html أيضًا (نفس المنطق تمامًا)
// مصدر البيانات: 峯商店_送料一覧.xlsx（クール便込みの金額）
export const FREE_SHIPPING_THRESHOLD = 11000; // 商品小計がこの金額以上で送料（地域送料＋クール便手数料）が完全無料
export const SHIPPING_SIZES = [
  // coolOption: null → ヤマト運輸公式サイトで確認済み：クール宅急便は120サイズ(15kg)超は取り扱い対象外
  { size: 60,  maxWeight: 2000,  coolOption: 275, rates: { kagoshima: 790,  hokkaido: 2340, tohoku_n: 1760, tohoku_s: 1760, kanto: 1460, niigata_nagano: 1460, hokuriku: 1190, tokai: 1190, kinki: 1060, chugoku: 940,  shikoku: 1060, kyushu: 940,  okinawa: 1320 } },
  { size: 80,  maxWeight: 5000,  coolOption: 330, rates: { kagoshima: 1090, hokkaido: 2620, tohoku_n: 2050, tohoku_s: 2050, kanto: 1740, niigata_nagano: 1740, hokuriku: 1480, tokai: 1480, kinki: 1350, chugoku: 1230, shikoku: 1350, kyushu: 1230, okinawa: 1940 } },
  { size: 100, maxWeight: 10000, coolOption: 440, rates: { kagoshima: 1410, hokkaido: 2930, tohoku_n: 2360, tohoku_s: 2360, kanto: 2050, niigata_nagano: 2050, hokuriku: 1790, tokai: 1790, kinki: 1650, chugoku: 1530, shikoku: 1650, kyushu: 1530, okinawa: 2580 } },
  { size: 120, maxWeight: 15000, coolOption: 715, rates: { kagoshima: 1730, hokkaido: 3580, tohoku_n: 2940, tohoku_s: 2940, kanto: 2610, niigata_nagano: 2610, hokuriku: 2310, tokai: 2310, kinki: 2170, chugoku: 2040, shikoku: 2170, kyushu: 2040, okinawa: 3230 } },
  { size: 140, maxWeight: 20000, coolOption: null, rates: { kagoshima: 2090, hokkaido: 4310, tohoku_n: 3620, tohoku_s: 3620, kanto: 3250, niigata_nagano: 3250, hokuriku: 2930, tokai: 2930, kinki: 2780, chugoku: 2630, shikoku: 2780, kyushu: 2630, okinawa: 3900 } },
  { size: 160, maxWeight: 25000, coolOption: null, rates: { kagoshima: 2410, hokkaido: 4690, tohoku_n: 4010, tohoku_s: 4010, kanto: 3630, niigata_nagano: 3630, hokuriku: 3320, tokai: 3320, kinki: 3160, chugoku: 3020, shikoku: 3160, kyushu: 3020, okinawa: 4550 } },
  { size: 180, maxWeight: 30000, coolOption: null, rates: { kagoshima: 3030, hokkaido: 7860, tohoku_n: 6650, tohoku_s: 6650, kanto: 5220, niigata_nagano: 5220, hokuriku: 4900, tokai: 4900, kinki: 4480, chugoku: 3680, shikoku: 4480, kyushu: 3680, okinawa: 6970 } },
];
// 都道府県 → 地域キー（有効な値の一覧としても使用）
export const VALID_REGIONS = ['kagoshima','hokkaido','tohoku_n','tohoku_s','kanto','niigata_nagano','hokuriku','tokai','kinki','chugoku','shikoku','kyushu','okinawa'];

export function calcShipping(totalWeight, subtotal, regionKey) {
  for (const s of SHIPPING_SIZES) {
    if (totalWeight <= s.maxWeight) {
      if (s.coolOption == null) return { fee: null, free: false, regionFee: null, coolFee: null, tooHeavy: true };
      if (subtotal >= FREE_SHIPPING_THRESHOLD) return { fee: 0, free: true, regionFee: 0, coolFee: 0, tooHeavy: false };
      const regionFee = s.rates[regionKey];
      if (typeof regionFee !== 'number') return { fee: null, free: false, regionFee: null, coolFee: null, tooHeavy: true };
      return { fee: regionFee + s.coolOption, free: false, regionFee, coolFee: s.coolOption, tooHeavy: false };
    }
  }
  return { fee: null, free: false, regionFee: null, coolFee: null, tooHeavy: true }; // 30kg超：要問い合わせ
}

// --- التحقق من توقيع KOMOJU (HMAC-SHA256) للتأكد أن التنبيه فعلًا من KOMOJU ---
export async function verifyKomojuSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const computed = [...new Uint8Array(sigBuffer)].map(b => b.toString(16).padStart(2, '0')).join('');
  // مقارنة ثابتة الزمن (constant-time) لمنع هجمات قياس التوقيت (timing attacks)
  if (computed.length !== signatureHeader.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ signatureHeader.charCodeAt(i);
  }
  return diff === 0;
}

// --- تنقية النصوص قبل إدراجها في HTML (منع حقن HTML/سكربت من بيانات الزبون) ---
export function escapeHtml(str) {
  return String(str ?? '-').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// --- التحقق من رمز Cloudflare Turnstile مع خوادم Cloudflare ---
export async function verifyTurnstile(token, secret, remoteIp) {
  if (!token || !secret) return false;
  try {
    const body = new URLSearchParams();
    body.append('secret', secret);
    body.append('response', token);
    if (remoteIp) body.append('remoteip', remoteIp);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    });
    const data = await res.json();
    return !!data.success;
  } catch {
    return false;
  }
}

// --- إرسال بريد رسالة "お問い合わせ" عبر Resend ---
export async function sendContactEmail(env, c) {
  const html = `
    <h2>新しいお問い合わせが届きました</h2>
    <p><b>お名前:</b> ${escapeHtml(c.name)}</p>
    <p><b>メール:</b> ${escapeHtml(c.email)}</p>
    <p><b>件名:</b> ${escapeHtml(c.subject || '(未入力)')}</p>
    <hr>
    <p><b>メッセージ:</b><br>${escapeHtml(c.message).replace(/\n/g, '<br>')}</p>
  `;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + (env.RESEND_API_KEY || FALLBACK_RESEND_API_KEY),
    },
    body: JSON.stringify({
      from: 'onboarding@resend.dev', // بريد الاختبار الجاهز من Resend — لا يحتاج تحقق نطاق
      to: OWNER_EMAIL,
      reply_to: c.email,
      subject: `【峯商店】お問い合わせ${c.subject ? '（' + c.subject + '）' : ''}`,
      html,
    }),
  });
  // ⚠️ إن لم نتحقق من رد Resend هنا، أي فشل بالإرسال (مفتاح خاطئ، بريد مرفوض...)
  // يمر بصمت والموقع يعرض للزبون "تم الإرسال" رغم عدم وصول أي بريد فعليًا.
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Resend API error (${res.status}): ${detail}`);
  }
}

// --- إرسال بريد إشعار عبر Resend ---
export async function sendOrderEmail(env, payment) {
  const md = payment.metadata || {};
  const yen = n => '¥' + Number(n || 0).toLocaleString('ja-JP');
  const html = `
    <h2>新しいご注文が入りました</h2>
    <p><b>金額:</b> ${yen(payment.amount)}</p>
    <p><b>お名前:</b> ${escapeHtml(md.customer_name)}</p>
    <p><b>電話番号:</b> ${escapeHtml(md.customer_phone)}</p>
    <p><b>都道府県:</b> ${escapeHtml(md.customer_pref)}</p>
    <p><b>郵便番号:</b> ${escapeHtml(md.customer_postal)}</p>
    <p><b>ご住所:</b> ${escapeHtml(md.customer_address)}</p>
    <p><b>メール:</b> ${escapeHtml(payment.payment_details?.email || md.customer_email)}</p>
    <p><b>送料:</b> ${md.shipping_fee != null ? yen(md.shipping_fee) : '-'}</p>
    <hr>
    <p><b>ご注文内容:</b><br>${escapeHtml(md.order_summary || '(内訳なし)').replace(/\n/g, '<br>')}</p>
    <p style="color:#999;font-size:12px">Payment ID: ${escapeHtml(payment.id)}</p>
  `;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + (env.RESEND_API_KEY || FALLBACK_RESEND_API_KEY),
    },
    body: JSON.stringify({
      from: 'onboarding@resend.dev', // بريد الاختبار الجاهز من Resend — لا يحتاج تحقق نطاق
      to: OWNER_EMAIL,
      subject: `【峯商店】新しいご注文（${yen(payment.amount)}）`,
      html,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Resend API error (${res.status}): ${detail}`);
  }
}
