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
// ⚠️ لا تضع المفتاح الحقيقي هنا أبدًا — أي كود يُرفع لـ GitHub يبقى مرئيًا
// بتاريخ الـ commits للأبد حتى لو حُذف لاحقًا. أضفه حصريًا من لوحة Cloudflare
// Pages: Settings → Environment variables → أضف TURNSTILE_SECRET_KEY كـ Secret.
export const FALLBACK_TURNSTILE_SECRET_KEY = '';

// ⚠️ مفتاح API الخاص بـ Resend (لإرسال بريد الطلبات وبريد نموذج التواصل).
// ⚠️ لا تضع مفتاح Resend الحقيقي هنا أبدًا — GitHub يكتشف مفاتيح Resend تلقائيًا
// (Secret Scanning) ويطلب إلغاءها فورًا بمجرد رفعها لأي مستودع. المفتاح الحقيقي
// يُضاف حصريًا من لوحة Cloudflare Pages: Settings → Environment variables →
// أضف RESEND_API_KEY كـ Secret. بدونه، إرسال البريد لن يعمل.
export const FALLBACK_RESEND_API_KEY = '';

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

// --- 電話番号を数字だけに正規化（KVのキーとして使用。表記ゆれ「090-1234-5678」「09012345678」を統一） ---
export function normalizePhone(phone) {
  return String(phone || '').replace(/[^\d]/g, '');
}

const CUSTOMER_KV_PREFIX = 'customer:';
const ATTEMPT_KV_PREFIX  = 'lookup_fail:';
const MAX_ATTEMPTS = 5;             // 30分あたりの最大失敗回数
const ATTEMPT_WINDOW_SEC = 30 * 60; // 30分
const CUSTOMER_TTL_SEC = 60 * 60 * 24 * 365; // 1年間保持（それ以降は自動削除）

// --- 決済完了時に呼び出し先情報をKVへ保存（次回注文時の呼び出し用） ---
export async function saveCustomerRecord(env, customer) {
  if (!env.CUSTOMERS_KV) return; // KVが未設定の環境では何もしない（機能を無効化するだけで落とさない）
  const phone = normalizePhone(customer.phone);
  if (!phone) return;
  const record = {
    name: customer.name || '',
    email: customer.email || '',
    pref: customer.pref || '',
    postal: customer.postal || '',
    address: customer.address || '',
    updatedAt: new Date().toISOString(),
  };
  await env.CUSTOMERS_KV.put(CUSTOMER_KV_PREFIX + phone, JSON.stringify(record), { expirationTtl: CUSTOMER_TTL_SEC });
}

// --- 電話番号＋郵便番号下4桁で呼び出し先情報を照会（総当たり対策のレート制限つき） ---
export async function lookupCustomerRecord(env, phoneRaw, postal4) {
  if (!env.CUSTOMERS_KV) return { ok: false, reason: 'unavailable' };
  const phone = normalizePhone(phoneRaw);
  if (!phone || !/^\d{4}$/.test(String(postal4 || ''))) return { ok: false, reason: 'invalid' };

  const attemptKey = ATTEMPT_KV_PREFIX + phone;
  const attemptsRaw = await env.CUSTOMERS_KV.get(attemptKey);
  const attempts = attemptsRaw ? parseInt(attemptsRaw, 10) : 0;
  if (attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'locked' };

  const dataRaw = await env.CUSTOMERS_KV.get(CUSTOMER_KV_PREFIX + phone);
  const record = dataRaw ? JSON.parse(dataRaw) : null;
  const last4 = record ? String(record.postal || '').replace(/[^\d]/g, '').slice(-4) : null;

  if (!record || last4 !== String(postal4)) {
    // فشل: نزيد عداد المحاولات (مو ندلّ الزبون هل الرقم غير موجود أصلاً أو الرمز غلط، عشان ما نسرّب معلومة)
    await env.CUSTOMERS_KV.put(attemptKey, String(attempts + 1), { expirationTtl: ATTEMPT_WINDOW_SEC });
    return { ok: false, reason: 'not_found' };
  }

  // نجاح: نصفّر عداد المحاولات
  if (attempts > 0) await env.CUSTOMERS_KV.delete(attemptKey);
  return { ok: true, record };
}

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

// ============================================================================
// قالب البريد الإلكتروني — بنفس هوية الموقع (الألوان + الخطوط + الأسلوب)
// مبني بجداول HTML (table-based) للتوافق مع Gmail وأغلب برامج البريد،
// وكل الأنماط inline لأن أغلب برامج البريد تتجاهل وسم <style> بالكامل.
// ============================================================================
const EMAIL_COLORS = {
  tealDeep:  '#1f4e5a',
  teal:      '#6fbac8',
  terra:     '#c2703d',
  ink:       '#2b2723',
  muted:     '#6b655c',
  paper:     '#faf6ee',
  paperDeep: '#f1eadd',
  paper2:    '#fffdf8',
  line:      '#e5ded0',
};

