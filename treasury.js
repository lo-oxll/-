// ══════════════════════════════════════════════════════════════════
//  الخزينة والرواتب: دليل الموظفين + كشوفات الرواتب الشهرية + صندوق المركز
//  هيكلة كشف الراتب مطابقة تماماً لملف الرواتب اليدوي المعتمد:
//  مقدار الراتب → زيادة 5% + إضافات أخرى → الراتب مع الإضافات
//  استقطاع الضمان (3.5% افتراضي) / الغياب (أيام + مبلغ = الراتب الأساسي÷30×الأيام)
//  سلف / عدد الأفراد / مبلغ الاشتراك (لا يُحسم من الصافي) / الضمان الصحي
//  (عدد الأفراد × سعر الفرد) / تبرعات صندوق شهداء الشرطة / استقطاعات أخرى
//  ══════════════════════════════════════════════════════════════════
const PAYROLL_DEFAULTS = { ssRate: 0.035, subscription: 3500, healthPerMember: 3500, martyrs: 4000 };

// ════════════════════════════════════════════════════════════════
//  إدارة الموظفين
// ════════════════════════════════════════════════════════════════
PAGE_RENDER.employees = async (root) => {
  if (!can('admin','central_accountant')) { root.innerHTML = '<div class="card ec">لا تملك صلاحية الوصول لهذه الصفحة</div>'; return; }
  const showInactive = root.dataset.showInactive === '1';
  const emps = await DB.listEmployees(!showInactive);
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">🪪 إدارة الموظفين</div><div class="ph-sub">البيانات الأساسية للموظف (الراتب، عدد الأفراد، نسب الاستقطاعات الثابتة) — تُستخدم كقيم افتراضية عند إنشاء أي كشف راتب جديد، وتبقى قابلة للتعديل بكل كشف على حدة</div></div>
      <div class="ph-actions">
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink2)"><input type="checkbox" id="emp-show-inactive" style="width:auto" ${showInactive?'checked':''}> عرض الموقوفين أيضاً</label>
        <button class="btn btn-o btn-sm" onclick="downloadEmployeeTemplate()">⬇ قالب استيراد فارغ</button>
        <button class="btn btn-o btn-sm" onclick="document.getElementById('emp-import-file').click()">⬆ استيراد إكسل</button>
        <input type="file" id="emp-import-file" accept=".xlsx,.xls" class="hidden" onchange="importEmployeesExcel(this)">
        <button class="btn btn-o btn-sm" onclick="exportEmployeesExcel()">⬇ تصدير إكسل</button>
        <button class="btn btn-p btn-sm" onclick="openEmpModal()">+ موظف جديد</button>
      </div>
    </div>

    <div class="stats">
      <div class="stat"><div class="stat-lbl">عدد الموظفين النشطين</div><div class="stat-val">${emps.filter(e=>e.is_active).length}</div></div>
      <div class="stat"><div class="stat-lbl">إجمالي الرواتب الأساسية</div><div class="stat-val gold">${fmtIQD(emps.reduce((s,e)=>s+(Number(e.base_salary)||0),0))}</div></div>
    </div>

    <div class="card"><div class="itw"><table><thead><tr>
      <th>الاسم</th><th>المسمى الوظيفي</th><th>الراتب الأساسي</th><th>عدد الأفراد</th><th>الاشتراك</th><th>الضمان الصحي/فرد</th><th>تبرعات الشهداء</th><th>الحالة</th><th></th>
    </tr></thead><tbody>
      ${emps.map(e => `<tr>
        <td>${e.full_name}</td><td>${e.job_title || '—'}</td><td class="mono">${fmt(e.base_salary)}</td>
        <td class="mono">${e.family_members||0}</td><td class="mono">${fmt(e.subscription_rate)}</td><td class="mono">${fmt(e.health_ins_rate)}</td><td class="mono">${fmt(e.martyrs_donation)}</td>
        <td>${e.is_active ? '<span class="chip-ok chip">فعّال</span>' : '<span class="chip-danger chip">موقوف</span>'}</td>
        <td>
          <button class="btn btn-o btn-sm" onclick='openEmpModal(${JSON.stringify(e).replace(/'/g,"&#39;")})'>تعديل</button>
          <button class="btn btn-o btn-sm" onclick="toggleEmpActiveConfirm('${e.id}', ${!e.is_active})">${e.is_active?'إيقاف':'تفعيل'}</button>
          <button class="btn btn-d btn-sm" onclick="deleteEmployeeConfirm('${e.id}','${(e.full_name||'').replace(/'/g,"\\'")}')">حذف</button>
        </td>
      </tr>`).join('') || '<tr><td colspan="9" class="ec">لا يوجد موظفون مسجّلون بعد</td></tr>'}
    </tbody></table></div></div>
  `;
  document.getElementById('emp-show-inactive').onchange = (e) => { root.dataset.showInactive = e.target.checked ? '1' : '0'; PAGE_RENDER.employees(root); };
};

window.openEmpModal = (e = null) => {
  showModal(e ? 'تعديل بيانات موظف' : 'موظف جديد', `
    <div class="fg2" style="margin-bottom:10px">
      <div class="fgroup s2"><label>الاسم الثلاثي الكامل *</label><input id="m-emp-name" value="${e?.full_name || ''}"></div>
      <div class="fgroup"><label>المسمى الوظيفي</label><input id="m-emp-job" value="${e?.job_title || ''}"></div>
      <div class="fgroup"><label>الراتب الأساسي (د.ع) *</label><input type="number" id="m-emp-base" value="${e?.base_salary ?? ''}"></div>
      <div class="fgroup"><label>عدد الأفراد (للضمان الصحي)</label><input type="number" id="m-emp-fam" value="${e?.family_members ?? 0}"></div>
      <div class="fgroup"><label>مبلغ الاشتراك (د.ع)</label><input type="number" id="m-emp-sub" value="${e?.subscription_rate ?? PAYROLL_DEFAULTS.subscription}"></div>
      <div class="fgroup"><label>سعر الضمان الصحي للفرد الواحد (د.ع)</label><input type="number" id="m-emp-health" value="${e?.health_ins_rate ?? PAYROLL_DEFAULTS.healthPerMember}"></div>
      <div class="fgroup"><label>تبرعات صندوق شهداء الشرطة (د.ع)</label><input type="number" id="m-emp-martyrs" value="${e?.martyrs_donation ?? PAYROLL_DEFAULTS.martyrs}"></div>
    </div>
    <div class="fgroup"><label>ملاحظات (تفاصيل سلف قائمة، الخ — تُنسخ تلقائياً بكل كشف راتب جديد)</label><textarea id="m-emp-notes">${e?.notes || ''}</textarea></div>
  `, async () => {
    const name = gv('m-emp-name'), base = Number(gv('m-emp-base'));
    if (!name) { toast('أدخل اسم الموظف', 'e'); return false; }
    if (!base || base <= 0) { toast('أدخل الراتب الأساسي', 'e'); return false; }
    const payload = {
      full_name: name, job_title: gv('m-emp-job') || null, base_salary: base,
      family_members: Number(gv('m-emp-fam')) || 0, subscription_rate: Number(gv('m-emp-sub')) || 0,
      health_ins_rate: Number(gv('m-emp-health')) || 0, martyrs_donation: Number(gv('m-emp-martyrs')) || 0,
      notes: gv('m-emp-notes') || null,
    };
    try {
      if (e) await DB.updateEmployee(e.id, payload);
      else await DB.createEmployee({ ...payload, is_active: true });
      toast('تم الحفظ', 's'); go('employees'); return true;
    } catch (err) { toast('خطأ: ' + err.message, 'e'); return false; }
  });
};
window.toggleEmpActiveConfirm = async (id, val) => {
  try { await DB.toggleEmployeeActive(id, val); toast(val ? 'تم تفعيل الموظف' : 'تم إيقاف الموظف', 's'); go('employees'); }
  catch (e) { toast('خطأ: ' + e.message, 'e'); }
};
window.deleteEmployeeConfirm = async (id, name) => {
  if (!confirm(`⚠️ حذف نهائي للموظف "${name}" من دليل الموظفين. سيُرفض الحذف تلقائياً لو له سطور بكشوفات رواتب سابقة (استخدم "إيقاف" بدل الحذف لو غادر الموظف الخدمة مع الاحتفاظ بتاريخه). متابعة؟`)) return;
  try { await DB.deleteEmployee(id, name); toast('تم حذف الموظف', 's'); go('employees'); }
  catch (e) { toast('تعذر الحذف: ' + e.message, 'e'); }
};
window.exportEmployeesExcel = async () => {
  const emps = await DB.listEmployees(false);
  exportRowsToExcel(emps.map((e,i) => ({
    'م': i+1, 'الاسم الثلاثي': e.full_name, 'المسمى الوظيفي': e.job_title || '', 'الراتب الأساسي': e.base_salary,
    'عدد الأفراد': e.family_members, 'مبلغ الاشتراك': e.subscription_rate, 'سعر الضمان الصحي/فرد': e.health_ins_rate,
    'تبرعات الشهداء': e.martyrs_donation, 'الحالة': e.is_active ? 'فعّال' : 'موقوف', 'ملاحظات': e.notes || '',
  })), 'الموظفون', `دليل_الموظفين_${todayISO()}.xlsx`);
};
window.downloadEmployeeTemplate = () => {
  const ws = XLSX.utils.json_to_sheet([{ 'الاسم الثلاثي': '', 'المسمى الوظيفي': '', 'الراتب الأساسي': '', 'عدد الأفراد': 0 }]);
  ws['!cols'] = [{wch:26},{wch:20},{wch:14},{wch:12}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'قالب الموظفين');
  XLSX.writeFile(wb, 'قالب_استيراد_الموظفين.xlsx');
};
window.importEmployeesExcel = async (input) => {
  const file = input.files?.[0];
  if (!file) return;
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    const existing = await DB.listEmployees(false);
    const byName = new Map(existing.map(e => [e.full_name.trim(), e]));
    let ok = 0, fail = 0;
    for (const r of rows) {
      const name = String(r['الاسم الثلاثي'] ?? r['الاسم'] ?? r['full_name'] ?? '').trim();
      const base = Number(r['الراتب الأساسي'] ?? r['مقدار الراتب'] ?? r['base_salary'] ?? 0) || 0;
      if (!name || !base) continue;
      const payload = {
        full_name: name, job_title: String(r['المسمى الوظيفي'] ?? '').trim() || null, base_salary: base,
        family_members: Number(r['عدد الأفراد'] ?? 0) || 0,
      };
      try {
        const found = byName.get(name);
        if (found) await DB.updateEmployee(found.id, payload);
        else await DB.createEmployee({ ...payload, subscription_rate: PAYROLL_DEFAULTS.subscription, health_ins_rate: PAYROLL_DEFAULTS.healthPerMember, martyrs_donation: PAYROLL_DEFAULTS.martyrs, is_active: true });
        ok++;
      } catch (e) { fail++; }
    }
    toast(`تم استيراد ${ok} موظف${fail ? `، وفشل ${fail}` : ''}`, 's');
    input.value = '';
    go('employees');
  } catch (e) { toast('تعذر الاستيراد: ' + e.message, 'e'); }
};

// ════════════════════════════════════════════════════════════════
//  الرواتب — كشوفات شهرية
// ════════════════════════════════════════════════════════════════
PAGE_RENDER.payroll = async (root, mode = 'list', runId = null) => {
  if (!can('admin','central_accountant')) { root.innerHTML = '<div class="card ec">لا تملك صلاحية الوصول لهذه الصفحة</div>'; return; }
  if (mode === 'new' || mode === 'edit') return renderPayrollForm(root, mode, runId);
  if (mode === 'view') return renderPayrollView(root, runId);

  const runs = await DB.listPayrollRuns();
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">🧑‍💼 الرواتب</div><div class="ph-sub">كشوفات الرواتب الشهرية — الأسماء والمبالغ تتغيّر كل شهر بحرّية كاملة قبل الترحيل</div></div>
      <div class="ph-actions"><button class="btn btn-p" onclick="PAGE_RENDER.payroll(document.getElementById('page-root'),'new')">+ كشف راتب جديد</button></div></div>
    <div class="card"><div class="itw"><table><thead><tr><th>الفترة</th><th>العنوان</th><th>الحالة</th><th>إجمالي الرواتب</th><th>الاستقطاعات</th><th>صافي المستحق</th><th></th></tr></thead><tbody>
      ${runs.map(r => `<tr>
        <td class="mono" style="font-weight:800">${r.period}</td><td>${r.title || '—'}</td>
        <td>${r.status === 'posted' ? '<span class="chip-ok chip">مُرحَّل</span>' : '<span class="chip chip-gold">مسودة</span>'}</td>
        <td class="mono">${fmt(r.total_gross)}</td><td class="mono">${fmt(r.total_deductions)}</td><td class="gold-txt">${fmt(r.total_net)}</td>
        <td>
          <button class="btn btn-o btn-sm" onclick="PAGE_RENDER.payroll(document.getElementById('page-root'),'view','${r.id}')">عرض</button>
          ${r.status !== 'posted' ? `<button class="btn btn-o btn-sm" onclick="PAGE_RENDER.payroll(document.getElementById('page-root'),'edit','${r.id}')">تعديل</button>` : ''}
          ${can('admin') || (can('central_accountant') && r.status !== 'posted') ? `<button class="btn btn-d btn-sm" onclick="deletePayrollRunConfirm('${r.id}','${(r.period||'').replace(/'/g,"\\'")}',${r.status==='posted'},'${r.journal_entry_id||''}')">🗑 حذف</button>` : ''}
        </td>
      </tr>`).join('') || '<tr><td colspan="7" class="ec">لا توجد كشوفات رواتب بعد</td></tr>'}
    </tbody></table></div></div>
  `;
};

