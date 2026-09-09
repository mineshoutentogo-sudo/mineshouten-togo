/**
 * وضع الصيانة (Maintenance Mode) — يعمل قبل تقديم أي صفحة أو ملف على مستوى كل
 * الموقع (Cloudflare Pages Functions middleware). عند تفعيله من تبويب "メンテナンス"
 * بلوحة الإدارة، يُستبدل كل طلب لصفحة HTML عامة بصفحة الصيانة أدناه، فورًا وبدون
 * أي وميض للمحتوى الأصلي (العرض من الحافة (edge) قبل وصول أي شيء للمتصفح).
 *
 * ⚠️ لا يمسّ هذا أبدًا:
 *  - /admin و /admin/* — حتى يبقى بالإمكان الدخول للوحة الإدارة وإيقاف الصيانة ذاتها.
 *  - /api/* — حتى تستمر عمليات الدفع الجارية (webhook)، وتسجيل الدخول للوحة الإدارة،
 *    وأي طلب API آخر تحتاجه لوحة الإدارة نفسها لتعمل أثناء الصيانة.
 *  - أي ملف ثابت له امتداد (صور، CSS منفصل، robots.txt...) حتى لا تنكسر أصول
 *    لوحة الإدارة أو الملفات العامة (sitemap.xml) أثناء الصيانة.
 *
 * ⚠️ عند أي خلل بقاعدة البيانات (D1 غير مهيّأ أو الاستعلام فشل)، الموقع يبقى ظاهرًا
 * كالمعتاد (fail-open) — نفس فلسفة getProducts في helpers.js: هذه ميزة إضافية،
 * لا يجوز أبدًا أن تُسقط الموقع الحقيقي بسبب خلل بها هي نفسها.
 */
import { escapeHtml, readMaintenanceSettings, computeMaintenanceState } from './_lib/helpers.js';

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/admin' || path.startsWith('/admin/')) return next();
  if (path.startsWith('/api/')) return next();
  if (path !== '/' && /\.[a-zA-Z0-9]+$/.test(path)) return next(); // ملفات ثابتة (لها امتداد)
  if (!env.ORDERS_DB) return next();

  let state;
  try {
    const map = await readMaintenanceSettings(env);
    state = computeMaintenanceState(map);
  } catch (e) {
    console.error('maintenance middleware: site_settings lookup failed, serving site normally:', e);
    return next();
  }

  if (!state.effective) return next();

  return new Response(renderMaintenancePage(state.message, state.eta), {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
      'Cache-Control': 'no-store',
      'Retry-After': '1800',
    },
  });
}

