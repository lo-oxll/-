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
        ${canEdit ? `
        <button class="btn btn-o btn-sm" onclick="downloadCoaTemplate()">⬇ قالب استيراد</button>
        <button class="btn btn-o btn-sm" onclick="document.getElementById('coa-import-file').click()">⬆ استيراد إكسل</button>
        <input type="file" id="coa-import-file" accept=".xlsx,.xls" class="hidden" onchange="importCoaExcelFile(this.files[0])">
        <button class="btn btn-p" onclick="openAccModal()">+ إضافة حساب جديد</button>` : ''}
      </div></div>
    <div class="card"><div class="itw"><table><thead><tr><th>الرمز</th><th>اسم الحساب</th><th>النوع</th><th>ضمن تكلفة المبيعات</th>${canEdit ? '<th></th>' : ''}</tr></thead><tbody>
      ${accs.map(a => `<tr><td class="mono">${a.code}</td><td>${a.name}</td><td><span class="chip">${ACC_TYPE_LABEL[a.type]}</span></td>
        <td>${a.is_cogs ? '<span class="chip chip-gold">نعم</span>' : '—'}</td>
        ${canEdit ? `<td>
          <button class="btn btn-o btn-sm" onclick='openAccModal(${JSON.stringify(a).replace(/'/g,"&#39;")})'>تعديل</button>
          <button class="btn btn-d btn-sm" onclick="deleteAccountConfirm('${a.id}','${a.code}','${(a.name||'').replace(/'/g,"\\'")}')">حذف</button>
        </td>` : ''}
      </tr>`).join('') || `<tr><td colspan="${canEdit?5:4}" class="ec">لا توجد حسابات</td></tr>`}
    </tbody></table></div></div>
    <div id="coa-import-preview"></div>`;
};
window.exportCoaExcel = async () => {
  const accs = await DB.chartOfAccounts();
  exportRowsToExcel(
    accs.map((a, i) => ({ 'م': i + 1, 'الرمز': a.code, 'اسم الحساب': a.name, 'النوع': ACC_TYPE_LABEL[a.type], 'ضمن تكلفة المبيعات': a.is_cogs ? 'نعم' : 'لا' })),
    'دليل الحسابات', `دليل_الحسابات_${todayISO()}.xlsx`
  );
};

// ── تخمين نوع الحساب تلقائياً من أول رقم بالرمز (نمط شائع بدليل الحسابات الحكومي/العراقي) ──
// 1 = أصول | 2 = خصوم | 3 = حقوق ملكية | 4 = إيرادات | 5 = مصروفات
function inferAccountType(code) {
  const first = String(code).trim()[0];
  return { '1': 'asset', '2': 'liability', '3': 'equity', '4': 'revenue', '5': 'expense' }[first] || 'asset';
}

window.downloadCoaTemplate = () => {
  const ws = XLSX.utils.json_to_sheet([{ 'رمز الحساب': '', 'اسم الحساب': '' }]);
  ws['!cols'] = [{wch:16},{wch:30}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'قالب دليل الحسابات');
  XLSX.writeFile(wb, 'قالب_دليل_الحسابات.xlsx');
};

// ── استيراد دليل الحسابات: عمودين فقط (رمز الحساب / اسم الحساب) — النوع يُخمَّن تلقائياً
//    ويُعرَض للمراجعة والتعديل قبل التأكيد النهائي ──────────────────────────────
window.importCoaExcelFile = async (file) => {
  if (!file) return;
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (!raw.length) { toast('الملف فارغ', 'e'); return; }

    const rows = raw.map(r => {
      // تطبيع أسماء الأعمدة: إزالة الفراغات الزائدة، وقبول عدة تسميات شائعة لنفس العمود
      const norm = {};
      Object.keys(r).forEach(k => { norm[k.trim()] = r[k]; });
      const code = String(norm['الرقم الحساب'] ?? norm['رمز الحساب'] ?? norm['الرمز'] ?? norm['رقم الحساب'] ?? norm['code'] ?? '').trim();
      const name = String(norm['الاسم الحساب'] ?? norm['اسم الحساب'] ?? norm['الاسم'] ?? norm['name'] ?? '').trim();
      return { code, name, type: inferAccountType(code) };
    }).filter(r => r.code && r.name);

    if (!rows.length) { toast('لم يتم العثور على صفوف صالحة (تحقق من عمودي رمز واسم الحساب)', 'e'); return; }
    renderCoaImportPreview(rows);
    document.getElementById('coa-import-file').value = '';
  } catch (e) { toast('تعذّر قراءة الملف: ' + e.message, 'e'); }
};

function renderCoaImportPreview(rows) {
  const el = document.getElementById('coa-import-preview');
  el.innerHTML = `
    <div class="card" style="border:1px solid var(--gold)">
      <div class="card-title">📋 مراجعة الاستيراد قبل التأكيد (${rows.length} حساب)</div>
      <div style="font-size:12px;color:var(--ink3);margin-bottom:12px">تم تخمين نوع كل حساب تلقائياً من أول رقم برمزه (1=أصول، 2=خصوم، 3=حقوق ملكية، 4=إيرادات، 5=مصروفات) — راجع وعدّل أي نوع غير صحيح قبل التأكيد. الاستيراد يحدّث الحساب الموجود لو الرمز مطابق، أو يضيفه جديداً.</div>
      <div class="itw"><table><thead><tr><th>الرمز</th><th>اسم الحساب</th><th>النوع</th></tr></thead><tbody id="coa-import-rows">
        ${rows.map((r, i) => `<tr data-code="${r.code}" data-name="${r.name.replace(/"/g,'&quot;')}">
          <td class="mono">${r.code}</td><td>${r.name}</td>
          <td><select class="coa-import-type">
            ${Object.entries(ACC_TYPE_LABEL).map(([k,v]) => `<option value="${k}" ${k===r.type?'selected':''}>${v}</option>`).join('')}
          </select></td>
        </tr>`).join('')}
      </tbody></table></div>
      <div class="form-foot">
        <button class="btn btn-o btn-sm" onclick="document.getElementById('coa-import-preview').innerHTML=''">إلغاء</button>
        <button class="btn btn-p btn-sm" onclick="confirmCoaImport()">✅ تأكيد الاستيراد</button>
      </div>
    </div>`;
}

window.confirmCoaImport = async () => {
  const rows = [];
  document.querySelectorAll('#coa-import-rows tr').forEach(tr => {
    rows.push({ code: tr.dataset.code, name: tr.dataset.name, type: tr.querySelector('.coa-import-type').value });
  });
  if (!rows.length) return;
  try {
    const result = await DB.bulkUpsertAccounts(rows);
    toast(`✅ تم استيراد ${result.ok} حساب${result.fail ? ` — فشل ${result.fail}` : ''}`, result.fail ? 'e' : 's');
    document.getElementById('coa-import-preview').innerHTML = '';
    go('coa');
  } catch (e) { toast('خطأ: ' + e.message, 'e'); }
};

window.deleteAccountConfirm = async (id, code, name) => {
  if (!confirm(`متأكد تريد حذف الحساب "${code} — ${name}"؟ لا يمكن حذف حساب له قيود محاسبية سابقة.`)) return;
  try {
    await DB.deleteAccount(id);
    toast('تم حذف الحساب', 's');
    go('coa');
  } catch (e) { toast('تعذّر الحذف: ' + e.message, 'e'); }
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

const JOURNAL_PAGE_SIZE = 40;
PAGE_RENDER.journal = async (root) => {
  window.__journalState = { offset: 0, items: [], hasMore: false };
  await loadMoreJournal(root, true);
};
async function loadMoreJournal(root, reset = false) {
  const st = window.__journalState;
  const chunk = await DB.journalEntries(JOURNAL_PAGE_SIZE, st.offset);
  st.items = reset ? chunk : st.items.concat(chunk);
  st.offset += chunk.length;
  st.hasMore = chunk.length === JOURNAL_PAGE_SIZE;
  renderJournalPage(root, st);
}
window.loadMoreJournal = loadMoreJournal;

function renderJournalPage(root, st) {
  const entries = st.items;
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">القيود المحاسبية</div><div class="ph-sub">تُنشأ تلقائياً من وثائق الاستلام/الإصدار، أو يدوياً — ${entries.length} قيد محمّل${st.hasMore ? ' (يوجد المزيد)' : ''}</div></div>
      <div class="ph-actions">
        <button class="btn btn-o btn-sm" onclick="exportJournalExcel()">⬇ تصدير إكسل (حتى 1000 قيد)</button>
        ${can('admin','central_accountant') ? '<button class="btn btn-p" onclick="openJournalModal()">+ قيد يدوي</button>' : ''}
      </div></div>
    ${entries.map(e => `<div class="card">
      <div class="card-title">${e.entry_no} — ${e.entry_date} — <span class="chip">${JOURNAL_REF_LABEL[e.ref_type] || 'يدوي'}</span></div>
      <div style="font-size:12.5px;color:var(--ink2);margin-bottom:10px">${e.description || ''}</div>
      <div class="itw"><table><thead><tr><th>الحساب</th><th>مدين (د.ع)</th><th>دائن (د.ع)</th></tr></thead><tbody>
        ${(e.journal_lines||[]).map(l => `<tr><td>${l.chart_of_accounts?.code} — ${l.chart_of_accounts?.name}</td><td class="mono">${l.debit ? fmt(l.debit) : '—'}</td><td class="mono">${l.credit ? fmt(l.credit) : '—'}</td></tr>`).join('')}
      </tbody></table></div></div>`).join('') || '<div class="card ec">لا توجد قيود بعد</div>'}
    ${st.hasMore ? `<div class="form-foot" style="justify-content:center"><button class="btn btn-o" onclick="loadMoreJournal(document.getElementById('page-root'))">تحميل المزيد ⬇</button></div>` : ''}
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
  function lineHTML() { return `<div class="tb-row"><select class="je-acc"><option value="">اختر حساب...</option>${opts}</select><input type="number" step="1" class="je-d" placeholder="مدين" oninput="updateJeBalance()"><input type="number" step="1" class="je-c" placeholder="دائن" oninput="updateJeBalance()"></div>`; }
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