function payrollRowHTML(emp = null, override = null) {
  const base = emp?.base_salary ?? '';
  const fam = emp?.family_members ?? 0;
  const sub = emp?.subscription_rate ?? PAYROLL_DEFAULTS.subscription;
  const healthRate = emp?.health_ins_rate ?? PAYROLL_DEFAULTS.healthPerMember;
  const martyrs = emp ? (emp.martyrs_donation ?? PAYROLL_DEFAULTS.martyrs) : 0;
  const ss = emp ? Math.round((Number(base)||0) * PAYROLL_DEFAULTS.ssRate * 1000) / 1000 : 0;
  const health = emp ? (Number(fam)||0) * healthRate : 0;
  const notes = emp?.notes || '';
  const name = override ? override : (emp?.full_name || '');
  return `<tr data-emp-id="${emp?.id || ''}" data-emp-name="${override ? name.replace(/"/g,'&quot;') : ''}">
    <td style="width:34px" class="mono row-idx"></td>
    <td style="min-width:170px" class="pr-name">${name}</td>
    <td style="width:110px"><input type="number" class="pr-base mono" value="${base}"></td>
    <td style="width:95px"><input type="number" class="pr-raise mono" value="0" title="زيادة راتب 5%"></td>
    <td style="width:95px"><input type="number" class="pr-other-add mono" value="0" title="إضافات أخرى"></td>
    <td style="width:110px" class="pr-gross mono gold-txt">0</td>
    <td style="width:105px"><input type="number" class="pr-ss mono" value="${ss}" title="استقطاع الضمان"></td>
    <td style="width:65px"><input type="number" class="pr-absdays mono" value="0" title="أيام الغياب"></td>
    <td style="width:100px"><input type="number" class="pr-absamt mono" value="0" title="مبلغ الغياب"></td>
    <td style="width:100px"><input type="number" class="pr-loan mono" value="0" title="سلف"></td>
    <td style="width:65px"><input type="number" class="pr-fam mono" value="${fam}" title="عدد الأفراد"></td>
    <td style="width:100px"><input type="number" class="pr-sub mono" value="${sub}" title="مبلغ الاشتراك (لا يُحسم)"></td>
    <td style="width:100px"><input type="number" class="pr-health mono" value="${health}" title="الضمان الصحي"></td>
    <td style="width:100px"><input type="number" class="pr-martyrs mono" value="${martyrs}" title="تبرعات شهداء الشرطة"></td>
    <td style="width:100px"><input type="number" class="pr-other-ded mono" value="0" title="استقطاعات أخرى"></td>
    <td style="width:110px" class="pr-total-ded mono" style="color:var(--danger)">0</td>
    <td style="width:120px" class="pr-net mono gold-txt">0</td>
    <td style="min-width:160px"><input class="pr-notes" value="${notes.replace(/"/g,'&quot;')}"></td>
    <td style="width:40px"><button class="btn btn-d btn-sm" onclick="this.closest('tr').remove(); recalcPayroll();">✕</button></td>
  </tr>`;
}

