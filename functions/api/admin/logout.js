/**
 * POST /api/admin/logout
 * يلغي كوكيز جلسة لوحة الإدارة.
 */
import { adminLogoutCookieHeader } from '../../_lib/helpers.js';

export async function onRequestPost() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': adminLogoutCookieHeader() },
  });
}
