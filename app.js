// ══════════════════════════════════════════════════════════════════
//  التطبيق الرئيسي: أدوات مشتركة + التوجيه بين الصفحات + الإقلاع
// ══════════════════════════════════════════════════════════════════
const gv = id => (document.getElementById(id)?.value ?? '').trim();
const sv = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
// المبالغ بالدينار العراقي — بدون فاصلة عشرية (لا يوجد تعامل عملي بكسور الدينار)
const fmt = n => Math.round(Number(n) || 0).toLocaleString('en-US');
const fmtIQD = n => fmt(n) + ' د.ع';
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

// ── تصدير إكسل عام (تُستخدم بكل صفحات التقارير وسجل الوثائق) ──────────────────────────────
function exportRowsToExcel(rows, sheetName, filename) {
  if (!rows || !rows.length) { toast('لا توجد بيانات لتصديرها', 'e'); return; }
  const ws = XLSX.utils.json_to_sheet(rows);
  const colWidths = Object.keys(rows[0]).map(k => ({ wch: Math.max(10, Math.min(34, k.length + 4)) }));
  ws['!cols'] = colWidths;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename);
}
window.exportRowsToExcel = exportRowsToExcel;

// ── ترجمة أخطاء قيود قاعدة البيانات الشائعة لرسائل عربية مفهومة ──────────────────────────────
function friendlyStockError(msg) {
  if (!msg) return 'حدث خطأ غير متوقع';
  if (msg.includes('material_stock_qty_nonneg') || msg.toLowerCase().includes('check constraint') && msg.includes('qty_on_hand')) {
    return 'تعذّر تنفيذ العملية: الكمية المطلوبة تتجاوز الرصيد الفعلي المتاح بهذا المخزن (رُفضت من قاعدة البيانات لمنع رصيد سالب — قد تكون هذه المادة صُرفت للتو بعملية أخرى متزامنة، حدّث الصفحة وحاول مجدداً)';
  }
  return msg;
}
window.friendlyStockError = friendlyStockError;

// ── صلاحيات حسب الدور ──────────────────────────────
const ROLE_LABEL = { admin: 'مدير النظام', accountant: 'محاسب سيطرة مخزنية', central_accountant: 'محاسب المركز', manager: 'مدير', auditor: 'مدقق' };
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
    { id: 'physcount', label: 'الجرد الدوري', icon: '🧮', roles: ['admin','accountant','manager'] },
    { id: 'lowstock', label: 'تنبيهات إعادة الطلب', icon: '🔔' },
    { id: 'materials', label: 'دليل المواد', icon: '📚', roles: ['admin','accountant'] },
    { id: 'warehouses', label: 'المخازن', icon: '🏬', roles: ['admin'] },
  ]},
  { section: 'المحاسبة', items: [
    { id: 'coa', label: 'دليل الحسابات', icon: '🗂' },
    { id: 'journal', label: 'القيود المحاسبية', icon: '🧾' },
    { id: 'reports', label: 'التقارير المالية', icon: '📈' },
  ]},
  { section: 'إدارة الموظفين', items: [
    { id: 'employees', label: 'الموظفون', icon: '🪪', roles: ['admin','central_accountant'] },
  ]},
  { section: 'الخزينة والرواتب', items: [
    { id: 'cashbox', label: 'صندوق المركز', icon: '💰', roles: ['admin','central_accountant'] },
    { id: 'payroll', label: 'الرواتب', icon: '🧑‍💼', roles: ['admin','central_accountant'] },
  ]},
  { section: 'السلفة المستديمة', items: [
    { id: 'pettycash', label: 'سندات الصرف', icon: '🧾', roles: ['admin','central_accountant','manager','auditor'] },
  ]},
  { section: 'الإدارة', items: [
    { id: 'fiscal', label: 'السنوات المالية', icon: '📅', roles: ['admin','manager'] },
    { id: 'users', label: 'المستخدمون والصلاحيات', icon: '👤', roles: ['admin','manager'] },
    { id: 'auditlog', label: 'سجل المراجعة', icon: '🔐', roles: ['admin','manager'] },
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
  if (can('admin','manager')) {
    try {
      const pending = await DB.listPendingUsers();
      const bu = document.getElementById('badge-users');
      if (bu) { bu.textContent = pending.length; bu.classList.toggle('hidden', pending.length === 0); }
    } catch (e) { /* صامت */ }
  }
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

  if (!ME.is_active) { showPending(); return; }

  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('pending-screen')?.classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  renderSidebar();
  go('dashboard');
}
window.showPending = function showPending() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.add('hidden');
  document.getElementById('pending-screen')?.classList.remove('hidden');
};

document.addEventListener('DOMContentLoaded', boot);
