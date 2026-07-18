// ══════════════════════════════════════════════════════════════════
//  المحاسبة: دليل الحسابات + القيود المحاسبية (نظام القيد المزدوج)
// ══════════════════════════════════════════════════════════════════
const ACC_TYPE_LABEL = { asset: 'أصول', liability: 'خصوم', equity: 'حقوق ملكية', revenue: 'إيرادات', expense: 'مصروفات' };

PAGE_RENDER.coa = async (root) => {
  const accs = await DB.chartOfAccounts();
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">دليل الحسابات</div><div class="ph-sub">الهيكل المحاسبي المستخدم للترحيل التلقائي والقيود اليدوية</div></div>
      <div class="ph-actions">${can('admin') ? '<button class="btn btn-p" onclick="openAccModal()">+ حساب جديد</button>' : ''}</div></div>
    <div class="card"><div class="itw"><table><thead><tr><th>الرمز</th><th>اسم الحساب</th><th>النوع</th></tr></thead><tbody>
      ${accs.map(a => `<tr><td class="mono">${a.code}</td><td>${a.name}</td><td><span class="chip">${ACC_TYPE_LABEL[a.type]}</span></td></tr>`).join('') || '<tr><td colspan="3" class="ec">لا توجد حسابات</td></tr>'}
    </tbody></table></div></div>`;
};
window.openAccModal = () => {
  showModal('حساب جديد', `
    <div class="fg2" style="margin-bottom:10px">
      <div class="fgroup"><label>رمز الحساب *</label><input id="m-acc-code"></div>
      <div class="fgroup"><label>النوع *</label><select id="m-acc-type">
        <option value="asset">أصول</option><option value="liability">خصوم</option><option value="equity">حقوق ملكية</option>
        <option value="revenue">إيرادات</option><option value="expense">مصروفات</option></select></div>
    </div>
    <div class="fgroup"><label>اسم الحساب *</label><input id="m-acc-name"></div>
  `, async () => {
    const code = gv('m-acc-code'), name = gv('m-acc-name');
    if (!code || !name) { toast('الرمز والاسم مطلوبان', 'e'); return false; }
    const { error } = await sb.from('chart_of_accounts').insert({ code, name, type: gv('m-acc-type') });
    if (error) { toast('خطأ: ' + error.message, 'e'); return false; }
    toast('تم إضافة الحساب', 's'); go('coa'); return true;
  });
};

PAGE_RENDER.journal = async (root) => {
  const entries = await DB.journalEntries(100);
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">القيود المحاسبية</div><div class="ph-sub">تُنشأ تلقائياً من وثائق الاستلام/الإصدار، أو يدوياً</div></div>
      <div class="ph-actions">${can('admin','accountant') ? '<button class="btn btn-p" onclick="openJournalModal()">+ قيد يدوي</button>' : ''}</div></div>
    ${entries.map(e => `<div class="card">
      <div class="card-title">${e.entry_no} — ${e.entry_date} — <span class="chip">${e.ref_type === 'receipt' ? 'استلام' : e.ref_type === 'issue' ? 'إصدار' : 'يدوي'}</span></div>
      <div style="font-size:12.5px;color:var(--ink2);margin-bottom:10px">${e.description || ''}</div>
      <div class="itw"><table><thead><tr><th>الحساب</th><th>مدين</th><th>دائن</th></tr></thead><tbody>
        ${(e.journal_lines||[]).map(l => `<tr><td>${l.chart_of_accounts?.code} — ${l.chart_of_accounts?.name}</td><td class="mono">${l.debit ? fmt(l.debit) : '—'}</td><td class="mono">${l.credit ? fmt(l.credit) : '—'}</td></tr>`).join('')}
      </tbody></table></div></div>`).join('') || '<div class="card ec">لا توجد قيود بعد</div>'}
  `;
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
