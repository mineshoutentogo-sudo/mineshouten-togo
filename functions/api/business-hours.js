/**
 * GET /api/business-hours
 * ساعات العمل الأسبوعية العامة — يقرأها index.html عبر fetch لعرض قسم "営業時間"
 * ديناميكيًا (بدون إعادة نشر الموقع عند كل تعديل من لوحة الإدارة). لا يتطلب جلسة.
 * ⚠️ fail-open: أي خلل بـD1 يرجّع enabled:false بدل كسر الصفحة العامة.
 */
import { readBusinessHoursSettings, computeBusinessHoursState } from '../_lib/helpers.js';

export async function onRequestGet(context) {
  const { env } = context;
  // no-store: تُقرأ عبر fetch يتكرر من الموقع العام (تحميل الصفحة + polling كل 45 ثانية) —
  // أي تعديل بلوحة الإدارة لازم ينعكس فورًا بدون تأخير كاش
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

  try {
    const map = await readBusinessHoursSettings(env);
    return new Response(JSON.stringify(computeBusinessHoursState(map)), { headers });
  } catch (e) {
    console.error('business-hours GET failed:', e);
    return new Response(JSON.stringify({ enabled: false, hours: [], note: '' }), { headers });
  }
}