function recalcPayrollRow(tr) {
  const num = sel => Number(tr.querySelector(sel)?.value) || 0;
  const base = num('.pr-base'), raise = num('.pr-raise'), otherAdd = num('.pr-other-add');
  const gross = base + raise + otherAdd;
  const ss = num('.pr-ss'), absAmt = num('.pr-absamt'), loan = num('.pr-loan'), health = num('.pr-health'), martyrs = num('.pr-martyrs'), otherDed = num('.pr-other-ded');
  const totalDed = ss + absAmt + loan + health + martyrs + otherDed; // ملاحظة: "مبلغ الاشتراك" لا يُحسم من الصافي (نفس منطق الكشف اليدوي الأصلي)
  const net = gross - totalDed;
  tr.querySelector('.pr-gross').textContent = fmt(gross);
  tr.querySelector('.pr-total-ded').textContent = fmt(totalDed);
  tr.querySelector('.pr-net').textContent = fmt(net);
  return { gross, totalDed, net };
}
window.recalcPayroll = () => {
  const tbody = document.getElementById('pr-items');
  if (!tbody) return;
  let sg = 0, sd = 0, sn = 0;
  tbody.querySelectorAll('tr').forEach((tr, i) => {
    tr.querySelector('.row-idx').textContent = i + 1;
    const { gross, totalDed, net } = recalcPayrollRow(tr);
    sg += gross; sd += totalDed; sn += net;
  });
  const gb = document.getElementById('pr-grand');
  if (gb) gb.innerHTML = `
    <div class="grand-bar"><span class="grand-lbl">إجمالي الرواتب مع الإضافات</span><span class="grand-val" style="color:var(--ink)">${fmt(sg)}</span></div>
    <div class="grand-bar"><span class="grand-lbl">إجمالي الاستقطاعات</span><span class="grand-val" style="color:var(--danger)">${fmt(sd)}</span></div>
    <div class="grand-bar"><span class="grand-lbl">صافي المستحق الكلي</span><span class="grand-val">${fmt(sn)}</span></div>`;
};

