/**
 * POST /api/customer-lookup
 * 電話番号＋郵便番号下4桁の組み合わせで、前回のお届け先情報を呼び出す。
 * ⚠️ 電話番号だけでは本人確認にならない（秘密ではないため）ので、必ず
 * 郵便番号下4桁との組み合わせで確認し、さらに総当たり対策として
 * 電話番号ごとに30分あたり5回まで失敗を許容するレート制限をかけている。
 */
import { lookupCustomerRecord } from '../_lib/helpers.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json' };

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: '無効なリクエストです' }), { status: 400, headers });
  }

  const phone   = String(body.phone || '').trim();
  const postal4 = String(body.postal4 || '').trim();

  const result = await lookupCustomerRecord(env, phone, postal4);

  if (!result.ok) {
    // 見つからない場合・郵便番号が違う場合・ロック中の場合、理由を区別せず同じ汎用メッセージを返す
    // （「電話番号は登録されているが番号が違う」という情報自体が漏洩を助けるため）
    const status = result.reason === 'locked' ? 429 : 404;
    const msg = result.reason === 'locked'
      ? '試行回数が上限に達しました。しばらくしてから再度お試しください。'
      : '該当するご注文情報が見つかりませんでした。お手数ですが、新規でご入力ください。';
    return new Response(JSON.stringify({ error: msg }), { status, headers });
  }

  const r = result.record;
  return new Response(JSON.stringify({
    name: r.name, email: r.email, pref: r.pref, postal: r.postal, address: r.address,
  }), { headers });
}
