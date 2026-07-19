// ══════════════════════════════════════════════════════════════════
//  الخزينة والرواتب: صندوق المركز (نقدية) + إدارة الرواتب
//  خاص بمحاسب المركز (central_accountant) — يشمل مطابقة النقدية مع أمين الصندوق
// ══════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════
//  صندوق المركز (Cash Box)
// ══════════════════════════════════════════════════════════════════
PAGE_RENDER.cashbox = async (root) => {
  const [txns, balance, recons, accs] = await Promise.all([
    DB.listCashTransactions(100), DB.cashBalance(), DB.listCashReconciliations(10), DB.chartOfAccounts(),
  ]);
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">💰 صندوق المركز</div><div class="ph-sub">حركة النقدية بالمركز، والمطابقة الدورية مع أمين الصندوق</div></div>
      <div class="ph-actions">
        <button class="btn btn-o btn-sm" onclick="exportCashExcel()">⬇ تصدير إكسل</button>
        <button class="btn btn-p btn-sm" onclick="openCashTxnModal()">+ حركة نقدية</button>
      </div></div>

    <div class="stats">
      <div class="stat"><div class="stat-lbl">الرصيد النقدي الحالي (دفتري)</div><div class="stat-val gold">${fmt(balance)}</div></div>
      <div class="stat"><div class="stat-lbl">عدد الحركات المسجّلة</div><div class="stat-val">${txns.length}</div></div>
    </div>

    <div class="card">
      <div class="card-title">🔎 مطابقة نقدية مع أمين الصندوق</div>
      <div style="font-size:12px;color:var(--ink3);margin-bottom:14px">أدخل المبلغ الفعلي الذي بلّغ عنه أمين الصندوق (بعد عدّه) لمقارنته بالرصيد الدفتري بالنظام لحظة المطابقة.</div>
      <div class="fg" style="margin-bottom:10px">
        <div class="fgroup"><label>تاريخ المطابقة *</label><input type="date" id="cr-date" value="${todayISO()}"></div>
        <div class="fgroup"><label>الرصيد الدفتري (النظام)</label><input id="cr-system" value="${fmt(balance)}" readonly></div>
        <div class="fgroup"><label>المبلغ المُبلَّغ من أمين الصندوق *</label><input type="number" step="0.01" id="cr-counted" oninput="updateCashReconDiff(${balance})"></div>
      </div>
      <div class="fgroup" style="margin-bottom:10px"><label>ملاحظات</label><textarea id="cr-notes"></textarea></div>
      <div id="cr-diff" style="font-size:13px;margin-bottom:10px;color:var(--ink3)"></div>
      <button class="btn btn-p btn-sm" onclick="submitCashRecon(${balance})">💾 حفظ المطابقة</button>
    </div>

    ${recons.length ? `<div class="card"><div class="card-title">آخر عمليات المطابقة</div>
      <div class="itw"><table><thead><tr><th>التاريخ</th><th>الرصيد الدفتري</th><th>المبلغ المُبلَّغ</th><th>الفرق</th><th>بواسطة</th></tr></thead><tbody>
        ${recons.map(r => { const diff = Number(r.counted_amount) - Number(r.system_balance); return `<tr>
          <td class="mono">${r.recon_date}</td><td class="mono">${fmt(r.system_balance)}</td><td class="mono">${fmt(r.counted_amount)}</td>
          <td class="mono" style="color:${diff===0?'var(--ok)':'var(--danger)'}">${diff>0?'+':''}${fmt(diff)}</td>
          <td>${r.profiles?.full_name || '—'}</td></tr>`; }).join('')}
      </tbody></table></div></div>` : ''}

    <div class="card">
      <div class="card-title">سجل الحركات النقدية</div>
      <div class="itw"><table><thead><tr><th>التاريخ</th><th>النوع</th><th>المبلغ</th><th>الطرف الآخر</th><th>الوصف</th></tr></thead><tbody>
        ${txns.map(t => `<tr><td class="mono">${t.trans_date}</td>
          <td>${t.type === 'in' ? '<span class="chip-ok chip">قبض</span>' : '<span class="chip-danger chip">صرف</span>'}</td>
          <td class="mono ${t.type==='in'?'':''}" style="color:${t.type==='in'?'var(--ok)':'var(--danger)'}">${t.type==='in'?'+':'-'}${fmt(t.amount)}</td>
          <td>${t.chart_of_accounts ? `${t.chart_of_accounts.code} — ${t.chart_of_accounts.name}` : '—'}</td>
          <td>${t.description || ''}</td></tr>`).join('') || '<tr><td colspan="5" class="ec">لا توجد حركات بعد</td></tr>'}
      </tbody></table></div>
    </div>`;
  window.__cashCache = txns;
};

window.updateCashReconDiff = (systemBalance) => {
  const counted = Number(gv('cr-counted')) || 0;
  const diff = counted - systemBalance;
  const el = document.getElementById('cr-diff');
  el.textContent = counted ? `الفرق: ${diff > 0 ? '+' : ''}${fmt(diff)} ${diff === 0 ? '(مطابق تماماً ✓)' : diff > 0 ? '(زيادة بالصندوق)' : '(عجز بالصندوق)'}` : '';
  el.style.color = diff === 0 ? 'var(--ok)' : 'var(--danger)';
};

window.submitCashRecon = async (systemBalance) => {
  const recon_date = gv('cr-date');
  const counted_amount = Number(gv('cr-counted'));
  if (!recon_date || gv('cr-counted') === '') { toast('أدخل تاريخ المطابقة والمبلغ المُبلَّغ', 'e'); return; }
  try {
    await DB.createCashReconciliation({ recon_date, system_balance: systemBalance, counted_amount, notes: gv('cr-notes') });
    toast('✅ تم حفظ المطابقة النقدية', 's');
    go('cashbox');
  } catch (e) { toast('خطأ: ' + e.message, 'e'); }
};

window.openCashTxnModal = async () => {
  const accs = await DB.chartOfAccounts();
  const opts = accs.map(a => `<option value="${a.id}">${a.code} — ${a.name}</option>`).join('');
  showModal('حركة نقدية جديدة', `
    <div class="fg2" style="margin-bottom:10px">
      <div class="fgroup"><label>النوع *</label><select id="ct-type"><option value="in">قبض (دخول نقدية)</option><option value="out">صرف (خروج نقدية)</option></select></div>
      <div class="fgroup"><label>التاريخ *</label><input type="date" id="ct-date" value="${todayISO()}"></div>
    </div>
    <div class="fgroup" style="margin-bottom:10px"><label>المبلغ *</label><input type="number" step="0.01" id="ct-amount"></div>
    <div class="fgroup" style="margin-bottom:10px"><label>الحساب المقابل * (مثال: إيراد، ذمم، مصروف رواتب...)</label><select id="ct-acc"><option value="">اختر حساب...</option>${opts}</select></div>
    <div class="fgroup"><label>الوصف</label><input id="ct-desc"></div>
  `, async () => {
    const amount = Number(gv('ct-amount')), acc = gv('ct-acc'), date = gv('ct-date');
    if (!amount || amount <= 0 || !acc || !date) { toast('أكمل كل الحقول المطلوبة', 'e'); return false; }
    try {
      await DB.createCashTransaction({ type: gv('ct-type'), trans_date: date, amount, counterparty_account_id: acc, description: gv('ct-desc') });
      toast('✅ تم تسجيل الحركة النقدية', 's'); go('cashbox'); return true;
    } catch (e) { toast('خطأ: ' + e.message, 'e'); return false; }
  });
};

window.exportCashExcel = () => {
  const txns = window.__cashCache || [];
  exportRowsToExcel(
    txns.map((t,i) => ({ 'م': i+1, 'التاريخ': t.trans_date, 'النوع': t.type==='in'?'قبض':'صرف', 'المبلغ': t.amount,
      'الحساب المقابل': t.chart_of_accounts ? `${t.chart_of_accounts.code} — ${t.chart_of_accounts.name}` : '', 'الوصف': t.description || '' })),
    'صندوق المركز', `صندوق_المركز_${todayISO()}.xlsx`
  );
};

// ══════════════════════════════════════════════════════════════════
//  الرواتب (Payroll)
// ══════════════════════════════════════════════════════════════════
PAGE_RENDER.payroll = async (root, mode = 'list', runId = '') => {
  if (mode === 'employees') return renderPayrollEmployees(root);
  if (mode === 'new') return renderPayrollNew(root);
  if (mode === 'view') return renderPayrollView(root, runId);
  const runs = await DB.listPayrollRuns();
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">🧑‍💼 الرواتب</div><div class="ph-sub">إدارة كشوفات رواتب الموظفين وترحيلها محاسبياً</div></div>
      <div class="ph-actions">
        <button class="btn btn-o btn-sm" onclick="PAGE_RENDER.payroll(document.getElementById('page-root'),'employees')">👥 إدارة الموظفين</button>
        <button class="btn btn-p btn-sm" onclick="PAGE_RENDER.payroll(document.getElementById('page-root'),'new')">+ كشف رواتب جديد</button>
      </div></div>
    <div class="card"><div class="itw"><table><thead><tr><th>الفترة</th><th>الحالة</th><th></th></tr></thead><tbody>
      ${runs.map(r => `<tr><td class="mono">${r.period}</td>
        <td>${r.status === 'posted' ? '<span class="chip-ok chip">مُرحَّل</span>' : '<span class="chip chip-gold">مسودة</span>'}</td>
        <td><button class="btn btn-o btn-sm" onclick="PAGE_RENDER.payroll(document.getElementById('page-root'),'view','${r.id}')">عرض</button></td></tr>`).join('') || '<tr><td colspan="3" class="ec">لا توجد كشوفات رواتب بعد</td></tr>'}
    </tbody></table></div></div>`;
};

