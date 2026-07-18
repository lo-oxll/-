// ══════════════════════════════════════════════════════════════════
//  التطبيق الرئيسي: أدوات مشتركة + التوجيه بين الصفحات + الإقلاع
// ══════════════════════════════════════════════════════════════════
const gv = id => (document.getElementById(id)?.value ?? '').trim();
const sv = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
const fmt = n => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = n => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 3 });
const todayISO = () => new Date().toISOString().split('T')[0];

let ME = null; // ملف تعريف المستخدم الحالي (profiles row)

function toast(msg, kind = 'i') {
  const wrap = document.getElementById('toast-wrap');
  const el = document.createElement('div');
  el.className = 'toast t' + kind;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}
window.toast = toast;

// ── صلاحيات حسب الدور ──────────────────────────────
const ROLE_LABEL = { admin: 'مدير النظام', accountant: 'محاسب', manager: 'مدير', auditor: 'مدقق' };
function can(...roles) { return ME && roles.includes(ME.role); }
window.can = can;

// ── تعريف الصفحات والقائمة الجانبية ──────────────────────────────
const PAGES = [
  { section: 'عام', items: [
    { id: 'dashboard', label: 'لوحة التحكم', icon: '📊' },
  ]},
  { section: 'الحركة المخزنية', items: [
    { id: 'receive', label: 'استلام مخزني', icon: '📥', roles: ['admin','accountant'] },
    { id: 'issue', label: 'إصدار مخزني', icon: '📤', roles: ['admin','accountant'] },
    { id: 'docs', label: 'سجل الوثائق', icon: '📑' },
    { id: 'balance', label: 'الأرصدة والجرد', icon: '⚖️' },
    { id: 'lowstock', label: 'تنبيهات إعادة الطلب', icon: '🔔' },
    { id: 'materials', label: 'دليل المواد', icon: '📚', roles: ['admin','accountant'] },
    { id: 'warehouses', label: 'المخازن', icon: '🏬', roles: ['admin'] },
  ]},
  { section: 'المحاسبة', items: [
    { id: 'coa', label: 'دليل الحسابات', icon: '🗂' },
    { id: 'journal', label: 'القيود المحاسبية', icon: '🧾' },
    { id: 'reports', label: 'التقارير المالية', icon: '📈' },
  ]},
  { section: 'الإدارة', items: [
    { id: 'fiscal', label: 'السنوات المالية', icon: '📅' },
    { id: 'users', label: 'المستخدمون والصلاحيات', icon: '👤', roles: ['admin'] },
    { id: 'auditlog', label: 'سجل المراجعة', icon: '🔐' },
  ]},
];

function renderSidebar() {
  const nav = document.getElementById('sidebar-nav');
  nav.innerHTML = PAGES.map(sec => {
    const items = sec.items.filter(it => !it.roles || can(...it.roles));
    if (!items.length) return '';
    return `<div class="nav-section">${sec.section}</div>` + items.map(it =>
      `<div class="nav-item" data-page="${it.id}" onclick="go('${it.id}')">
         <span class="nav-icon">${it.icon}</span><span>${it.label}</span>
         <span class="badge hidden" id="badge-${it.id}"></span>
       </div>`).join('');
  }).join('');

  document.getElementById('user-name').textContent = ME.full_name;
  document.getElementById('user-role').textContent = ROLE_LABEL[ME.role] || ME.role;
  document.getElementById('user-avatar').textContent = (ME.full_name || '?').trim()[0]?.toUpperCase() || '?';
}

const PAGE_RENDER = {}; // كل وحدة (inventory.js, accounting.js ...) تسجّل رواسم صفحاتها هنا
window.PAGE_RENDER = PAGE_RENDER;

async function go(pageId) {
  if (!PAGE_RENDER[pageId]) return;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === pageId));
  const main = document.getElementById('page-root');
  main.innerHTML = '<div class="ec">جارِ التحميل...</div>';
  try {
    await PAGE_RENDER[pageId](main);
  } catch (err) {
    console.error(err);
    main.innerHTML = `<div class="card"><div class="ec">⚠️ حدث خطأ أثناء تحميل الصفحة<br><span class="mono" style="color:var(--danger)">${err.message || err}</span></div></div>`;
  }
  document.getElementById('sidebar')?.classList.remove('open');
  await refreshBadges();
}
window.go = go;

async function refreshBadges() {
  try {
    const low = await DB.lowStock();
    const b = document.getElementById('badge-lowstock');
    if (b) { b.textContent = low.length; b.classList.toggle('hidden', low.length === 0); }
  } catch (e) { /* صامت */ }
}

// ── مربعات بحث ذاتية الإكمال عامة (تُستخدم لاختيار المواد) ──────────────────────
function bindAutocomplete(inputEl, portalEl, getItems, onPick, renderItem) {
  let items = [], hi = 0;
  const run = async () => {
    items = await getItems(inputEl.value.trim());
    if (!items.length) { portalEl.style.display = 'none'; return; }
    hi = 0;
    portalEl.innerHTML = items.map((it, i) => renderItem(it, i === 0)).join('');
    portalEl.style.display = 'block';
    portalEl.querySelectorAll('.ac-item').forEach((el, i) => el.addEventListener('mousedown', () => { onPick(items[i]); portalEl.style.display = 'none'; }));
  };
  inputEl.addEventListener('input', run);
  inputEl.addEventListener('focus', run);
  inputEl.addEventListener('keydown', e => {
    if (!items.length || portalEl.style.display === 'none') return;
    if (e.key === 'ArrowDown') { e.preventDefault(); hi = Math.min(hi + 1, items.length - 1); highlight(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); hi = Math.max(hi - 1, 0); highlight(); }
    if (e.key === 'Enter') { e.preventDefault(); onPick(items[hi]); portalEl.style.display = 'none'; }
    if (e.key === 'Escape') portalEl.style.display = 'none';
  });
  document.addEventListener('mousedown', e => { if (!portalEl.contains(e.target) && e.target !== inputEl) portalEl.style.display = 'none'; });
  function highlight() { portalEl.querySelectorAll('.ac-item').forEach((el, i) => el.classList.toggle('hi', i === hi)); }
}
window.bindAutocomplete = bindAutocomplete;

// ── الثيم (فاتح/داكن) ──────────────────────────────
window.toggleTheme = () => {
  document.documentElement.classList.toggle('light');
  localStorage.setItem('wh-theme', document.documentElement.classList.contains('light') ? 'light' : 'dark');
};

// ── الإقلاع ──────────────────────────────
async function boot() {
  if (localStorage.getItem('wh-theme') === 'light') document.documentElement.classList.add('light');

  const session = await DB.currentSession();
  if (!session) { showLogin(); return; }

  ME = await DB.currentProfile();
  if (!ME) { showLogin(); return; }

  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  renderSidebar();
  go('dashboard');
}

document.addEventListener('DOMContentLoaded', boot);
