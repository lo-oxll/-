// ══════════════════════════════════════════════════════════════════
//  التقارير المالية: ميزان المراجعة، الميزانية العمومية، قائمة الدخل
// ══════════════════════════════════════════════════════════════════
PAGE_RENDER.reports = async (root, tab = 'tb') => {
  const [tb, accs] = await Promise.all([DB.trialBalance(), DB.chartOfAccounts()]);
  const cogsCodes = new Set(accs.filter(a => a.is_cogs).map(a => a.code));
  const tbWithCogs = tb.map(a => ({ ...a, is_cogs: cogsCodes.has(a.code) }));
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">التقارير المالية</div><div class="ph-sub">مُستخلَصة مباشرة من القيود المحاسبية المرحّلة</div></div>
      <div class="ph-actions">
        <button class="btn ${tab==='tb'?'btn-p':'btn-o'} btn-sm" onclick="PAGE_RENDER.reports(document.getElementById('page-root'),'tb')">ميزان المراجعة</button>
        <button class="btn ${tab==='bs'?'btn-p':'btn-o'} btn-sm" onclick="PAGE_RENDER.reports(document.getElementById('page-root'),'bs')">الميزانية العمومية</button>
        <button class="btn ${tab==='tp'?'btn-p':'btn-o'} btn-sm" onclick="PAGE_RENDER.reports(document.getElementById('page-root'),'tp')">المتاجرة والأرباح والخسائر</button>
        <button class="btn ${tab==='pl'?'btn-p':'btn-o'} btn-sm" onclick="PAGE_RENDER.reports(document.getElementById('page-root'),'pl')">قائمة الدخل</button>
        <button class="btn btn-o btn-sm" onclick="exportReportExcel('${tab}')">⬇ تصدير إكسل</button>
        <button class="btn btn-o btn-sm" onclick="printReport('${tab}')">🖨 طباعة / PDF</button>
      </div></div>
    <div class="card" id="report-body">${renderReportBody(tab, tbWithCogs)}</div>
  `;
};

// ── قسم المتاجرة (تكلفة المبيعات) + الأرباح والخسائر ──────────────────────────────
function tradingPlTotals(tb) {
  const revRows = tb.filter(a => a.type === 'revenue').map(a => ({ ...a, net_debit: a.total_credit - a.total_debit }));
  const cogsRows = tb.filter(a => a.type === 'expense' && a.is_cogs).map(a => ({ ...a, net_debit: a.total_debit - a.total_credit }));
  const opexRows = tb.filter(a => a.type === 'expense' && !a.is_cogs).map(a => ({ ...a, net_debit: a.total_debit - a.total_credit }));
  const revTotal = revRows.reduce((s, a) => s + Number(a.net_debit), 0);
  const cogsTotal = cogsRows.reduce((s, a) => s + Number(a.net_debit), 0);
  const opexTotal = opexRows.reduce((s, a) => s + Number(a.net_debit), 0);
  const grossProfit = revTotal - cogsTotal;
  const netProfit = grossProfit - opexTotal;
  return { revRows, cogsRows, opexRows, revTotal, cogsTotal, opexTotal, grossProfit, netProfit };
}

function renderReportBody(tab, tb) {
  if (tab === 'tp') {
    const t = tradingPlTotals(tb);
    return `<div class="card-title">حساب المتاجرة</div>
      <h3 style="font-size:13px;margin-bottom:10px">الإيرادات (المبيعات)</h3>${acctList(t.revRows)}
      <div class="grand-bar"><span class="grand-lbl">إجمالي الإيرادات</span><span class="grand-val">${fmtIQD(t.revTotal)}</span></div>
      <h3 style="font-size:13px;margin:16px 0 10px">تكلفة المبيعات</h3>${acctList(t.cogsRows)}
      <div class="grand-bar"><span class="grand-lbl">إجمالي تكلفة المبيعات</span><span class="grand-val">${fmtIQD(t.cogsTotal)}</span></div>
      <div class="grand-bar" style="margin-top:16px;background:transparent;border:2px solid var(--border)">
        <span class="grand-lbl">مجمل الربح (نتيجة المتاجرة)</span><span class="grand-val" style="color:${t.grossProfit>=0?'var(--ok)':'var(--danger)'}">${fmtIQD(t.grossProfit)}</span></div>

      <div class="card-title" style="margin-top:26px">حساب الأرباح والخسائر</div>
      <div style="display:flex;justify-content:space-between;font-size:12.5px;padding:6px 0"><span>مجمل الربح المرحّل من حساب المتاجرة</span><span class="mono">${fmtIQD(t.grossProfit)}</span></div>
      <h3 style="font-size:13px;margin:16px 0 10px">المصروفات الإدارية والتشغيلية</h3>${acctList(t.opexRows)}
      <div class="grand-bar"><span class="grand-lbl">إجمالي المصروفات</span><span class="grand-val">${fmtIQD(t.opexTotal)}</span></div>
      <div class="grand-bar" style="margin-top:16px;background:transparent;border:2px solid var(--border)">
        <span class="grand-lbl">صافي الربح (الخسارة)</span><span class="grand-val" style="color:${t.netProfit>=0?'var(--ok)':'var(--danger)'}">${fmtIQD(t.netProfit)}</span></div>
      ${!t.cogsRows.length ? `<div style="margin-top:14px;font-size:11.5px;color:var(--ink3)">ملاحظة: لا توجد حسابات مصروفات مصنّفة "ضمن تكلفة المبيعات" بعد — يمكن تصنيفها من صفحة دليل الحسابات، وإلى حينها تُحسب كل المصروفات كمصروفات تشغيلية فقط.</div>` : ''}`;
  }
  if (tab === 'tb') {
    const sumD = tb.reduce((s,a)=>s+Number(a.total_debit),0), sumC = tb.reduce((s,a)=>s+Number(a.total_credit),0);
    return `<div class="card-title">ميزان المراجعة</div><div class="itw"><table><thead><tr><th>الرمز</th><th>الحساب</th><th>مدين (د.ع)</th><th>دائن (د.ع)</th></tr></thead><tbody>
      ${tb.map(a => `<tr><td class="mono">${a.code}</td><td>${a.name}</td><td class="mono">${Number(a.total_debit)?fmt(a.total_debit):'—'}</td><td class="mono">${Number(a.total_credit)?fmt(a.total_credit):'—'}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="grand-bar"><span class="grand-lbl">الإجمالي (د.ع)</span><span class="grand-val">${fmtIQD(sumD)} / ${fmtIQD(sumC)}</span></div>`;
  }
  if (tab === 'bs') {
    const assets = tb.filter(a=>a.type==='asset'), liab = tb.filter(a=>a.type==='liability'), eq = tb.filter(a=>a.type==='equity');
    const sum = arr => arr.reduce((s,a)=>s+Math.abs(Number(a.net_debit)),0);
    const totalA = sum(assets), totalL = sum(liab), totalE = sum(eq);
    const netIncome = incomeStatementTotals(tb).net;
    return `<div class="card-title">الميزانية العمومية</div>
    <div class="fg2">
      <div><h3 style="font-size:13px;margin-bottom:10px">الأصول</h3>${acctList(assets)}<div class="grand-bar"><span class="grand-lbl">إجمالي الأصول</span><span class="grand-val">${fmtIQD(totalA)}</span></div></div>
      <div><h3 style="font-size:13px;margin-bottom:10px">الخصوم وحقوق الملكية</h3>${acctList(liab)}${acctList(eq)}
        <div style="display:flex;justify-content:space-between;font-size:12.5px;padding:6px 0"><span>صافي دخل الفترة (يُضاف لحقوق الملكية)</span><span class="mono">${fmt(netIncome)}</span></div>
        <div class="grand-bar"><span class="grand-lbl">الإجمالي (د.ع)</span><span class="grand-val">${fmtIQD(totalL + totalE + netIncome)}</span></div></div>
    </div>
    <div style="margin-top:14px;font-size:12px;color:${Math.abs(totalA-(totalL+totalE+netIncome))<0.01?'var(--ok)':'var(--danger)'}">
      ${Math.abs(totalA-(totalL+totalE+netIncome))<0.01 ? '✓ الميزانية متوازنة (الأصول = الخصوم + حقوق الملكية)' : '⚠ فرق في التوازن — راجع القيود'}</div>`;
  }
  // pl
  const { revenue, expense, net } = incomeStatementTotals(tb, true);
  return `<div class="card-title">قائمة الدخل</div>
    <h3 style="font-size:13px;margin-bottom:10px">الإيرادات</h3>${acctList(revenue.rows)}
    <div class="grand-bar"><span class="grand-lbl">إجمالي الإيرادات</span><span class="grand-val">${fmtIQD(revenue.total)}</span></div>
    <h3 style="font-size:13px;margin:16px 0 10px">المصروفات</h3>${acctList(expense.rows)}
    <div class="grand-bar"><span class="grand-lbl">إجمالي المصروفات</span><span class="grand-val">${fmtIQD(expense.total)}</span></div>
    <div class="grand-bar" style="margin-top:16px;background:transparent;border:2px solid var(--border)">
      <span class="grand-lbl">صافي الربح (الخسارة)</span><span class="grand-val" style="color:${net>=0?'var(--ok)':'var(--danger)'}">${fmtIQD(net)}</span></div>`;
}
function acctList(rows) {
  if (!rows.length) return '<div class="ec" style="padding:16px">لا توجد حسابات</div>';
  return `<div class="itw"><table><tbody>${rows.map(a => `<tr><td class="mono" style="width:70px">${a.code}</td><td>${a.name}</td><td class="mono" style="text-align:left">${fmt(Math.abs(Number(a.net_debit ?? (a.total_credit-a.total_debit))))}</td></tr>`).join('')}</tbody></table></div>`;
}
function incomeStatementTotals(tb) {
  const revRows = tb.filter(a=>a.type==='revenue').map(a=>({...a, net_debit: a.total_credit - a.total_debit}));
  const expRows = tb.filter(a=>a.type==='expense').map(a=>({...a, net_debit: a.total_debit - a.total_credit}));
  const revTotal = revRows.reduce((s,a)=>s+Number(a.net_debit),0);
  const expTotal = expRows.reduce((s,a)=>s+Number(a.net_debit),0);
  return { revenue: { rows: revRows, total: revTotal }, expense: { rows: expRows, total: expTotal }, net: revTotal - expTotal };
}

// ── تصدير التقرير الحالي إلى إكسل ──────────────────────────────
window.exportReportExcel = async (tab) => {
  const [tbRaw, accs] = await Promise.all([DB.trialBalance(), DB.chartOfAccounts()]);
  const cogsCodes = new Set(accs.filter(a => a.is_cogs).map(a => a.code));
  const tb = tbRaw.map(a => ({ ...a, is_cogs: cogsCodes.has(a.code) }));
  let rows = [], sheetName = '', fname = '';
  if (tab === 'tp') {
    const t = tradingPlTotals(tb);
    rows = [
      ...t.revRows.map(a => ({ 'القسم': 'المتاجرة — الإيرادات', 'الرمز': a.code, 'الحساب': a.name, 'المبلغ': Math.abs(Number(a.net_debit)) })),
      ...t.cogsRows.map(a => ({ 'القسم': 'المتاجرة — تكلفة المبيعات', 'الرمز': a.code, 'الحساب': a.name, 'المبلغ': Math.abs(Number(a.net_debit)) })),
      { 'القسم': 'المتاجرة', 'الرمز': '', 'الحساب': 'مجمل الربح', 'المبلغ': t.grossProfit },
      ...t.opexRows.map(a => ({ 'القسم': 'أرباح وخسائر — مصروفات', 'الرمز': a.code, 'الحساب': a.name, 'المبلغ': Math.abs(Number(a.net_debit)) })),
      { 'القسم': 'الصافي', 'الرمز': '', 'الحساب': 'صافي الربح (الخسارة)', 'المبلغ': t.netProfit },
    ];
    sheetName = 'المتاجرة والأرباح والخسائر'; fname = `المتاجرة_والأرباح_والخسائر_${todayISO()}.xlsx`;
    exportRowsToExcel(rows, sheetName, fname);
    return;
  }
  if (tab === 'tb') {
    rows = tb.map((a,i) => ({ 'م': i+1, 'الرمز': a.code, 'الحساب': a.name, 'مدين': Number(a.total_debit)||0, 'دائن': Number(a.total_credit)||0 }));
    sheetName = 'ميزان المراجعة'; fname = `ميزان_المراجعة_${todayISO()}.xlsx`;
  } else if (tab === 'bs') {
    const netIncome = incomeStatementTotals(tb).net;
    const section = (arr, label) => arr.map((a,i) => ({ 'القسم': label, 'الرمز': a.code, 'الحساب': a.name, 'الرصيد': Math.abs(Number(a.net_debit ?? (a.total_credit-a.total_debit))) }));
    rows = [
      ...section(tb.filter(a=>a.type==='asset'), 'الأصول'),
      ...section(tb.filter(a=>a.type==='liability'), 'الخصوم'),
      ...section(tb.filter(a=>a.type==='equity'), 'حقوق الملكية'),
      { 'القسم': 'حقوق الملكية', 'الرمز': '', 'الحساب': 'صافي دخل الفترة', 'الرصيد': netIncome },
    ];
    sheetName = 'الميزانية العمومية'; fname = `الميزانية_العمومية_${todayISO()}.xlsx`;
  } else {
    const { revenue, expense, net } = incomeStatementTotals(tb, true);
    rows = [
      ...revenue.rows.map(a => ({ 'القسم': 'الإيرادات', 'الرمز': a.code, 'الحساب': a.name, 'المبلغ': Math.abs(Number(a.net_debit)) })),
      ...expense.rows.map(a => ({ 'القسم': 'المصروفات', 'الرمز': a.code, 'الحساب': a.name, 'المبلغ': Math.abs(Number(a.net_debit)) })),
      { 'القسم': 'الصافي', 'الرمز': '', 'الحساب': 'صافي الربح (الخسارة)', 'المبلغ': net },
    ];
    sheetName = 'قائمة الدخل'; fname = `قائمة_الدخل_${todayISO()}.xlsx`;
  }
  exportRowsToExcel(rows, sheetName, fname);
};

// ── الطباعة الرسمية (تصدير PDF عبر مربع حوار طباعة المتصفح) ──────────────────────────────
window.printReport = async (tab) => {
  const body = document.getElementById('report-body').innerHTML;
  await renderPrintArea(reportTitle(tab), body);
  window.print();
};
function reportTitle(tab) { return tab === 'tb' ? 'ميزان المراجعة' : tab === 'bs' ? 'الميزانية العمومية' : tab === 'tp' ? 'المتاجرة والأرباح والخسائر' : 'قائمة الدخل'; }

async function printDocument(doc, items, isReceipt) {
  const rows = items.map((it, i) => `<tr><td>${i+1}</td><td class="mono">${it.materials.store_num}</td><td>${it.materials.name}</td>
    <td>${fmtQty(it.qty)} ${it.materials.unit}</td><td class="mono">${fmt(it.unit_price)}</td><td class="mono">${fmt(it.total)}</td></tr>`).join('');
  const html = `
    <table style="width:100%;font-size:12px;margin-bottom:14px"><tr>
      <td>رقم الوثيقة: <b class="mono">${doc.doc_num}</b></td><td>التاريخ: <b>${doc.doc_date}</b></td><td>المخزن: <b>${doc.warehouses?.name||''}</b></td>
    </tr></table>
    <table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="border-bottom:1px solid #999">
      <th>#</th><th>الرقم المخزني</th><th>اسم المادة</th><th>الكمية</th><th>${isReceipt?'سعر الوصل':'السعر الوسطي'} (د.ع)</th><th>الإجمالي (د.ع)</th>
    </tr></thead><tbody>${rows}</tbody></table>
    <div style="text-align:left;margin-top:10px;font-weight:800">الإجمالي الكلي: ${fmt(doc.total)}</div>
    ${doc.notes ? `<div style="margin-top:10px;font-size:12px">ملاحظات: ${doc.notes}</div>` : ''}
    <div style="display:flex;justify-content:space-between;margin-top:50px;font-size:12px">
      <div>توقيع أمين المخزن: ____________________</div><div>توقيع المحاسب: ____________________</div><div>توقيع المدير: ____________________</div>
    </div>`;
  await renderPrintArea((isReceipt ? 'وثيقة استلام مخزني' : 'وثيقة إصدار مخزني'), html);
  window.print();
}
window.printDocument = printDocument;

// ── إعدادات قالب الطباعة (شعار + تذييل) — تُجلب مرة وتُخزَّن مؤقتاً بالجلسة ──────────────────────────────
window.__printSettings = window.__printSettings || null;
async function getPrintSettings() {
  if (window.__printSettings) return window.__printSettings;
  try {
    const [logo, footer] = await Promise.all([DB.getSetting('print_logo_url'), DB.getSetting('print_footer_text')]);
    window.__printSettings = { logo, footer };
  } catch (e) { window.__printSettings = { logo: null, footer: null }; }
  return window.__printSettings;
}

async function renderPrintArea(title, bodyHTML) {
  // #print-area is display:none on screen and shown only inside @media print (see styles.css)
  const { logo, footer } = await getPrintSettings();
  let area = document.getElementById('print-area');
  if (!area) { area = document.createElement('div'); area.id = 'print-area'; document.body.appendChild(area); }
  const sealHTML = logo ? `<img src="${logo}" alt="شعار" style="width:56px;height:56px;object-fit:contain">` : `<div class="print-seal">🏛</div>`;
  area.innerHTML = `<div class="print-header">${sealHTML}
      <div style="text-align:center"><div style="font-weight:800;font-size:15px">${window.APP_CONFIG.APP_NAME}</div><div style="font-size:12px">${title}</div></div>
      <div style="font-size:11px">تاريخ الطباعة: ${new Date().toLocaleString('ar-IQ')}</div></div>
    ${bodyHTML}
    ${footer ? `<div style="margin-top:30px;padding-top:10px;border-top:1px solid #ccc;font-size:11px;text-align:center;color:#555">${footer}</div>` : ''}`;
}