async function renderPayrollEmployees(root) {
  const employees = await DB.listEmployees(false);
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">👥 إدارة الموظفين</div><div class="ph-sub">قائمة الموظفين المستخدمة عند إنشاء كشوفات الرواتب</div></div>
      <div class="ph-actions">
        <button class="btn btn-o btn-sm" onclick="PAGE_RENDER.payroll(document.getElementById('page-root'),'list')">↩ رجوع</button>
        <button class="btn btn-p btn-sm" onclick="openEmployeeModal()">+ موظف جديد</button>
      </div></div>
    <div class="card"><div class="itw"><table><thead><tr><th>الاسم</th><th>الوظيفة</th><th>الراتب الأساسي</th><th>الحالة</th><th></th></tr></thead><tbody>
      ${employees.map(e => `<tr><td>${e.full_name}</td><td>${e.job_title || '—'}</td><td class="mono">${fmt(e.base_salary)}</td>
        <td>${e.is_active ? '<span class="chip-ok chip">فعّال</span>' : '<span class="chip-danger chip">موقوف</span>'}</td>
        <td><button class="btn btn-o btn-sm" onclick='openEmployeeModal(${JSON.stringify(e).replace(/'/g,"&#39;")})'>تعديل</button></td></tr>`).join('') || '<tr><td colspan="5" class="ec">لا يوجد موظفون بعد</td></tr>'}
    </tbody></table></div></div>`;
}
window.openEmployeeModal = (e = null) => {
  showModal(e ? 'تعديل موظف' : 'موظف جديد', `
    <div class="fgroup" style="margin-bottom:10px"><label>الاسم الكامل *</label><input id="m-emp-name" value="${e?.full_name || ''}"></div>
    <div class="fg2" style="margin-bottom:10px">
      <div class="fgroup"><label>الوظيفة</label><input id="m-emp-job" value="${e?.job_title || ''}"></div>
      <div class="fgroup"><label>الراتب الأساسي *</label><input type="number" step="0.01" id="m-emp-salary" value="${e?.base_salary ?? 0}"></div>
    </div>
    ${e ? `<div class="fgroup" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="m-emp-active" style="width:auto" ${e.is_active?'checked':''}><label style="margin:0">فعّال</label></div>` : ''}
  `, async () => {
    const full_name = gv('m-emp-name'), base_salary = Number(gv('m-emp-salary'));
    if (!full_name || !base_salary) { toast('الاسم والراتب الأساسي مطلوبان', 'e'); return false; }
    try {
      const payload = { full_name, job_title: gv('m-emp-job'), base_salary };
      if (e) { payload.id = e.id; payload.is_active = !!document.getElementById('m-emp-active')?.checked; }
      await DB.upsertEmployee(payload);
      toast('تم الحفظ', 's');
      PAGE_RENDER.payroll(document.getElementById('page-root'), 'employees'); return true;
    } catch (err) { toast('خطأ: ' + err.message, 'e'); return false; }
  });
};

async function renderPayrollNew(root) {
  const employees = await DB.listEmployees(true);
  const now = new Date();
  const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">🧑‍💼 كشف رواتب جديد</div><div class="ph-sub">يُنشأ كمسودة أولاً — راجعه ثم رحّله</div></div>
      <div class="ph-actions"><button class="btn btn-o btn-sm" onclick="PAGE_RENDER.payroll(document.getElementById('page-root'),'list')">↩ رجوع للقائمة</button></div></div>
    <div class="card">
      <div class="fg2" style="margin-bottom:14px">
        <div class="fgroup"><label>الفترة (شهر/سنة) *</label><input id="pr-period" value="${defaultPeriod}" placeholder="2026-07"></div>
        <div class="fgroup"><label>ملاحظات</label><input id="pr-notes"></div>
      </div>
      <div class="itw"><table><thead><tr><th>الموظف</th><th>الوظيفة</th><th>الراتب الأساسي</th><th>البدلات</th><th>الاستقطاعات</th><th>الصافي</th></tr></thead>
        <tbody id="pr-items">
          ${employees.map(e => `<tr data-emp="${e.id}" data-base="${e.base_salary}">
            <td>${e.full_name}</td><td>${e.job_title || '—'}</td><td class="mono">${fmt(e.base_salary)}</td>
            <td><input type="number" step="0.01" class="pr-allow" value="0" oninput="recalcPayrollRow(this)"></td>
            <td><input type="number" step="0.01" class="pr-deduct" value="0" oninput="recalcPayrollRow(this)"></td>
            <td class="mono pr-net">${fmt(e.base_salary)}</td>
          </tr>`).join('') || '<tr><td colspan="6" class="ec">لا يوجد موظفون فعّالون — أضفهم أولاً من "إدارة الموظفين"</td></tr>'}
        </tbody></table></div>
      <div class="grand-bar"><span class="grand-lbl">إجمالي صافي الرواتب</span><span class="grand-val" id="pr-grand">${fmt(employees.reduce((s,e)=>s+Number(e.base_salary),0))}</span></div>
      <div class="form-foot"><button class="btn btn-p" onclick="submitPayrollRun()">💾 حفظ كمسودة</button></div>
    </div>`;
}
window.recalcPayrollRow = (input) => {
  const tr = input.closest('tr');
  const base = Number(tr.dataset.base) || 0;
  const allow = Number(tr.querySelector('.pr-allow').value) || 0;
  const deduct = Number(tr.querySelector('.pr-deduct').value) || 0;
  const net = base + allow - deduct;
  tr.querySelector('.pr-net').textContent = fmt(net);
  let grand = 0;
  document.querySelectorAll('#pr-items tr').forEach(r => { grand += Number(r.querySelector('.pr-net')?.textContent.replace(/,/g,'')) || 0; });
  const grandEl = document.getElementById('pr-grand');
  if (grandEl) grandEl.textContent = fmt(grand);
};
window.submitPayrollRun = async () => {
  const period = gv('pr-period');
  if (!/^\d{4}-\d{2}$/.test(period)) { toast('صيغة الفترة يجب أن تكون YYYY-MM مثل 2026-07', 'e'); return; }
  const items = [];
  document.querySelectorAll('#pr-items tr').forEach(tr => {
    const empId = tr.dataset.emp;
    if (!empId) return;
    const base = Number(tr.dataset.base) || 0;
    const allowances = Number(tr.querySelector('.pr-allow').value) || 0;
    const deductions = Number(tr.querySelector('.pr-deduct').value) || 0;
    items.push({ employee_id: empId, base_salary: base, allowances, deductions });
  });
  if (!items.length) { toast('لا يوجد موظفون لإضافتهم بالكشف', 'e'); return; }
  try {
    const run = await DB.createPayrollRun({ period, notes: gv('pr-notes'), created_by: ME.id }, items);
    toast('✅ تم حفظ كشف الرواتب كمسودة', 's');
    PAGE_RENDER.payroll(document.getElementById('page-root'), 'view', run.id);
  } catch (e) { toast('خطأ: ' + e.message, 'e'); }
};