// ── دالة مساعدة: تجميع أصناف الجدول لحفظها بقاعدة البيانات ──────────────────────────────
function collectPayrollItems() {
  const items = [];
  document.querySelectorAll('#pr-items tr').forEach(tr => {
    const num = sel => Number(tr.querySelector(sel)?.value) || 0;
    const { gross, totalDed, net } = recalcPayrollRow(tr);
    const empId = tr.dataset.empId || null;
    items.push({
      employee_id: empId || null,
      employee_name_override: empId ? null : (tr.dataset.empName || tr.querySelector('.pr-name').textContent.trim()),
      base_salary: num('.pr-base'), raise_5pct: num('.pr-raise'), other_additions: num('.pr-other-add'), gross_pay: gross,
      social_security: num('.pr-ss'), absence_days: num('.pr-absdays'), absence_amount: num('.pr-absamt'), loan_deduction: num('.pr-loan'),
      family_members: num('.pr-fam'), subscription_amount: num('.pr-sub'), health_insurance: num('.pr-health'), martyrs_donation: num('.pr-martyrs'),
      other_deductions: num('.pr-other-ded'), total_deductions: totalDed, net_pay: net,
      notes: tr.querySelector('.pr-notes').value.trim() || null,
    });
  });
  return items;
}

async function renderPayrollForm(root, mode, runId) {
  let run = null, items = [];
  if (mode === 'edit') {
    run = await DB.getPayrollRun(runId);
    items = await DB.payrollItems(runId);
  }
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">${mode === 'edit' ? '✏️ تعديل كشف راتب' : '🧾 كشف راتب جديد'}</div><div class="ph-sub">مسودة قابلة للتعديل الكامل — الترحيل ينشئ القيد المحاسبي ويقفل الكشف</div></div>
      <div class="ph-actions">
        <button class="btn btn-o" onclick="go('payroll')">إلغاء</button>
        <button class="btn btn-o" onclick="loadAllActiveEmployeesToPayroll()">🔄 تحميل كل الموظفين النشطين</button>
        <button class="btn btn-o" onclick="addManualPayrollRow()">+ إضافة اسم يدوي (منحة)</button>
        <button class="btn btn-p" id="pr-save-btn">💾 حفظ كمسودة</button>
      </div>
    </div>
    <div class="card">
      <div class="fg" style="margin-bottom:14px">
        <div class="fgroup"><label>الفترة (مثال: تموز 2026) *</label><input id="pr-period" value="${run?.period || ''}"></div>
        <div class="fgroup s2"><label>عنوان/ملاحظة عامة (اختياري)</label><input id="pr-title" value="${run?.title || ''}"></div>
      </div>
      <div class="itw"><table><thead><tr>
        <th>#</th><th>الاسم</th><th>مقدار الراتب</th><th>زيادة 5%</th><th>إضافات أخرى</th><th>الراتب مع الإضافات</th>
        <th>استقطاع الضمان</th><th>أيام الغياب</th><th>مبلغ الغياب</th><th>سلف</th><th>عدد الأفراد</th><th>مبلغ الاشتراك</th>
        <th>الضمان الصحي</th><th>تبرعات الشهداء</th><th>استقطاعات أخرى</th><th>مجموع الاستقطاعات</th><th>صافي المستحق</th><th>ملاحظات</th><th></th>
      </tr></thead><tbody id="pr-items"></tbody></table></div>
      <div style="font-size:11px;color:var(--ink3);margin:8px 0">ملاحظة: عمود "مبلغ الاشتراك" يظهر للتوثيق فقط ولا يُحسم من صافي المستحق (مطابقةً لمنطق كشف الرواتب اليدوي المعتمد).</div>
      <div id="pr-grand"></div>
    </div>
  `;
  const tbody = document.getElementById('pr-items');
  if (mode === 'edit' && items.length) {
    for (const it of items) {
      const emp = it.employees ? { id: it.employee_id, full_name: it.employees.full_name } : null;
      tbody.insertAdjacentHTML('beforeend', payrollRowHTML(null, it.employee_name_override || it.employees?.full_name || ''));
      const tr = tbody.lastElementChild;
      tr.dataset.empId = it.employee_id || '';
      tr.dataset.empName = it.employee_name_override || '';
      tr.querySelector('.pr-base').value = it.base_salary; tr.querySelector('.pr-raise').value = it.raise_5pct;
      tr.querySelector('.pr-other-add').value = it.other_additions; tr.querySelector('.pr-ss').value = it.social_security;
      tr.querySelector('.pr-absdays').value = it.absence_days; tr.querySelector('.pr-absamt').value = it.absence_amount;
      tr.querySelector('.pr-loan').value = it.loan_deduction; tr.querySelector('.pr-fam').value = it.family_members;
      tr.querySelector('.pr-sub').value = it.subscription_amount; tr.querySelector('.pr-health').value = it.health_insurance;
      tr.querySelector('.pr-martyrs').value = it.martyrs_donation; tr.querySelector('.pr-other-ded').value = it.other_deductions;
      tr.querySelector('.pr-notes').value = it.notes || '';
    }
  }
  bindPayrollRowEvents();
  recalcPayroll();
  document.getElementById('pr-save-btn').onclick = () => savePayrollDraft(mode, runId);
}

function bindPayrollRowEvents() {
  document.getElementById('pr-items').addEventListener('input', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type === 'number') recalcPayroll();
  });
  // إعادة احتساب أيام الغياب تلقائياً كـ (الراتب الأساسي ÷ 30 × عدد الأيام)
  document.getElementById('pr-items').addEventListener('change', (e) => {
    if (e.target.classList.contains('pr-absdays')) {
      const tr = e.target.closest('tr');
      const base = Number(tr.querySelector('.pr-base').value) || 0;
      const days = Number(e.target.value) || 0;
      tr.querySelector('.pr-absamt').value = Math.round((base / 30) * days * 1000) / 1000;
      recalcPayroll();
    }
    if (e.target.classList.contains('pr-fam') && !e.target.dataset.userSetHealth) {
      const tr = e.target.closest('tr');
      const fam = Number(e.target.value) || 0;
      tr.querySelector('.pr-health').value = fam * PAYROLL_DEFAULTS.healthPerMember;
      recalcPayroll();
    }
    if (e.target.classList.contains('pr-base') && !e.target.dataset.userSetSS) {
      const tr = e.target.closest('tr');
      const gross = (Number(tr.querySelector('.pr-base').value)||0) + (Number(tr.querySelector('.pr-raise').value)||0) + (Number(tr.querySelector('.pr-other-add').value)||0);
      tr.querySelector('.pr-ss').value = Math.round(gross * PAYROLL_DEFAULTS.ssRate * 1000) / 1000;
      recalcPayroll();
    }
  });
}

window.loadAllActiveEmployeesToPayroll = async () => {
  const tbody = document.getElementById('pr-items');
  const existingIds = new Set([...tbody.querySelectorAll('tr')].map(tr => tr.dataset.empId).filter(Boolean));
  const emps = await DB.listEmployees(true);
  const toAdd = emps.filter(e => !existingIds.has(e.id));
  if (!toAdd.length) { toast('كل الموظفين النشطين مُضافون بالفعل', 'i'); return; }
  toAdd.forEach(emp => {
    tbody.insertAdjacentHTML('beforeend', payrollRowHTML(emp));
    tbody.lastElementChild.dataset.empId = emp.id;
  });
  recalcPayroll();
  toast(`تمت إضافة ${toAdd.length} موظف`, 's');
};
window.addManualPayrollRow = () => {
  const name = prompt('اسم المستفيد (منحة/إضافة لمرة واحدة غير مسجّل بدليل الموظفين):');
  if (!name || !name.trim()) return;
  const amount = Number(prompt('المبلغ (د.ع):', '0')) || 0;
  const tbody = document.getElementById('pr-items');
  tbody.insertAdjacentHTML('beforeend', payrollRowHTML(null, name.trim()));
  const tr = tbody.lastElementChild;
  tr.dataset.empName = name.trim();
  tr.querySelector('.pr-base').value = amount;
  recalcPayroll();
};

async function savePayrollDraft(mode, runId) {
  const period = gv('pr-period');
  if (!period) { toast('أدخل الفترة (الشهر/السنة)', 'e'); return; }
  const items = collectPayrollItems();
  if (!items.length) { toast('أضف موظفاً واحداً على الأقل', 'e'); return; }
  const run = { period, title: gv('pr-title') || null, status: 'draft' };
  try {
    if (mode === 'edit') {
      await DB.updatePayrollRun(runId, run);
      await DB.replacePayrollItems(runId, items);
      toast('تم حفظ التعديلات', 's');
      PAGE_RENDER.payroll(document.getElementById('page-root'), 'view', runId);
    } else {
      const pr = await DB.createPayrollRun(run, items);
      toast('تم حفظ كشف الراتب كمسودة', 's');
      PAGE_RENDER.payroll(document.getElementById('page-root'), 'view', pr.id);
    }
  } catch (e) { toast('خطأ: ' + e.message, 'e'); }
}

async function renderPayrollView(root, runId) {
  const run = await DB.getPayrollRun(runId);
  const items = await DB.payrollItems(runId);
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">🧾 كشف راتب — ${run.period}</div><div class="ph-sub">${run.title || ''} — ${run.status === 'posted' ? `مُرحَّل بتاريخ ${new Date(run.posted_at).toLocaleDateString('ar-IQ')}` : 'مسودة (لم يُرحَّل بعد)'}</div></div>
      <div class="ph-actions">
        <button class="btn btn-o" onclick="go('payroll')">◀ رجوع للقائمة</button>
        ${run.status !== 'posted' ? `<button class="btn btn-o" onclick="PAGE_RENDER.payroll(document.getElementById('page-root'),'edit','${run.id}')">✏️ تعديل</button>` : ''}
        <button class="btn btn-o" onclick="exportPayrollExcel('${run.id}')">⬇ تصدير إكسل</button>
        <button class="btn btn-o" onclick="printPayroll('${run.id}')">🖨 طباعة</button>
        ${run.status !== 'posted' ? `<button class="btn btn-s" onclick="postPayrollConfirm('${run.id}')">🔒 ترحيل الكشف وإنشاء قيد الرواتب</button>` : ''}
        ${can('admin') || (can('central_accountant') && run.status !== 'posted') ? `<button class="btn btn-d" onclick="deletePayrollRunConfirm('${run.id}','${(run.period||'').replace(/'/g,"\\'")}',${run.status==='posted'},'${run.journal_entry_id||''}')">🗑 حذف</button>` : ''}
      </div>
    </div>
    <div class="stats">
      <div class="stat"><div class="stat-lbl">عدد المستفيدين</div><div class="stat-val">${items.length}</div></div>
      <div class="stat"><div class="stat-lbl">إجمالي الرواتب مع الإضافات</div><div class="stat-val">${fmt(run.total_gross || items.reduce((s,i)=>s+Number(i.gross_pay||0),0))}</div></div>
      <div class="stat danger"><div class="stat-lbl">إجمالي الاستقطاعات</div><div class="stat-val danger">${fmt(run.total_deductions || items.reduce((s,i)=>s+Number(i.total_deductions||0),0))}</div></div>
      <div class="stat"><div class="stat-lbl">صافي المستحق الكلي</div><div class="stat-val gold">${fmt(run.total_net || items.reduce((s,i)=>s+Number(i.net_pay||0),0))}</div></div>
    </div>
    <div class="card" id="pr-view-body"><div class="itw"><table><thead><tr>
      <th>#</th><th>الاسم</th><th>الراتب الأساسي</th><th>الإضافات</th><th>الراتب مع الإضافات</th><th>مجموع الاستقطاعات</th><th>صافي المستحق</th><th>ملاحظات</th>
    </tr></thead><tbody>
      ${items.map((it,i) => `<tr><td class="mono">${i+1}</td><td>${it.employee_name_override || it.employees?.full_name || '—'}</td>
        <td class="mono">${fmt(it.base_salary)}</td><td class="mono">${fmt((Number(it.raise_5pct)||0)+(Number(it.other_additions)||0))}</td>
        <td class="mono">${fmt(it.gross_pay)}</td><td class="mono" style="color:var(--danger)">${fmt(it.total_deductions)}</td>
        <td class="gold-txt">${fmt(it.net_pay)}</td><td style="font-size:11.5px">${it.notes || ''}</td></tr>`).join('') || '<tr><td colspan="8" class="ec">لا توجد بيانات</td></tr>'}
    </tbody></table></div></div>
  `;
}

window.postPayrollConfirm = async (id) => {
  if (!confirm('سيتم ترحيل كشف الراتب وإنشاء قيد محاسبي (مصروف الرواتب مقابل حساب الدفع)، وقفل الكشف عن التعديل. هذا الإجراء لا يمكن التراجع عنه إلا بحذف القيد لاحقاً من صلاحية مدير النظام. متابعة؟')) return;
  try {
    await DB.postPayrollRun(id);
    toast('✅ تم ترحيل كشف الراتب', 's');
    PAGE_RENDER.payroll(document.getElementById('page-root'), 'view', id);
  } catch (e) { toast('تعذر الترحيل: ' + e.message, 'e'); }
};
window.deletePayrollRunConfirm = async (id, period, wasPosted, journalEntryId) => {
  const extra = wasPosted ? '\n\n⚠️ هذا الكشف "مُرحَّل" — سيُحذف معه القيد المحاسبي المرتبط أيضاً.' : '';
  if (!confirm(`⚠️ حذف نهائي لكشف راتب "${period}".${extra}\n\nمتابعة؟`)) return;
  try {
    await DB.deletePayrollRun(id, period, wasPosted ? (journalEntryId || null) : null);
    toast('تم حذف كشف الراتب', 's');
    go('payroll');
  } catch (e) { toast('تعذر الحذف: ' + e.message, 'e'); }
};
window.exportPayrollExcel = async (id) => {
  const run = await DB.getPayrollRun(id);
  const items = await DB.payrollItems(id);
  const rows = items.map((it,i) => ({
    'ت': i+1, 'الاسم الثلاثي': it.employee_name_override || it.employees?.full_name || '—',
    'مقدار الراتب': it.base_salary, 'زيادة 5%': it.raise_5pct, 'إضافات أخرى': it.other_additions, 'الراتب مع الإضافات': it.gross_pay,
    'استقطاع الضمان': it.social_security, 'الغياب': it.absence_days, 'مبلغ الغياب': it.absence_amount, 'سلف': it.loan_deduction,
    'عدد الأفراد': it.family_members, 'مبلغ الاشتراك': it.subscription_amount, 'الضمان الصحي': it.health_insurance,
    'تبرعات صندوق شهداء الشرطة': it.martyrs_donation, 'أخرى': it.other_deductions,
    'مجموع الاستقطاعات': it.total_deductions, 'مجموع الاستحقاق': it.net_pay, 'الملاحظات': it.notes || '',
  }));
  exportRowsToExcel(rows, `رواتب ${run.period}`.slice(0,31), `كشف_راتب_${run.period}.xlsx`);
};
window.printPayroll = async (id) => {
  const run = await DB.getPayrollRun(id);
  const items = await DB.payrollItems(id);
  const rows = items.map((it,i) => `<tr><td>${i+1}</td><td>${it.employee_name_override || it.employees?.full_name || '—'}</td>
    <td class="mono">${fmt(it.base_salary)}</td><td class="mono">${fmt(it.gross_pay)}</td><td class="mono">${fmt(it.total_deductions)}</td><td class="mono">${fmt(it.net_pay)}</td></tr>`).join('');
  const html = `
    <div style="margin-bottom:10px;font-size:12px">الفترة: <b>${run.period}</b>${run.title ? ' — ' + run.title : ''}</div>
    <table style="width:100%;border-collapse:collapse;font-size:11.5px"><thead><tr style="border-bottom:1px solid #999">
      <th>ت</th><th>الاسم</th><th>الراتب الأساسي</th><th>مع الإضافات</th><th>الاستقطاعات</th><th>الصافي</th>
    </tr></thead><tbody>${rows}</tbody></table>
    <div style="text-align:left;margin-top:10px;font-weight:800">إجمالي الصافي المستحق: ${fmtIQD(run.total_net || items.reduce((s,i)=>s+Number(i.net_pay||0),0))}</div>
    <div style="display:flex;justify-content:space-between;margin-top:50px;font-size:12px">
      <div>إعداد محاسب المركز: ____________________</div><div>مصادقة مدير النظام: ____________________</div>
    </div>`;
  await renderPrintArea('كشف راتب شهر ' + run.period, html);
  window.print();
};

// ════════════════════════════════════════════════════════════════
//  صندوق المركز
// ════════════════════════════════════════════════════════════════
PAGE_RENDER.cashbox = async (root) => {
  if (!can('admin','central_accountant')) { root.innerHTML = '<div class="card ec">لا تملك صلاحية الوصول لهذه الصفحة</div>'; return; }
  const [balance, txns, recons, accs] = await Promise.all([
    DB.cashBalance(), DB.listCashTransactions(300), DB.listCashReconciliations(10), DB.chartOfAccounts(),
  ]);
  const totalIn = txns.filter(t=>t.type==='in').reduce((s,t)=>s+Number(t.amount),0);
  const totalOut = txns.filter(t=>t.type==='out').reduce((s,t)=>s+Number(t.amount),0);
  const lastRecon = recons[0];

  // حساب الرصيد التراكمي لكل حركة (من الأحدث للأقدم بما إن العرض تنازلي)
  let running = balance;
  const withRunning = txns.map(t => { const r = running; running -= (t.type==='in'?Number(t.amount):-Number(t.amount)); return { ...t, __running: r }; });

  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">💰 صندوق المركز</div><div class="ph-sub">الحركة النقدية اليومية للصندوق المركزي — كل حركة تُنشئ قيداً محاسبياً تلقائياً مقابل الحساب المختار</div></div>
      <div class="ph-actions">
        <button class="btn btn-o" onclick="openCashReconModal(${balance})">⚖️ مطابقة جرد الصندوق</button>
        <button class="btn btn-o" onclick="exportCashTxnsExcel()">⬇ تصدير إكسل</button>
        <button class="btn btn-s" onclick="openCashTxnModal('in')">⬇ قبض نقدي</button>
        <button class="btn btn-d" onclick="openCashTxnModal('out')">⬆ صرف نقدي</button>
      </div>
    </div>

    <div class="stats">
      <div class="stat"><div class="stat-lbl">الرصيد الحالي</div><div class="stat-val gold">${fmt(balance)}</div></div>
      <div class="stat"><div class="stat-lbl">إجمالي القبض (آخر 300 حركة)</div><div class="stat-val" style="color:var(--ok)">${fmt(totalIn)}</div></div>
      <div class="stat"><div class="stat-lbl">إجمالي الصرف (آخر 300 حركة)</div><div class="stat-val danger">${fmt(totalOut)}</div></div>
      <div class="stat ${lastRecon && Math.abs(lastRecon.counted_amount - lastRecon.system_balance) > 0 ? 'warn' : ''}">
        <div class="stat-lbl">آخر مطابقة جرد</div>
        <div class="stat-val" style="font-size:15px">${lastRecon ? new Date(lastRecon.recon_date).toLocaleDateString('ar-IQ') : '—'}</div>
      </div>
    </div>

    <div class="card"><div class="card-title">📒 حركات الصندوق</div><div class="itw"><table><thead><tr>
      <th>التاريخ</th><th>النوع</th><th>المبلغ</th><th>الطرف الآخر</th><th>البيان</th><th>الرصيد بعد الحركة</th><th></th>
    </tr></thead><tbody>
      ${withRunning.map(t => `<tr>
        <td class="mono">${t.trans_date}</td>
        <td>${t.type === 'in' ? '<span class="chip-ok chip">⬇ قبض</span>' : '<span class="chip-danger chip">⬆ صرف</span>'}</td>
        <td class="mono" style="color:${t.type==='in'?'var(--ok)':'var(--danger)'}">${t.type==='in'?'+':'-'}${fmt(t.amount)}</td>
        <td>${t.chart_of_accounts ? `${t.chart_of_accounts.code} — ${t.chart_of_accounts.name}` : '—'}</td>
        <td style="font-size:12px">${t.description || '—'}</td>
        <td class="mono gold-txt">${fmt(t.__running)}</td>
        <td>${can('admin') ? `<button class="btn btn-d btn-sm" onclick="deleteCashTxnConfirm('${t.id}','${t.journal_entry_id||''}','${(t.description||'').replace(/'/g,"\\'")}')">🗑 حذف</button>` : ''}</td>
      </tr>`).join('') || '<tr><td colspan="7" class="ec">لا توجد حركات مسجّلة بعد</td></tr>'}
    </tbody></table></div></div>

    <div class="card" style="border:1px dashed var(--border)"><div class="card-title">⚖️ آخر عمليات المطابقة (الجرد المفاجئ للصندوق)</div>
      <div class="itw"><table><thead><tr><th>التاريخ</th><th>الرصيد الدفتري</th><th>الرصيد الفعلي (المعدود)</th><th>الفرق</th><th>بواسطة</th></tr></thead><tbody>
        ${recons.map(r => { const diff = Number(r.counted_amount) - Number(r.system_balance); return `<tr>
          <td class="mono">${new Date(r.recon_date).toLocaleString('ar-IQ')}</td><td class="mono">${fmt(r.system_balance)}</td><td class="mono">${fmt(r.counted_amount)}</td>
          <td class="mono" style="color:${diff===0?'var(--ok)':'var(--danger)'}">${diff>0?'+':''}${fmt(diff)}</td><td>${r.profiles?.full_name || '—'}</td>
        </tr>`; }).join('') || '<tr><td colspan="5" class="ec">لا توجد عمليات مطابقة مسجّلة بعد</td></tr>'}
      </tbody></table></div>
    </div>
    <div id="cash-acc-cache" class="hidden">${JSON.stringify(accs)}</div>
  `;
};

