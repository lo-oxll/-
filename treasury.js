// ══════════════════════════════════════════════════════════════════
//  الخزينة والرواتب: صندوق المركز (نقدية احترافية) + إدارة الرواتب الكاملة
//  خاص بمحاسب المركز (central_accountant) ومدير النظام
// ══════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════
//  صندوق المركز (Cash Box) — احترافي: سند آلي + رصيد جارٍ + كشف مطبوع
// ══════════════════════════════════════════════════════════════════
PAGE_RENDER.cashbox = async (root, fromDate = '', toDate = '') => {
  const now = new Date();
  if (!fromDate) fromDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
  if (!toDate) toDate = todayISO();

  const [txnsAsc, openingBalance, currentBalance, recons] = await Promise.all([
    DB.listCashTransactions(2000, fromDate, toDate, true),
    DB.cashBalanceBefore(fromDate),
    DB.cashBalance(),
    DB.listCashReconciliations(10),
  ]);

  let running = openingBalance;
  const rows = txnsAsc.map(t => {
    running += (t.type === 'in' ? Number(t.amount) : -Number(t.amount));
    return { ...t, running_balance: running };
  });
  window.__cashCache = rows;
  window.__cashRange = { fromDate, toDate, openingBalance };

  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">💰 صندوق المركز</div><div class="ph-sub">كشف حركة النقدية بالمركز — أرقام سندات آلية + رصيد جارٍ + مطابقة أمين الصندوق</div></div>
      <div class="ph-actions">
        <button class="btn btn-o btn-sm" onclick="exportCashExcel()">⬇ تصدير إكسل</button>
        <button class="btn btn-o btn-sm" onclick="printCashStatement()">🖨 طباعة الكشف</button>
        <button class="btn btn-p btn-sm" onclick="openCashTxnModal()">+ حركة نقدية</button>
      </div></div>

    <div class="stats">
      <div class="stat"><div class="stat-lbl">الرصيد النقدي الحالي (دفتري)</div><div class="stat-val gold">${fmtIQD(currentBalance)}</div></div>
      <div class="stat"><div class="stat-lbl">الرصيد الافتتاحي للفترة المعروضة</div><div class="stat-val">${fmtIQD(openingBalance)}</div></div>
      <div class="stat"><div class="stat-lbl">عدد حركات الفترة</div><div class="stat-val">${rows.length}</div></div>
    </div>

    <div class="card">
      <div class="card-title">🔎 مطابقة نقدية مع أمين الصندوق</div>
      <div style="font-size:12px;color:var(--ink3);margin-bottom:14px">أدخل المبلغ الفعلي الذي بلّغ عنه أمين الصندوق (بعد عدّه) لمقارنته بالرصيد الدفتري الحالي بالنظام.</div>
      <div class="fg" style="margin-bottom:10px">
        <div class="fgroup"><label>تاريخ المطابقة *</label><input type="date" id="cr-date" value="${todayISO()}"></div>
        <div class="fgroup"><label>الرصيد الدفتري (النظام)</label><input id="cr-system" value="${fmtIQD(currentBalance)}" readonly></div>
        <div class="fgroup"><label>المبلغ المُبلَّغ من أمين الصندوق *</label><input type="number" step="1" id="cr-counted" oninput="updateCashReconDiff(${currentBalance})"></div>
      </div>
      <div class="fgroup" style="margin-bottom:10px"><label>ملاحظات</label><textarea id="cr-notes"></textarea></div>
      <div id="cr-diff" style="font-size:13px;margin-bottom:10px;color:var(--ink3)"></div>
      <button class="btn btn-p btn-sm" onclick="submitCashRecon(${currentBalance})">💾 حفظ المطابقة</button>
    </div>

    ${recons.length ? `<div class="card"><div class="card-title">آخر عمليات المطابقة</div>
      <div class="itw"><table><thead><tr><th>التاريخ</th><th>الرصيد الدفتري (د.ع)</th><th>المبلغ المُبلَّغ (د.ع)</th><th>الفرق (د.ع)</th><th>بواسطة</th></tr></thead><tbody>
        ${recons.map(r => { const diff = Number(r.counted_amount) - Number(r.system_balance); return `<tr>
          <td class="mono">${r.recon_date}</td><td class="mono">${fmt(r.system_balance)}</td><td class="mono">${fmt(r.counted_amount)}</td>
          <td class="mono" style="color:${diff===0?'var(--ok)':'var(--danger)'}">${diff>0?'+':''}${fmt(diff)}</td>
          <td>${r.profiles?.full_name || '—'}</td></tr>`; }).join('')}
      </tbody></table></div></div>` : ''}

    <div class="card">
      <div class="ph" style="margin:0 0 14px"><div class="card-title" style="margin:0;padding:0;border:none">كشف حركة الصندوق</div>
        <div class="ph-actions">
          <input type="date" id="cash-from" value="${fromDate}" style="width:150px">
          <span style="color:var(--ink3);font-size:12px;align-self:center">إلى</span>
          <input type="date" id="cash-to" value="${toDate}" style="width:150px">
          <button class="btn btn-o btn-sm" onclick="filterCashRange()">تصفية</button>
        </div></div>
      <div class="itw"><table><thead><tr>
        <th>رقم السند</th><th>التاريخ</th><th>النوع</th><th>المبلغ (د.ع)</th><th>الرصيد الجاري (د.ع)</th><th>الحساب المقابل</th><th>الوصف</th><th></th>
      </tr></thead><tbody>
        <tr style="background:var(--surface2)"><td colspan="4" style="font-weight:700">رصيد افتتاحي بتاريخ ${fromDate}</td><td class="mono gold-txt" colspan="4">${fmt(openingBalance)}</td></tr>
        ${rows.map(t => `<tr><td class="mono">#${t.voucher_no}</td><td class="mono">${t.trans_date}</td>
          <td>${t.type === 'in' ? '<span class="chip-ok chip">قبض</span>' : '<span class="chip-danger chip">صرف</span>'}</td>
          <td class="mono" style="color:${t.type==='in'?'var(--ok)':'var(--danger)'}">${t.type==='in'?'+':'-'}${fmt(t.amount)}</td>
          <td class="mono">${fmt(t.running_balance)}</td>
          <td>${t.chart_of_accounts ? `${t.chart_of_accounts.code} — ${t.chart_of_accounts.name}` : '—'}</td>
          <td>${t.description || ''}</td>
          <td><button class="btn btn-o btn-sm" onclick="printCashVoucher('${t.id}')">🖨 السند</button>
          ${can('admin') ? `<button class="btn btn-d btn-sm" onclick="deleteCashTxnConfirm('${t.id}')">حذف</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="ec">لا توجد حركات بهذه الفترة</td></tr>'}
      </tbody></table></div>
    </div>`;
};

window.filterCashRange = () => {
  PAGE_RENDER.cashbox(document.getElementById('page-root'), gv('cash-from'), gv('cash-to'));
};

window.deleteCashTxnConfirm = async (id) => {
  if (!confirm('متأكد تريد حذف هذه الحركة النقدية؟ سيُحذف القيد المحاسبي المرتبط بها أيضاً.')) return;
  try {
    await DB.deleteCashTransaction(id);
    toast('تم حذف الحركة', 's');
    const r = window.__cashRange || {};
    PAGE_RENDER.cashbox(document.getElementById('page-root'), r.fromDate, r.toDate);
  } catch (e) { toast('تعذّر الحذف: ' + e.message, 'e'); }
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
    <div class="fgroup" style="margin-bottom:10px"><label>المبلغ *</label><input type="number" step="1" id="ct-amount"></div>
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
    txns.map((t,i) => ({ 'م': i+1, 'رقم السند': t.voucher_no, 'التاريخ': t.trans_date, 'النوع': t.type==='in'?'قبض':'صرف', 'المبلغ': t.amount, 'الرصيد الجاري': t.running_balance,
      'الحساب المقابل': t.chart_of_accounts ? `${t.chart_of_accounts.code} — ${t.chart_of_accounts.name}` : '', 'الوصف': t.description || '' })),
    'صندوق المركز', `صندوق_المركز_${todayISO()}.xlsx`
  );
};

window.printCashVoucher = async (id) => {
  const t = await DB.getCashTransactionById(id);
  const html = `
    <div style="text-align:center;font-size:16px;font-weight:800;margin-bottom:4px">${t.type === 'in' ? 'سند قبض' : 'سند صرف'}</div>
    <div style="text-align:center;font-size:12px;color:#555;margin-bottom:20px">رقم السند: ${t.voucher_no}</div>
    <table style="width:100%;font-size:13px;margin-bottom:20px"><tr>
      <td style="padding:6px 0">التاريخ: <b>${t.trans_date}</b></td>
      <td style="padding:6px 0">المبلغ: <b>${fmtIQD(t.amount)}</b></td>
    </tr></table>
    <div style="font-size:13px;margin-bottom:10px">${t.type === 'in' ? 'استلمنا من' : 'صرفنا إلى'}: <b>${t.chart_of_accounts ? t.chart_of_accounts.name : '—'}</b></div>
    <div style="font-size:13px;margin-bottom:10px">وذلك مقابل: <b>${t.description || '—'}</b></div>
    <div style="display:flex;justify-content:space-between;margin-top:60px;font-size:12px">
      <div>أمين الصندوق: ____________________</div><div>المستلم/الدافع: ____________________</div><div>المحاسب: ____________________</div>
    </div>`;
  await renderPrintArea(t.type === 'in' ? 'سند قبض' : 'سند صرف', html);
  window.print();
};

window.printCashStatement = async () => {
  const range = window.__cashRange || {};
  const body = document.querySelector('#page-root .card:last-child .itw').innerHTML;
  await renderPrintArea(`كشف حركة الصندوق (${range.fromDate} — ${range.toDate})`, `<div class="itw">${body}</div>`);
  window.print();
};

// ══════════════════════════════════════════════════════════════════
//  الرواتب (Payroll) — هيكل كامل مطابق لكشف الرواتب الحكومي الفعلي
// ══════════════════════════════════════════════════════════════════
PAGE_RENDER.payroll = async (root, mode = 'list', runId = '') => {
  if (mode === 'employees') return renderPayrollEmployees(root);
  if (mode === 'new') return renderPayrollNew(root);
  if (mode === 'view') return renderPayrollView(root, runId);
  const runs = await DB.listPayrollRuns();
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">🧑‍💼 الرواتب</div><div class="ph-sub">إدارة كشوفات رواتب الموظفين وترحيلها محاسبياً — الأسماء والمبالغ حرّة التعديل كل شهر</div></div>
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
    <div class="ph"><div><div class="ph-title">👥 إدارة الموظفين</div><div class="ph-sub">قائمة مرجعية لتسهيل تعبئة كشف الرواتب الشهري — إضافة/تعديل/حذف حرّ بالكامل</div></div>
      <div class="ph-actions">
        <button class="btn btn-o btn-sm" onclick="PAGE_RENDER.payroll(document.getElementById('page-root'),'list')">↩ رجوع</button>
        <button class="btn btn-p btn-sm" onclick="openEmployeeModal()">+ موظف جديد</button>
      </div></div>
    <div class="card"><div class="itw"><table><thead><tr><th>الاسم</th><th>الوظيفة</th><th>الراتب الأساسي (د.ع)</th><th>الحالة</th><th></th></tr></thead><tbody>
      ${employees.map(e => `<tr><td>${e.full_name}</td><td>${e.job_title || '—'}</td><td class="mono">${fmt(e.base_salary)}</td>
        <td>${e.is_active ? '<span class="chip-ok chip">فعّال</span>' : '<span class="chip-danger chip">موقوف</span>'}</td>
        <td>
          <button class="btn btn-o btn-sm" onclick='openEmployeeModal(${JSON.stringify(e).replace(/'/g,"&#39;")})'>تعديل</button>
          <button class="btn btn-d btn-sm" onclick="deleteEmployeeConfirm('${e.id}','${(e.full_name||'').replace(/'/g,"\\'")}')">حذف</button>
        </td></tr>`).join('') || '<tr><td colspan="5" class="ec">لا يوجد موظفون بعد</td></tr>'}
    </tbody></table></div></div>`;
}
window.deleteEmployeeConfirm = async (id, name) => {
  if (!confirm(`متأكد تريد حذف الموظف "${name}"؟`)) return;
  try {
    await DB.deleteEmployee(id);
    toast('تم حذف الموظف', 's');
    PAGE_RENDER.payroll(document.getElementById('page-root'), 'employees');
  } catch (e) { toast('تعذّر الحذف: ' + e.message, 'e'); }
};
window.openEmployeeModal = (e = null) => {
  showModal(e ? 'تعديل موظف' : 'موظف جديد', `
    <div class="fgroup" style="margin-bottom:10px"><label>الاسم الكامل *</label><input id="m-emp-name" value="${e?.full_name || ''}"></div>
    <div class="fg2" style="margin-bottom:10px">
      <div class="fgroup"><label>الوظيفة</label><input id="m-emp-job" value="${e?.job_title || ''}"></div>
      <div class="fgroup"><label>الراتب الأساسي *</label><input type="number" step="1" id="m-emp-salary" value="${e?.base_salary ?? 0}"></div>
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

function payrollHeaderHTML() {
  return `<thead>
    <tr>
      <th rowspan="2">ت</th><th rowspan="2">الاسم الثلاثي</th><th rowspan="2">مقدار الراتب (د.ع)</th>
      <th colspan="2">الاضافات</th><th rowspan="2">الراتب مع الاضافات (د.ع)</th>
      <th colspan="9">الاستقطاعات</th>
      <th rowspan="2">مجموع الاستقطاعات (د.ع)</th><th rowspan="2">مجموع الاستحقاق (د.ع)</th>
      <th rowspan="2">الملاحظات</th><th rowspan="2"></th>
    </tr>
    <tr>
      <th>زيادة راتب 5%</th><th>اخرى</th>
      <th>استقطاع الضمان</th><th>الغياب (أيام)</th><th>مبلغ الغياب</th><th>سلف</th><th>عدد الافراد</th>
      <th>مبلغ الاشتراك</th><th>الضمان الصحي</th><th>تبرعات صندوق شهداء الشرطة</th><th>اخرى</th>
    </tr>
  </thead>`;
}
function payrollRowHTML(it) {
  it = it || {};
  const nm = (it.employee_name || '').replace(/"/g, '&quot;');
  const notes = (it.notes || '').replace(/"/g, '&quot;');
  return `<tr class="pr-row">
    <td class="mono pr-idx"></td>
    <td style="min-width:170px"><input class="pr-name" list="pr-emp-list" value="${nm}" data-empid="${it.employee_id || ''}" onchange="prNamePicked(this)" style="min-width:160px"></td>
    <td><input type="number" step="1" class="pr-base" value="${it.base_salary || 0}" oninput="recalcPayrollRow(this)" style="width:110px"></td>
    <td><input type="number" step="1" class="pr-raise" value="${it.raise_5pct || 0}" oninput="recalcPayrollRow(this)" style="width:85px"></td>
    <td><input type="number" step="1" class="pr-otheradd" value="${it.other_additions || 0}" oninput="recalcPayrollRow(this)" style="width:85px"></td>
    <td class="mono pr-gross gold-txt" style="width:110px">0</td>
    <td><input type="number" step="1" class="pr-ss" value="${it.social_security || 0}" oninput="recalcPayrollRow(this)" style="width:95px"></td>
    <td><input type="number" step="1" class="pr-absdays" value="${it.absence_days || 0}" oninput="recalcPayrollRow(this)" style="width:65px"></td>
    <td><input type="number" step="1" class="pr-absamt" value="${it.absence_amount || 0}" oninput="recalcPayrollRow(this)" style="width:85px"></td>
    <td><input type="number" step="1" class="pr-loan" value="${it.loan_deduction || 0}" oninput="recalcPayrollRow(this)" style="width:85px"></td>
    <td><input type="number" step="1" class="pr-dep" value="${it.dependents_count || 0}" oninput="recalcPayrollRow(this)" style="width:65px"></td>
    <td><input type="number" step="1" class="pr-sub" value="${it.subscription_amount || 0}" oninput="recalcPayrollRow(this)" style="width:85px"></td>
    <td><input type="number" step="1" class="pr-health" value="${it.health_insurance || 0}" oninput="recalcPayrollRow(this)" style="width:85px"></td>
    <td><input type="number" step="1" class="pr-martyrs" value="${it.martyrs_fund || 0}" oninput="recalcPayrollRow(this)" style="width:85px"></td>
    <td><input type="number" step="1" class="pr-otherded" value="${it.other_deductions || 0}" oninput="recalcPayrollRow(this)" style="width:85px"></td>
    <td class="mono pr-totded" style="width:110px">0</td>
    <td class="mono pr-net gold-txt" style="width:120px">0</td>
    <td><input class="pr-notes" value="${notes}" style="min-width:170px"></td>
    <td><button class="btn btn-d btn-sm" onclick="removePayrollRow(this)">✕</button></td>
  </tr>`;
}
function recalcRow(tr) {
  const val = cls => Number(tr.querySelector('.' + cls)?.value) || 0;
  const gross = val('pr-base') + val('pr-raise') + val('pr-otheradd');
  const totded = val('pr-ss') + val('pr-absamt') + val('pr-loan') + val('pr-sub') + val('pr-health') + val('pr-martyrs') + val('pr-otherded');
  const net = gross - totded;
  const g = tr.querySelector('.pr-gross'); if (g) g.textContent = fmt(gross);
  const d = tr.querySelector('.pr-totded'); if (d) d.textContent = fmt(totded);
  const n = tr.querySelector('.pr-net'); if (n) n.textContent = fmt(net);
}
window.recalcPayrollRow = (el) => { recalcRow(el.closest('tr')); recalcPayrollGrand(); };
function renumberPayrollRows() {
  document.querySelectorAll('#pr-items tr').forEach((tr, i) => { const idx = tr.querySelector('.pr-idx'); if (idx) idx.textContent = i + 1; });
}
window.addPayrollRow = () => {
  document.getElementById('pr-items').insertAdjacentHTML('beforeend', payrollRowHTML());
  renumberPayrollRows();
};
window.removePayrollRow = (btn) => {
  btn.closest('tr').remove();
  renumberPayrollRows();
  recalcPayrollGrand();
};
window.recalcPayrollGrand = () => {
  let grand = 0;
  document.querySelectorAll('#pr-items tr').forEach(tr => {
    const val = cls => Number(tr.querySelector('.' + cls)?.value) || 0;
    const gross = val('pr-base') + val('pr-raise') + val('pr-otheradd');
    const totded = val('pr-ss') + val('pr-absamt') + val('pr-loan') + val('pr-sub') + val('pr-health') + val('pr-martyrs') + val('pr-otherded');
    grand += gross - totded;
  });
  const el = document.getElementById('pr-grand');
  if (el) el.textContent = fmtIQD(grand);
};
window.prNamePicked = (input) => {
  const emp = window.__employeesMap?.[input.value.trim()];
  if (!emp) { input.dataset.empid = ''; return; }
  input.dataset.empid = emp.id;
  const tr = input.closest('tr');
  const baseInp = tr.querySelector('.pr-base');
  if (baseInp && (!baseInp.value || Number(baseInp.value) === 0)) { baseInp.value = emp.base_salary; recalcRow(tr); recalcPayrollGrand(); }
};
function recalcAllPayrollRows() {
  document.querySelectorAll('#pr-items tr').forEach(recalcRow);
  renumberPayrollRows();
  recalcPayrollGrand();
}
function collectPayrollItems() {
  const items = [];
  document.querySelectorAll('#pr-items tr').forEach(tr => {
    const name = tr.querySelector('.pr-name')?.value?.trim();
    if (!name) return;
    const num = cls => Number(tr.querySelector('.' + cls)?.value) || 0;
    items.push({
      employee_id: tr.querySelector('.pr-name')?.dataset.empid || null,
      employee_name: name,
      base_salary: num('pr-base'), raise_5pct: num('pr-raise'), other_additions: num('pr-otheradd'),
      social_security: num('pr-ss'), absence_days: num('pr-absdays'), absence_amount: num('pr-absamt'),
      loan_deduction: num('pr-loan'), dependents_count: num('pr-dep'), subscription_amount: num('pr-sub'),
      health_insurance: num('pr-health'), martyrs_fund: num('pr-martyrs'), other_deductions: num('pr-otherded'),
      notes: tr.querySelector('.pr-notes')?.value || '',
    });
  });
  return items;
}

async function renderPayrollNew(root) {
  const [employees, template] = await Promise.all([DB.listEmployees(true), DB.latestPayrollItemsTemplate()]);
  window.__employeesMap = {}; employees.forEach(e => { window.__employeesMap[e.full_name] = e; });
  const now = new Date();
  const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const initialItems = template.length ? template : employees.map(e => ({ employee_id: e.id, employee_name: e.full_name, base_salary: e.base_salary }));

  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">🧑‍💼 كشف رواتب جديد</div><div class="ph-sub">${template.length ? 'مُعبَّأ تلقائياً من آخر كشف — عدّل الأسماء والمبالغ حسب هذا الشهر' : 'يُنشأ كمسودة أولاً — راجعه ثم رحّله'}</div></div>
      <div class="ph-actions"><button class="btn btn-o btn-sm" onclick="PAGE_RENDER.payroll(document.getElementById('page-root'),'list')">↩ رجوع للقائمة</button></div></div>
    <div class="card">
      <div class="fg2" style="margin-bottom:14px">
        <div class="fgroup"><label>الفترة (شهر/سنة) *</label><input id="pr-period" value="${defaultPeriod}" placeholder="2026-07"></div>
        <div class="fgroup"><label>ملاحظات عامة على الكشف</label><input id="pr-notes"></div>
      </div>
      <datalist id="pr-emp-list">${employees.map(e => `<option value="${e.full_name.replace(/"/g,'&quot;')}">`).join('')}</datalist>
      <div class="itw"><table>${payrollHeaderHTML()}
        <tbody id="pr-items">${initialItems.map(payrollRowHTML).join('')}</tbody></table></div>
      <div class="form-foot" style="justify-content:flex-start">
        <button class="btn btn-o btn-sm" onclick="addPayrollRow()">+ إضافة صف</button>
        <button class="btn btn-o btn-sm" onclick="reloadPayrollFromEmployees()">👥 تحميل من قائمة الموظفين</button>
      </div>
      <div class="grand-bar"><span class="grand-lbl">إجمالي صافي الرواتب</span><span class="grand-val" id="pr-grand">0 د.ع</span></div>
      <div class="form-foot"><button class="btn btn-p" onclick="submitPayrollRun()">💾 حفظ كمسودة</button></div>
    </div>`;
  recalcAllPayrollRows();
}
window.reloadPayrollFromEmployees = async () => {
  if (!confirm('سيتم استبدال كل الصفوف الحالية بقائمة الموظفين الفعّالين. متابعة؟')) return;
  const employees = await DB.listEmployees(true);
  document.getElementById('pr-items').innerHTML = employees.map(e => payrollRowHTML({ employee_id: e.id, employee_name: e.full_name, base_salary: e.base_salary })).join('');
  recalcAllPayrollRows();
};
window.submitPayrollRun = async () => {
  const period = gv('pr-period');
  if (!/^\d{4}-\d{2}$/.test(period)) { toast('صيغة الفترة يجب أن تكون YYYY-MM مثل 2026-07', 'e'); return; }
  const items = collectPayrollItems();
  if (!items.length) { toast('أضف موظفاً واحداً على الأقل بالكشف', 'e'); return; }
  try {
    const run = await DB.createPayrollRun({ period, notes: gv('pr-notes'), created_by: ME.id }, items);
    toast('✅ تم حفظ كشف الرواتب كمسودة', 's');
    PAGE_RENDER.payroll(document.getElementById('page-root'), 'view', run.id);
  } catch (e) { toast('خطأ: ' + e.message, 'e'); }
};

async function renderPayrollView(root, runId) {
  const [runs, items, employees] = await Promise.all([DB.listPayrollRuns(), DB.payrollItems(runId), DB.listEmployees(true)]);
  const run = runs.find(r => r.id === runId);
  if (!run) { root.innerHTML = '<div class="card ec">لم يتم العثور على كشف الرواتب</div>'; return; }
  window.__employeesMap = {}; employees.forEach(e => { window.__employeesMap[e.full_name] = e; });
  const isDraft = run.status !== 'posted';
  const totalNet = items.reduce((s, it) => s + Number(it.net_pay ?? 0), 0);

  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">🧑‍💼 كشف رواتب ${run.period}</div><div class="ph-sub">${isDraft ? 'مسودة — قابل للتعديل الكامل' : 'مُرحَّل — للقراءة فقط'}</div></div>
      <div class="ph-actions">
        <button class="btn btn-o btn-sm" onclick="PAGE_RENDER.payroll(document.getElementById('page-root'),'list')">↩ رجوع للقائمة</button>
        <button class="btn btn-o btn-sm" onclick="exportPayrollExcel('${runId}')">⬇ تصدير إكسل</button>
        <button class="btn btn-o btn-sm" onclick="printPayrollSheet('${runId}','${run.period}')">🖨 طباعة الكشف</button>
        ${isDraft ? `<button class="btn btn-p btn-sm" onclick="postPayrollConfirm('${runId}')">🔒 ترحيل الكشف وإنشاء القيد</button>` : ''}
        ${isDraft && can('admin') ? `<button class="btn btn-d btn-sm" onclick="deletePayrollRunConfirm('${runId}')">🗑 حذف الكشف</button>` : ''}
      </div></div>
    <div class="card">
      ${isDraft ? `<datalist id="pr-emp-list">${employees.map(e => `<option value="${e.full_name.replace(/"/g,'&quot;')}">`).join('')}</datalist>` : ''}
      <div class="itw"><table>${payrollHeaderHTML()}
        <tbody id="pr-items">
          ${isDraft ? items.map(payrollRowHTML).join('') : items.map((it,i) => `<tr>
            <td class="mono">${i+1}</td><td>${it.employee_name}</td><td class="mono">${fmt(it.base_salary)}</td>
            <td class="mono">${fmt(it.raise_5pct)}</td><td class="mono">${fmt(it.other_additions)}</td><td class="mono gold-txt">${fmt(it.gross_salary)}</td>
            <td class="mono">${fmt(it.social_security)}</td><td class="mono">${fmtQty(it.absence_days)}</td><td class="mono">${fmt(it.absence_amount)}</td>
            <td class="mono">${fmt(it.loan_deduction)}</td><td class="mono">${fmtQty(it.dependents_count)}</td><td class="mono">${fmt(it.subscription_amount)}</td>
            <td class="mono">${fmt(it.health_insurance)}</td><td class="mono">${fmt(it.martyrs_fund)}</td><td class="mono">${fmt(it.other_deductions)}</td>
            <td class="mono">${fmt(it.total_deductions)}</td><td class="mono gold-txt">${fmt(it.net_pay)}</td><td>${it.notes||''}</td><td></td>
          </tr>`).join('')}
        </tbody></table></div>
      ${isDraft ? `<div class="form-foot" style="justify-content:flex-start">
        <button class="btn btn-o btn-sm" onclick="addPayrollRow()">+ إضافة صف</button>
      </div>` : ''}
      <div class="grand-bar"><span class="grand-lbl">إجمالي صافي الرواتب</span><span class="grand-val" id="pr-grand">${fmtIQD(totalNet)}</span></div>
      ${isDraft ? `<div class="form-foot"><button class="btn btn-p" onclick="savePayrollEdits('${runId}')">💾 حفظ التعديلات</button></div>` : ''}
    </div>`;
  if (isDraft) recalcAllPayrollRows();
}
window.savePayrollEdits = async (runId) => {
  const items = collectPayrollItems();
  if (!items.length) { toast('لازم يبقى موظف واحد على الأقل بالكشف', 'e'); return; }
  try {
    await DB.replacePayrollItems(runId, items);
    toast('✅ تم حفظ التعديلات', 's');
    PAGE_RENDER.payroll(document.getElementById('page-root'), 'view', runId);
  } catch (e) { toast('خطأ: ' + e.message, 'e'); }
};
window.exportPayrollExcel = async (runId) => {
  const items = await DB.payrollItems(runId);
  exportRowsToExcel(
    items.map((it,i) => ({ 'ت': i+1, 'الاسم الثلاثي': it.employee_name, 'مقدار الراتب': it.base_salary,
      'زيادة راتب 5%': it.raise_5pct, 'اخرى (اضافات)': it.other_additions, 'الراتب مع الاضافات': it.gross_salary,
      'استقطاع الضمان': it.social_security, 'الغياب (أيام)': it.absence_days, 'مبلغ الغياب': it.absence_amount,
      'سلف': it.loan_deduction, 'عدد الافراد': it.dependents_count, 'مبلغ الاشتراك': it.subscription_amount,
      'الضمان الصحي': it.health_insurance, 'تبرعات صندوق شهداء الشرطة': it.martyrs_fund, 'اخرى (استقطاعات)': it.other_deductions,
      'مجموع الاستقطاعات': it.total_deductions, 'مجموع الاستحقاق': it.net_pay, 'الملاحظات': it.notes || '' })),
    'كشف الرواتب', `كشف_الرواتب_${todayISO()}.xlsx`
  );
};
window.printPayrollSheet = async (runId, period) => {
  const items = await DB.payrollItems(runId);
  const totalNet = items.reduce((s, it) => s + Number(it.net_pay ?? 0), 0);
  const rows = items.map((it,i) => `<tr>
    <td>${i+1}</td><td>${it.employee_name}</td><td class="mono">${fmt(it.base_salary)}</td><td class="mono">${fmt(it.raise_5pct)}</td>
    <td class="mono">${fmt(it.other_additions)}</td><td class="mono">${fmt(it.gross_salary)}</td><td class="mono">${fmt(it.social_security)}</td>
    <td class="mono">${fmt(it.absence_amount)}</td><td class="mono">${fmt(it.loan_deduction)}</td><td class="mono">${fmt(it.subscription_amount)}</td>
    <td class="mono">${fmt(it.health_insurance)}</td><td class="mono">${fmt(it.martyrs_fund)}</td><td class="mono">${fmt(it.other_deductions)}</td>
    <td class="mono">${fmt(it.total_deductions)}</td><td class="mono">${fmt(it.net_pay)}</td></tr>`).join('');
  const html = `
    <table style="width:100%;border-collapse:collapse;font-size:10.5px"><thead><tr style="border-bottom:1px solid #999">
      <th>ت</th><th>الاسم</th><th>الراتب</th><th>زيادة 5%</th><th>اضافات</th><th>مع الاضافات</th><th>ضمان</th>
      <th>غياب</th><th>سلف</th><th>اشتراك</th><th>ضمان صحي</th><th>شهداء الشرطة</th><th>أخرى</th><th>مج. الاستقطاعات</th><th>الصافي</th>
    </tr></thead><tbody>${rows}</tbody></table>
    <div style="text-align:left;margin-top:14px;font-weight:800;font-size:13px">إجمالي صافي الرواتب: ${fmtIQD(totalNet)}</div>
    <div style="display:flex;justify-content:space-between;margin-top:50px;font-size:12px">
      <div>محاسب المركز: ____________________</div><div>مدير الحسابات: ____________________</div><div>مدير النظام: ____________________</div>
    </div>`;
  await renderPrintArea(`كشف رواتب شهر ${period}`, html);
  window.print();
};
window.postPayrollConfirm = async (runId) => {
  if (!confirm('سيتم ترحيل كشف الرواتب وإنشاء قيد محاسبي بإجمالي الصافي. هذا الإجراء لا يمكن التراجع عنه، ولا يمكن تعديل الكشف بعده. متابعة؟')) return;
  try {
    await DB.postPayrollRun(runId);
    toast('✅ تم ترحيل كشف الرواتب', 's');
    PAGE_RENDER.payroll(document.getElementById('page-root'), 'view', runId);
  } catch (e) { toast('تعذر الترحيل: ' + e.message, 'e'); }
};
window.deletePayrollRunConfirm = async (runId) => {
  if (!confirm('متأكد تريد حذف كشف الرواتب هذا (مسودة)؟')) return;
  try {
    await DB.deletePayrollRun(runId);
    toast('تم حذف كشف الرواتب', 's');
    PAGE_RENDER.payroll(document.getElementById('page-root'), 'list');
  } catch (e) { toast('تعذّر الحذف: ' + e.message, 'e'); }
};