async function renderPayrollView(root, runId) {
  const [runs, items] = await Promise.all([DB.listPayrollRuns(), DB.payrollItems(runId)]);
  const run = runs.find(r => r.id === runId);
  if (!run) { root.innerHTML = '<div class="card ec">لم يتم العثور على كشف الرواتب</div>'; return; }
  const totalNet = items.reduce((s, it) => s + Number(it.base_salary) + Number(it.allowances) - Number(it.deductions), 0);
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">🧑‍💼 كشف رواتب ${run.period}</div><div class="ph-sub">${run.status === 'posted' ? 'مُرحَّل' : 'مسودة'}</div></div>
      <div class="ph-actions">
        <button class="btn btn-o btn-sm" onclick="PAGE_RENDER.payroll(document.getElementById('page-root'),'list')">↩ رجوع للقائمة</button>
        <button class="btn btn-o btn-sm" onclick="exportPayrollExcel('${runId}')">⬇ تصدير إكسل</button>
        ${run.status !== 'posted' ? `<button class="btn btn-p btn-sm" onclick="postPayrollConfirm('${runId}')">🔒 ترحيل الكشف وإنشاء القيد</button>` : ''}
      </div></div>
    <div class="card"><div class="itw"><table><thead><tr><th>الموظف</th><th>الوظيفة</th><th>الأساسي</th><th>البدلات</th><th>الاستقطاعات</th><th>الصافي</th></tr></thead><tbody>
      ${items.map(it => `<tr><td>${it.employees?.full_name || ''}</td><td>${it.employees?.job_title || '—'}</td>
        <td class="mono">${fmt(it.base_salary)}</td><td class="mono">${fmt(it.allowances)}</td><td class="mono">${fmt(it.deductions)}</td>
        <td class="gold-txt">${fmt(it.net_pay ?? (Number(it.base_salary)+Number(it.allowances)-Number(it.deductions)))}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="grand-bar"><span class="grand-lbl">إجمالي صافي الرواتب</span><span class="grand-val">${fmt(totalNet)}</span></div>
    </div>`;
}
window.exportPayrollExcel = async (runId) => {
  const items = await DB.payrollItems(runId);
  exportRowsToExcel(
    items.map((it,i) => ({ 'م': i+1, 'الموظف': it.employees?.full_name||'', 'الوظيفة': it.employees?.job_title||'',
      'الأساسي': it.base_salary, 'البدلات': it.allowances, 'الاستقطاعات': it.deductions,
      'الصافي': it.net_pay ?? (Number(it.base_salary)+Number(it.allowances)-Number(it.deductions)) })),
    'كشف الرواتب', `كشف_الرواتب_${todayISO()}.xlsx`
  );
};
window.postPayrollConfirm = async (runId) => {
  if (!confirm('سيتم ترحيل كشف الرواتب وإنشاء قيد محاسبي بإجمالي الصافي. هذا الإجراء لا يمكن التراجع عنه. متابعة؟')) return;
  try {
    await DB.postPayrollRun(runId);
    toast('✅ تم ترحيل كشف الرواتب', 's');
    PAGE_RENDER.payroll(document.getElementById('page-root'), 'view', runId);
  } catch (e) { toast('تعذر الترحيل: ' + e.message, 'e'); }
};
