// ══════════════════════════════════════════════════════════════════
//  المحاسبة: دليل الحسابات + القيود المحاسبية (نظام القيد المزدوج)
// ══════════════════════════════════════════════════════════════════
const ACC_TYPE_LABEL = { asset: 'أصول', liability: 'خصوم', equity: 'حقوق ملكية', revenue: 'إيرادات', expense: 'مصروفات' };
const JOURNAL_REF_LABEL = { receipt: 'استلام', issue: 'إصدار', physical_count: 'تسوية جرد', cash: 'صندوق', payroll: 'رواتب', manual: 'يدوي' };

PAGE_RENDER.coa = async (root) => {
  const accs = await DB.chartOfAccounts();
  const canEdit = can('admin','central_accountant');
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">دليل الحسابات</div><div class="ph-sub">الهيكل المحاسبي المستخدم للترحيل التلقائي والقيود اليدوية</div></div>
      <div class="ph-actions">
        <button class="btn btn-o btn-sm" onclick="exportCoaExcel()">⬇ تصدير إكسل</button>
        ${canEdit ? '<button class="btn btn-p" onclick="openAccModal()">+ إضافة حساب جديد</button>' : ''}
      </div></div>
    <div class="card"><div class="itw"><table><thead><tr><th>الرمز</th><th>اسم الحساب</th><th>النوع</th><th>ضمن تكلفة المبيعات</th>${canEdit ? '<th></th>' : ''}</tr></thead><tbody>
      ${accs.map(a => `<tr><td class="mono">${a.code}</td><td>${a.name}</td><td><span class="chip">${ACC_TYPE_LABEL[a.type]}</span></td>
        <td>${a.is_cogs ? '<span class="chip chip-gold">نعم</span>' : '—'}</td>
        ${canEdit ? `<td><button class="btn btn-o btn-sm" onclick='openAccModal(${JSON.stringify(a).replace(/'/g,"&#39;")})'>تعديل</button></td>` : ''}
      </tr>`).join('') || `<tr><td colspan="${canEdit?5:4}" class="ec">لا توجد حسابات</td></tr>`}
    </tbody></table></div></div>`;
};
window.exportCoaExcel = async () => {
  const accs = await DB.chartOfAccounts();
  exportRowsToExcel(
    accs.map((a, i) => ({ 'م': i + 1, 'الرمز': a.code, 'اسم الحساب': a.name, 'النوع': ACC_TYPE_LABEL[a.type], 'ضمن تكلفة المبيعات': a.is_cogs ? 'نعم' : 'لا' })),
    'دليل الحسابات', `دليل_الحسابات_${todayISO()}.xlsx`
  );
};
window.openAccModal = (a = null) => {
  showModal(a ? 'تعديل حساب' : 'إضافة حساب جديد', `
    <div class="fg2" style="margin-bottom:10px">
      <div class="fgroup"><label>رمز الحساب *</label><input id="m-acc-code" value="${a?.code || ''}"></div>
      <div class="fgroup"><label>النوع *</label><select id="m-acc-type" onchange="document.getElementById('m-acc-cogs-wrap').classList.toggle('hidden', this.value!=='expense')">
        <option value="asset" ${a?.type==='asset'?'selected':''}>أصول</option>
        <option value="liability" ${a?.type==='liability'?'selected':''}>خصوم</option>
        <option value="equity" ${a?.type==='equity'?'selected':''}>حقوق ملكية</option>
        <option value="revenue" ${a?.type==='revenue'?'selected':''}>إيرادات</option>
        <option value="expense" ${a?.type==='expense'?'selected':''}>مصروفات</option></select></div>
    </div>
    <div class="fgroup" style="margin-bottom:10px"><label>اسم الحساب *</label><input id="m-acc-name" value="${a?.name || ''}"></div>
    <div class="fgroup ${a?.type==='expense' ? '' : 'hidden'}" id="m-acc-cogs-wrap" style="flex-direction:row;align-items:center;gap:8px">
      <input type="checkbox" id="m-acc-cogs" style="width:auto" ${a?.is_cogs?'checked':''}>
      <label style="margin:0">ضمن تكلفة المبيعات (يُستخدم بقسم "المتاجرة" بالتقارير المالية)</label>
    </div>
  `, async () => {
    const code = gv('m-acc-code'), name = gv('m-acc-name');
    if (!code || !name) { toast('الرمز والاسم مطلوبان', 'e'); return false; }
    const type = gv('m-acc-type');
    const is_cogs = type === 'expense' && !!document.getElementById('m-acc-cogs')?.checked;
    try {
      if (a) {
        const { error } = await sb.from('chart_of_accounts').update({ code, name, type, is_cogs }).eq('id', a.id);
        if (error) throw error;
        toast('تم تحديث الحساب', 's');
      } else {
        const { error } = await sb.from('chart_of_accounts').insert({ code, name, type, is_cogs });
        if (error) throw error;
        toast('تم إضافة الحساب', 's');
      }
      go('coa'); return true;
    } catch (e) { toast('خطأ: ' + e.message, 'e'); return false; }
  });
};