window.openCashTxnModal = (type) => {
  const accs = JSON.parse(document.getElementById('cash-acc-cache').textContent);
  const opts = accs.map(a => `<option value="${a.id}">${a.code} — ${a.name}</option>`).join('');
  showModal(type === 'in' ? '⬇ قبض نقدي جديد' : '⬆ صرف نقدي جديد', `
    <div class="fg2" style="margin-bottom:10px">
      <div class="fgroup"><label>التاريخ *</label><input type="date" id="m-cash-date" value="${todayISO()}"></div>
      <div class="fgroup"><label>المبلغ (د.ع) *</label><input type="number" id="m-cash-amount" placeholder="0"></div>
      <div class="fgroup s2"><label>${type === 'in' ? 'مصدر القبض (الحساب المقابل) *' : 'وجه الصرف (الحساب المقابل) *'}</label>
        <select id="m-cash-acc"><option value="">— اختر حساب —</option>${opts}</select></div>
      <div class="fgroup s2"><label>البيان</label><input id="m-cash-desc" placeholder="${type==='in' ? 'مثال: قبض من العميل...' : 'مثال: صرف مصاريف نثرية...'}"></div>
    </div>
  `, async () => {
    const amount = Number(gv('m-cash-amount')), acc = gv('m-cash-acc'), date = gv('m-cash-date');
    if (!amount || amount <= 0) { toast('أدخل مبلغاً صحيحاً', 'e'); return false; }
    if (!acc) { toast('اختر الحساب المقابل', 'e'); return false; }
    try {
      await DB.createCashTransaction({ trans_date: date, type, amount, counterparty_account_id: acc, description: gv('m-cash-desc') });
      toast('تم تسجيل الحركة', 's'); go('cashbox'); return true;
    } catch (e) { toast('خطأ: ' + e.message, 'e'); return false; }
  });
};
window.openCashReconModal = (systemBalance) => {
  showModal('⚖️ مطابقة جرد الصندوق', `
    <div style="font-size:12.5px;color:var(--ink2);margin-bottom:12px">الرصيد الدفتري الحالي: <b class="gold-txt">${fmtIQD(systemBalance)}</b></div>
    <div class="fgroup"><label>الرصيد الفعلي المعدود يدوياً (د.ع) *</label><input type="number" id="m-recon-amount"></div>
    <div class="fgroup" style="margin-top:10px"><label>ملاحظات</label><textarea id="m-recon-notes"></textarea></div>
  `, async () => {
    const counted = Number(gv('m-recon-amount'));
    if (counted < 0 || gv('m-recon-amount') === '') { toast('أدخل الرصيد الفعلي المعدود', 'e'); return false; }
    try {
      await DB.createCashReconciliation({ recon_date: new Date().toISOString(), system_balance: systemBalance, counted_amount: counted, notes: gv('m-recon-notes') || null });
      const diff = counted - systemBalance;
      toast(diff === 0 ? '✅ مطابقة تامة — لا فروقات' : `⚠️ تم تسجيل المطابقة — فرق ${fmt(diff)} د.ع`, diff === 0 ? 's' : 'e');
      go('cashbox'); return true;
    } catch (e) { toast('خطأ: ' + e.message, 'e'); return false; }
  });
};
window.deleteCashTxnConfirm = async (id, journalEntryId, desc) => {
  if (!confirm(`⚠️ حذف نهائي لحركة الصندوق "${desc}" وقيدها المحاسبي المرتبط. مدير النظام فقط. متابعة؟`)) return;
  try {
    await DB.deleteCashTransaction(id, journalEntryId || null, desc);
    toast('تم حذف الحركة', 's');
    go('cashbox');
  } catch (e) { toast('تعذر الحذف: ' + e.message, 'e'); }
};
window.exportCashTxnsExcel = async () => {
  const txns = await DB.listCashTransactions(2000);
  exportRowsToExcel(txns.map((t,i) => ({
    'م': i+1, 'التاريخ': t.trans_date, 'النوع': t.type === 'in' ? 'قبض' : 'صرف', 'المبلغ': t.amount,
    'الحساب المقابل': t.chart_of_accounts ? `${t.chart_of_accounts.code} — ${t.chart_of_accounts.name}` : '', 'البيان': t.description || '',
  })), 'صندوق المركز', `حركات_الصندوق_${todayISO()}.xlsx`);
};
