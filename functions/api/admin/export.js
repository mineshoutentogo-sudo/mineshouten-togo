/**
 * GET /api/admin/export?q=&from=&to=&pref=&shipped=&product=
 * يصدّر كل الطلبات المطابقة للفلاتر (بدون حد للعدد) كملف CSV — يتطلّب جلسة صالحة.
 * نفس معاملات الفلترة المستخدمة في /api/admin/orders تمامًا.
 */
import { verifyAdminSession } from '../../_lib/helpers.js';

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const jsonHeaders = { 'Content-Type': 'application/json' };

  const authed = await verifyAdminSession(request, env.ADMIN_SESSION_SECRET);
  if (!authed) return new Response(JSON.stringify({ error: 'ログインが必要です' }), { status: 401, headers: jsonHeaders });

  if (!env.ORDERS_DB) {
    return new Response(JSON.stringify({ error: 'D1データベース（ORDERS_DB）が未設定です' }), { status: 500, headers: jsonHeaders });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim().slice(0, 60);
  const from = (url.searchParams.get('from') || '').trim().slice(0, 10);
  const to = (url.searchParams.get('to') || '').trim().slice(0, 10);
  const pref = (url.searchParams.get('pref') || '').trim().slice(0, 30);
  const shipped = (url.searchParams.get('shipped') || '').trim().slice(0, 10);
  const product = (url.searchParams.get('product') || '').trim().slice(0, 30);

  const where = [];
  const params = [];
  if (q) {
    where.push('(customer_name LIKE ? OR customer_phone LIKE ? OR id LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (from)     { where.push('date(created_at) >= ?'); params.push(from); }
  if (to)       { where.push('date(created_at) <= ?'); params.push(to); }
  if (pref)     { where.push('customer_pref = ?'); params.push(pref); }
  if (shipped)  { where.push('shipped_status = ?'); params.push(shipped); }
  if (product)  { where.push('id IN (SELECT order_id FROM order_items WHERE product_id = ?)'); params.push(product); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const list = await env.ORDERS_DB.prepare(
      `SELECT id, created_at, customer_name, customer_phone, customer_email, customer_pref, customer_postal, customer_address,
              subtotal, shipping_fee, amount, status, shipped_status, tracking_number, order_summary
       FROM orders ${whereSql} ORDER BY created_at DESC`
    ).bind(...params).all();

    const cols = ['注文ID','日時','お客様名','電話番号','メール','都道府県','郵便番号','ご住所','商品小計','送料','合計','支払い状況','発送状況','追跡番号','内訳'];
    const rows = (list.results || []).map((o) => [
      o.id, o.created_at, o.customer_name, o.customer_phone, o.customer_email,
      o.customer_pref, o.customer_postal, o.customer_address,
      o.subtotal, o.shipping_fee, o.amount, o.status,
      o.shipped_status === 'shipped' ? '発送済み' : '未発送',
      o.tracking_number || '', o.order_summary,
    ].map(csvCell).join(','));

    const csv = '﻿' + cols.join(',') + '\r\n' + rows.join('\r\n') + '\r\n'; // BOM付きでExcelでも文字化けしない

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="orders_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (e) {
    console.error('admin/export failed:', e);
    return new Response(JSON.stringify({ error: 'エクスポートに失敗しました' }), { status: 500, headers: jsonHeaders });
  }
}
