/**
 * GET /api/topbar
 * إعدادات شريط الإشعار العلوي العام — يقرأها index.html عبر fetch لإظهار/إخفاء شريط
 * "サイト準備中"（تحت الإنشاء）و/أو "デモ版"（وضع تجريبي）ديناميكيًا، بدون إعادة نشر
 * الموقع عند كل تعديل من لوحة الإدارة. لا يتطلب جلسة.
 * ⚠️ fail-open: أي خلل بـD1 يرجّع كليهما false بدل كسر الصفحة العامة.
 */
import { readTopbarSettings, computeTopbarState } from '../_lib/helpers.js';

export async function onRequestGet(context) {
  const { env } = context;
  // no-store: تُقرأ عبر fetch عند كل تحميل للصفحة العامة — أي تعديل بلوحة الإدارة
  // لازم ينعكس فورًا بدون تأخير كاش
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

  try {
    const map = await readTopbarSettings(env);
    const state = computeTopbarState(map);
    // العام لا يحتاج إلا القيمتين الفعليتين (لا داعي لكشف تاريخ الانتهاء الخام هنا)
    return new Response(JSON.stringify({ construction: state.construction, trial: state.trial }), { headers });
  } catch (e) {
    console.error('topbar GET failed:', e);
    return new Response(JSON.stringify({ construction: false, trial: false }), { headers });
  }
}