// يبني إطار البريد الكامل (رأس بعلامة "峯商店" + بطاقة المحتوى + تذييل)
function emailShell({ eyebrow, title, bodyHtml, footerNote }) {
  const c = EMAIL_COLORS;
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${eyebrow}</title>
</head>
<body style="margin:0;padding:0;background-color:${c.paperDeep};font-family:'Hiragino Sans','Noto Sans JP','Yu Gothic',sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${c.paperDeep};padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:${c.paper2};border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(43,39,35,.08);">

        <!-- Header -->
        <tr>
          <td style="background-color:${c.tealDeep};padding:30px 32px;text-align:center;">
            <div style="font-family:'Hiragino Mincho ProN','Yu Mincho','Shippori Mincho',serif;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:.04em;">
              峯商店
            </div>
            <div style="font-size:10px;letter-spacing:.24em;color:${c.teal};margin-top:4px;text-transform:uppercase;">
              CURRY &amp; CAF&Eacute;
            </div>
          </td>
        </tr>

        <!-- Eyebrow / kj label -->
        <tr>
          <td style="padding:32px 32px 0 32px;">
            <div style="font-family:'Hiragino Mincho ProN','Yu Mincho','Shippori Mincho',serif;font-size:12px;font-weight:700;letter-spacing:.18em;color:${c.terra};margin-bottom:8px;">
              ${eyebrow}
            </div>
            <h1 style="font-family:'Hiragino Mincho ProN','Yu Mincho','Shippori Mincho',serif;font-size:21px;font-weight:700;color:${c.ink};margin:0 0 24px 0;line-height:1.5;">
              ${title}
            </h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:0 32px 8px 32px;">
            ${bodyHtml}
          </td>
        </tr>

        <!-- Divider -->
        <tr>
          <td style="padding:28px 32px 0 32px;">
            <div style="border-top:1px solid ${c.line};"></div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px 30px 32px;">
            <p style="margin:0 0 6px 0;font-size:12px;color:${c.muted};line-height:1.7;">
              ${footerNote || ''}
            </p>
            <p style="margin:0;font-size:11px;color:${c.muted};">
              峯商店 CURRY &amp; CAF&Eacute; ｜ 鹿児島県薩摩川内市
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

// صف بيانات واحد (تسمية + قيمة) بشكل جدول متسق
function fieldRow(label, value) {
  const c = EMAIL_COLORS;
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid ${c.line};width:110px;font-size:13px;color:${c.muted};vertical-align:top;white-space:nowrap;">
        ${escapeHtml(label)}
      </td>
      <td style="padding:10px 0 10px 16px;border-bottom:1px solid ${c.line};font-size:14px;color:${c.ink};font-weight:500;vertical-align:top;">
        ${value}
      </td>
    </tr>`;
}

// صندوق نص بارز (لعرض محتوى الرسالة أو تفاصيل الطلب)
function highlightBox(innerHtml) {
  const c = EMAIL_COLORS;
  return `
    <div style="margin-top:20px;background-color:${c.paper};border:1px solid ${c.line};border-radius:10px;padding:18px 20px;font-size:14px;color:${c.ink};line-height:1.9;">
      ${innerHtml}
    </div>`;
}
// ============================================================================

// --- إرسال بريد رسالة "お問い合わせ" عبر Resend ---
export async function sendContactEmail(env, c) {
  const rows = [
    fieldRow('お名前', escapeHtml(c.name)),
    fieldRow('メール', `<a href="mailto:${escapeHtml(c.email)}" style="color:${EMAIL_COLORS.tealDeep};text-decoration:none;">${escapeHtml(c.email)}</a>`),
    fieldRow('件名', escapeHtml(c.subject || '(未入力)')),
  ].join('');

  const bodyHtml = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
    ${highlightBox(escapeHtml(c.message).replace(/\n/g, '<br>'))}
  `;

  const html = emailShell({
    eyebrow: 'CONTACT',
    title: '新しいお問い合わせが届きました',
    bodyHtml,
    footerNote: 'このメールは峯商店サイトの「お問い合わせ」フォームから自動送信されています。',
  });

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

  const rows = [
    fieldRow('金額', `<span style="color:${EMAIL_COLORS.terra};font-weight:700;font-size:16px;">${yen(payment.amount)}</span>`),
    fieldRow('お名前', escapeHtml(md.customer_name)),
    fieldRow('電話番号', escapeHtml(md.customer_phone)),
    fieldRow('メール', escapeHtml(payment.payment_details?.email || md.customer_email)),
    fieldRow('都道府県', escapeHtml(md.customer_pref)),
    fieldRow('郵便番号', escapeHtml(md.customer_postal)),
    fieldRow('ご住所', escapeHtml(md.customer_address)),
    fieldRow('送料', md.shipping_fee != null ? yen(md.shipping_fee) : '-'),
  ].join('');

  const bodyHtml = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
    ${highlightBox(escapeHtml(md.order_summary || '(内訳なし)').replace(/\n/g, '<br>'))}
    <p style="margin:16px 0 0 0;font-size:11px;color:${EMAIL_COLORS.muted};">Payment ID: ${escapeHtml(payment.id)}</p>
  `;

  const html = emailShell({
    eyebrow: 'NEW ORDER',
    title: '新しいご注文が入りました',
    bodyHtml,
    footerNote: 'このメールはKOMOJUでの決済完了時に自動送信されています。',
  });

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