function renderMaintenancePage(rawMessage, rawEta) {
  const message = (rawMessage || '').trim();
  const eta = (rawEta || '').trim();
  const heading = message ? escapeHtml(message) : 'ただいまメンテナンス中です';
  const etaBlock = eta
    ? `<div class="eta"><span class="eta-dot"></span>再開予定：${escapeHtml(eta)}</div>`
    : '';

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<meta http-equiv="refresh" content="120">
<title>ただいまメンテナンス中｜峯商店</title>
<link rel="icon" href="/logo.jpeg" type="image/jpeg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@600;700;800&family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
<style>
:root{
  --teal:#6fbac8; --teal-deep:#1f4e5a; --terra:#c2703d; --terra-deep:#a85a2c;
  --ink:#2b2723; --muted:#6b655c; --paper:#faf6ee; --paper-2:#fffdf8; --paper-deep:#f1eadd;
  --line:rgba(43,39,35,.10);
}
*{box-sizing:border-box;margin:0;padding:0}
body{
  min-height:100vh; font-family:'Noto Sans JP',sans-serif; color:var(--ink); line-height:1.8;
  -webkit-font-smoothing:antialiased; overflow-x:hidden;
  background:
    radial-gradient(circle at 18% 12%, #2c6577 0%, transparent 45%),
    radial-gradient(circle at 84% 82%, #24576a 0%, transparent 50%),
    linear-gradient(160deg, var(--teal-deep) 0%, #132f36 82%);
}
.ji{font-family:'Shippori Mincho',serif}

/* عناصر عائمة زخرفية خفيفة — لا صور، فقط أشكال CSS بلون العلامة */
.orb{position:fixed;border-radius:50%;filter:blur(2px);opacity:.16;pointer-events:none}
.orb1{width:260px;height:260px;top:-60px;left:-60px;background:var(--teal);animation:float1 16s ease-in-out infinite}
.orb2{width:180px;height:180px;bottom:-40px;right:6%;background:var(--terra);animation:float2 18s ease-in-out infinite}
.orb3{width:120px;height:120px;top:22%;right:-40px;background:var(--teal);animation:float1 13s ease-in-out infinite reverse}
@keyframes float1{0%,100%{transform:translate(0,0)}50%{transform:translate(24px,30px)}}
@keyframes float2{0%,100%{transform:translate(0,0)}50%{transform:translate(-22px,-26px)}}

.stage{position:relative;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px 20px}

.card{
  position:relative; width:100%; max-width:460px; background:var(--paper-2); border-radius:24px;
  padding:44px 36px 36px; text-align:center; box-shadow:0 40px 90px rgba(0,0,0,.38), 0 2px 0 rgba(255,255,255,.5) inset;
  animation:riseIn .6s cubic-bezier(.2,.8,.2,1) both;
}
@keyframes riseIn{from{opacity:0;transform:translateY(18px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}

.brand{font-size:24px;font-weight:700;color:var(--teal-deep);letter-spacing:.04em}
.brand-tag{font-size:10.5px;letter-spacing:.26em;color:var(--terra);font-weight:700;margin-top:5px}

/* أيقونة كوب ساخن متحركة — تنويه لطيف بهوية "CURRY & CAFÉ" بدل أيقونة أدوات عامة */
.mug-wrap{margin:28px auto 22px;width:88px;height:88px;position:relative}
.mug{width:100%;height:100%;color:var(--terra-deep)}
.steam{position:absolute;top:-22px;width:3px;border-radius:3px;background:linear-gradient(180deg,transparent,var(--teal) 45%,transparent);opacity:.75}
.s1{left:26px;height:20px;animation:steam 2.6s ease-in-out infinite}
.s2{left:44px;height:26px;animation:steam 2.6s ease-in-out .5s infinite}
.s3{left:62px;height:20px;animation:steam 2.6s ease-in-out 1s infinite}
@keyframes steam{
  0%{transform:translateY(0) scaleY(.7);opacity:0}
  30%{opacity:.8}
  100%{transform:translateY(-22px) scaleY(1.15);opacity:0}
}

h1{font-family:'Shippori Mincho',serif;font-size:22px;font-weight:700;color:var(--ink);line-height:1.6;margin-bottom:10px}
.sub{font-size:13.5px;color:var(--muted);line-height:1.9}

.progress{margin:24px auto 6px;width:100%;max-width:220px;height:5px;border-radius:6px;background:var(--paper-deep);overflow:hidden}
.progress-bar{height:100%;width:40%;border-radius:6px;background:linear-gradient(90deg,var(--teal),var(--terra));animation:slide 1.8s ease-in-out infinite}
@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(340%)}}

.eta{
  margin-top:18px;display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border-radius:20px;
  background:var(--paper-deep);color:var(--teal-deep);font-size:12.5px;font-weight:700;letter-spacing:.02em
}
.eta-dot{width:7px;height:7px;border-radius:50%;background:var(--terra);animation:pulse 1.6s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.7)}}

.divider{margin:28px 0 20px;border-top:1px solid var(--line)}

.contact-title{font-size:11.5px;letter-spacing:.14em;color:var(--muted);font-weight:700;margin-bottom:12px}
.contact-list{display:flex;flex-direction:column;gap:9px}
.contact-list a{
  display:flex;align-items:center;justify-content:center;gap:8px;font-size:13px;color:var(--ink);
  text-decoration:none;padding:9px 12px;border-radius:11px;background:var(--paper);border:1px solid var(--line);
  transition:background .15s,border-color .15s
}
.contact-list a:hover{background:var(--paper-deep);border-color:var(--teal)}
.contact-list svg{flex:0 0 auto;color:var(--teal-deep)}

.footer-note{margin-top:26px;font-size:11px;color:rgba(255,255,255,.55)}
</style>
</head>
<body>
<div class="orb orb1"></div>
<div class="orb orb2"></div>
<div class="orb orb3"></div>

<div class="stage">
  <div class="card">
    <div class="brand ji">峯商店</div>
    <div class="brand-tag">CURRY &amp; CAFÉ</div>

    <div class="mug-wrap">
      <span class="steam s1"></span><span class="steam s2"></span><span class="steam s3"></span>
      <svg class="mug" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 9h13v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9z"/>
        <path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17"/>
        <path d="M7 3.5c.6 1-.4 1.6 0 2.6M11 3.5c.6 1-.4 1.6 0 2.6"/>
      </svg>
    </div>

    <h1 class="ji">${heading}</h1>
    <p class="sub">ご迷惑をおかけし申し訳ございません。<br>ただいま準備を整えております。今しばらくお待ちください。</p>

    <div class="progress"><div class="progress-bar"></div></div>
    ${etaBlock}

    <div class="divider"></div>
    <div class="contact-title">お急ぎのご用件はこちらまで</div>
    <div class="contact-list">
      <a href="tel:08039575729">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        080-3957-5729
      </a>
      <a href="mailto:mineshouten.togo@gmail.com">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z" style="display:none"/><path d="M22 6c0-1.1-.9-2-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h16a2 2 0 0 0 2-2V6z"/><polyline points="22 6 12 13 2 6"/></svg>
        mineshouten.togo@gmail.com
      </a>
      <a href="https://www.instagram.com/mine_shouten.togo/" target="_blank" rel="noopener">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
        @mine_shouten.togo
      </a>
    </div>
  </div>
</div>
<div class="footer-note">© 峯商店 CURRY &amp; CAFÉ ｜ 鹿児島県薩摩川内市</div>
</body>
</html>`;
}