PAGE_RENDER.journal = async (root) => {
  const entries = await DB.journalEntries(100);
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">القيود المحاسبية</div><div class="ph-sub">تُنشأ تلقائياً من وثائق الاستلام/الإصدار، أو يدوياً</div></div>
      <div class="ph-actions">
        <button class="btn btn-o btn-sm" onclick="exportJournalExcel()">⬇ تصدير إكسل</button>
        ${can('admin','central_accountant') ? '<button class="btn btn-p" onclick="openJournalModal()">+ قيد يدوي</button>' : ''}
      </div></div>
    ${entries.map(e => `<div class="card">
      <div class="card-title">${e.entry_no} — ${e.entry_date} — <span class="chip">${JOURNAL_REF_LABEL[e.ref_type] || 'يدوي'}</span></div>
      <div style="font-size:12.5px;color:var(--ink2);margin-bottom:10px">${e.description || ''}</div>
      <div class="itw"><table><thead><tr><th>الحساب</th><th>مدين</th><th>دائن</th></tr></thead><tbody>
        ${(e.journal_lines||[]).map(l => `<tr><td>${l.chart_of_accounts?.code} — ${l.chart_of_accounts?.name}</td><td class="mono">${l.debit ? fmt(l.debit) : '—'}</td><td class="mono">${l.credit ? fmt(l.credit) : '—'}</td></tr>`).join('')}
      </tbody></table></div></div>`).join('') || '<div class="card ec">لا توجد قيود بعد</div>'}
  `;
};

window.exportJournalExcel = async () => {
  const entries = await DB.journalEntries(1000);
  const rows = [];
  let seq = 1;
  entries.forEach(e => {
    (e.journal_lines || []).forEach(l => {
      rows.push({
        'م': seq++,
        'رقم القيد': e.entry_no,
        'التاريخ': e.entry_date,
        'المصدر': JOURNAL_REF_LABEL[e.ref_type] || 'يدوي',
        'الوصف': e.description || '',
        'رمز الحساب': l.chart_of_accounts?.code || '',
        'اسم الحساب': l.chart_of_accounts?.name || '',
        'مدين': l.debit || 0,
        'دائن': l.credit || 0,
      });
    });
  });
  exportRowsToExcel(rows, 'القيود المحاسبية', `القيود_المحاسبية_${todayISO()}.xlsx`);
};

window.openJournalModal = async () => {
  const accs = await DB.chartOfAccounts();
  const opts = accs.map(a => `<option value="${a.id}">${a.code} — ${a.name}</option>`).join('');
  showModal('قيد يدوي جديد', `
    <div class="fgroup" style="margin-bottom:10px"><label>الوصف *</label><input id="m-je-desc"></div>
    <div class="fgroup" style="margin-bottom:10px"><label>التاريخ</label><input type="date" id="m-je-date" value="${todayISO()}"></div>
    <div id="m-je-lines"></div>
    <button class="btn btn-o btn-sm" style="margin-top:6px" onclick="addJeLine()">+ سطر</button>
    <div id="m-je-balance" style="margin-top:10px;font-size:12px;color:var(--ink3)"></div>
  `, async () => {
    const lines = [];
    document.querySelectorAll('#m-je-lines .tb-row').forEach(row => {
      const acc = row.querySelector('.je-acc').value;
      const d = Number(row.querySelector('.je-d').value) || 0;
      const c = Number(row.querySelector('.je-c').value) || 0;
      if (acc && (d || c)) lines.push({ account_id: acc, debit: d, credit: c });
    });
    const desc = gv('m-je-desc');
    if (!desc || lines.length < 2) { toast('أدخل الوصف وسطرين على الأقل', 'e'); return false; }
    try {
      await DB.postManualEntry({ entry_no: 'JE-MAN-' + Date.now().toString().slice(-8), entry_date: gv('m-je-date'), ref_type: 'manual', description: desc, created_by: ME.id }, lines);
      toast('تم ترحيل القيد', 's'); go('journal'); return true;
    } catch (e) { toast(e.message, 'e'); return false; }
  });
  function lineHTML() { return `<div class="tb-row"><select class="je-acc"><option value="">اختر حساب...</option>${opts}</select><input type="number" step="0.01" class="je-d" placeholder="مدين" oninput="updateJeBalance()"><input type="number" step="0.01" class="je-c" placeholder="دائن" oninput="updateJeBalance()"></div>`; }
  window.addJeLine = () => { document.getElementById('m-je-lines').insertAdjacentHTML('beforeend', lineHTML()); };
  window.updateJeBalance = () => {
    let d = 0, c = 0;
    document.querySelectorAll('#m-je-lines .tb-row').forEach(r => { d += Number(r.querySelector('.je-d').value) || 0; c += Number(r.querySelector('.je-c').value) || 0; });
    const el = document.getElementById('m-je-balance');
    el.textContent = `مدين: ${fmt(d)} — دائن: ${fmt(c)} — ${d === c ? 'متوازن ✓' : 'غير متوازن ✗'}`;
    el.style.color = d === c ? 'var(--ok)' : 'var(--danger)';
  };
  addJeLine(); addJeLine();
};
