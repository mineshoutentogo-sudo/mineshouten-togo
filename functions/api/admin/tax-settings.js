/**
 * GET   /api/admin/tax-settings — 消費税・KOMOJU手数料の表示設定を取得（要ログイン）
 * PATCH /api/admin/tax-settings — 上記設定を保存。body:
 *   { tax_enabled, tax_rate, komoju_fee_enabled, komoju_fee_rate }
 *   (要ログイン)
 *
 * この設定は「注文詳細」モーダルの金額内訳の表示だけに使う。既存の注文の
 * amount（KOMOJUへの実際の請求額）自体は一切変更しない — あくまで税額・手数料額を
 * 参考として画面上に分解表示するための設定。
 */
import { verifyAdminSession } from '../../_lib/helpers.js';

const TAX_KEYS = ['tax_enabled', 'tax_rate', 'komoju_fee_enabled', 'komoju_fee_rate'];

async function readTaxSettings(env) {
  if (!env.ORDERS_DB) return {};
  const { results } = await env.ORDERS_DB.prepare(
    `SELECT key, value FROM site_settings WHERE key IN (${TAX_KEYS.map(() => '?').join(',')})`
  ).bind(...TAX_KEYS).all();
  const map = {};
  for (const row of results || []) map[row.key] = row.value;
  return map;
}

function toResponseShape(map) {
  return {
    tax_enabled: map.tax_enabled === '1',
    tax_rate: map.tax_rate != null ? Number(map.tax_rate) : 10,
    komoju_fee_enabled: map.komoju_fee_enabled === '1',
    komoju_fee_rate: map.komoju_fee_rate != null ? Number(map.komoju_fee_rate) : 3.6,
  };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json' };

  const authed = await verifyAdminSession(request, env.ADMIN_SESSION_SECRET);
  if (!authed) return new Response(JSON.stringify({ error: 'ログインが必要です' }), { status: 401, headers });

  try {
    const map = await readTaxSettings(env);
    return new Response(JSON.stringify(toResponseShape(map)), { headers });
  } catch (e) {
    console.error('admin/tax-settings GET failed:', e);
    return new Response(JSON.stringify({ error: '設定の取得に失敗しました' }), { status: 500, headers });
  }
}

export async function onRequestPatch(context) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json' };

  const authed = await verifyAdminSession(request, env.ADMIN_SESSION_SECRET);
  if (!authed) return new Response(JSON.stringify({ error: 'ログインが必要です' }), { status: 401, headers });

  if (!env.ORDERS_DB) {
    return new Response(JSON.stringify({ error: 'D1データベース（ORDERS_DB）が未設定です' }), { status: 500, headers });
  }

  let body;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: '無効なリクエストです' }), { status: 400, headers }); }

  const taxEnabled = body.tax_enabled ? '1' : '0';
  const komojuFeeEnabled = body.komoju_fee_enabled ? '1' : '0';

  const taxRateNum = Number(body.tax_rate);
  const komojuFeeRateNum = Number(body.komoju_fee_rate);
  if (!Number.isFinite(taxRateNum) || taxRateNum < 0 || taxRateNum > 100) {
    return new Response(JSON.stringify({ error: '消費税率は0〜100の数値で入力してください。' }), { status: 400, headers });
  }
  if (!Number.isFinite(komojuFeeRateNum) || komojuFeeRateNum < 0 || komojuFeeRateNum > 100) {
    return new Response(JSON.stringify({ error: 'KOMOJU手数料率は0〜100の数値で入力してください。' }), { status: 400, headers });
  }

  try {
    const stmt = env.ORDERS_DB.prepare(
      `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    );
    await env.ORDERS_DB.batch([
      stmt.bind('tax_enabled', taxEnabled),
      stmt.bind('tax_rate', String(taxRateNum)),
      stmt.bind('komoju_fee_enabled', komojuFeeEnabled),
      stmt.bind('komoju_fee_rate', String(komojuFeeRateNum)),
    ]);

    return new Response(JSON.stringify({
      ok: true,
      tax_enabled: taxEnabled === '1',
      tax_rate: taxRateNum,
      komoju_fee_enabled: komojuFeeEnabled === '1',
      komoju_fee_rate: komojuFeeRateNum,
    }), { headers });
  } catch (e) {
    console.error('admin/tax-settings PATCH failed:', e);
    return new Response(JSON.stringify({ error: '設定の保存に失敗しました' }), { status: 500, headers });
  }
}
