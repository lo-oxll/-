// ══════════════════════════════════════════════════════════════════
//  التقارير المالية: ميزان المراجعة، الميزانية العمومية، قائمة الدخل
// ══════════════════════════════════════════════════════════════════
PAGE_RENDER.reports = async (root, tab = 'tb') => {
  const tb = await DB.trialBalance();
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">التقارير المالية</div><div class="ph-sub">مُستخلَصة مباشرة من القيود المحاسبية المرحّلة</div></div>
      <div class="ph-actions">
        <button class="btn ${tab==='tb'?'btn-p':'btn-o'} btn-sm" onclick="PAGE_RENDER.reports(document.getElementById('page-root'),'tb')">ميزان المراجعة</button>
        <button class="btn ${tab==='bs'?'btn-p':'btn-o'} btn-sm" onclick="PAGE_RENDER.reports(document.getElementById('page-root'),'bs')">الميزانية العمومية</button>
        <button class="btn ${tab==='pl'?'btn-p':'btn-o'} btn-sm" onclick="PAGE_RENDER.reports(document.getElementById('page-root'),'pl')">قائمة الدخل</button>
        <button class="btn btn-o btn-sm" onclick="printReport('${tab}')">🖨 طباعة / PDF</button>
      </div></div>
    <div class="card" id="report-body">${renderReportBody(tab, tb)}</div>
  `;
};

function renderReportBody(tab, tb) {
  if (tab === 'tb') {
    const sumD = tb.reduce((s,a)=>s+Number(a.total_debit),0), sumC = tb.reduce((s,a)=>s+Number(a.total_credit),0);
    return `<div class="card-title">ميزان المراجعة</div><div class="itw"><table><thead><tr><th>الرمز</th><th>الحساب</th><th>مدين</th><th>دائن</th></tr></thead><tbody>
      ${tb.map(a => `<tr><td class="mono">${a.code}</td><td>${a.name}</td><td class="mono">${Number(a.total_debit)?fmt(a.total_debit):'—'}</td><td class="mono">${Number(a.total_credit)?fmt(a.total_credit):'—'}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="grand-bar"><span class="grand-lbl">الإجمالي</span><span class="grand-val">${fmt(sumD)} / ${fmt(sumC)}</span></div>`;
  }
  if (tab === 'bs') {
    const assets = tb.filter(a=>a.type==='asset'), liab = tb.filter(a=>a.type==='liability'), eq = tb.filter(a=>a.type==='equity');
    const sum = arr => arr.reduce((s,a)=>s+Math.abs(Number(a.net_debit)),0);
    const totalA = sum(assets), totalL = sum(liab), totalE = sum(eq);
    const netIncome = incomeStatementTotals(tb).net;
    return `<div class="card-title">الميزانية العمومية</div>
    <div class="fg2">
      <div><h3 style="font-size:13px;margin-bottom:10px">الأصول</h3>${acctList(assets)}<div class="grand-bar"><span class="grand-lbl">إجمالي الأصول</span><span class="grand-val">${fmt(totalA)}</span></div></div>
      <div><h3 style="font-size:13px;margin-bottom:10px">الخصوم وحقوق الملكية</h3>${acctList(liab)}${acctList(eq)}
        <div style="display:flex;justify-content:space-between;font-size:12.5px;padding:6px 0"><span>صافي دخل الفترة (يُضاف لحقوق الملكية)</span><span class="mono">${fmt(netIncome)}</span></div>
        <div class="grand-bar"><span class="grand-lbl">الإجمالي</span><span class="grand-val">${fmt(totalL + totalE + netIncome)}</span></div></div>
    </div>
    <div style="margin-top:14px;font-size:12px;color:${Math.abs(totalA-(totalL+totalE+netIncome))<0.01?'var(--ok)':'var(--danger)'}">
      ${Math.abs(totalA-(totalL+totalE+netIncome))<0.01 ? '✓ الميزانية متوازنة (الأصول = الخصوم + حقوق الملكية)' : '⚠ فرق في التوازن — راجع القيود'}</div>`;
  }
  // pl
  const { revenue, expense, net } = incomeStatementTotals(tb, true);
  return `<div class="card-title">قائمة الدخل</div>
    <h3 style="font-size:13px;margin-bottom:10px">الإيرادات</h3>${acctList(revenue.rows)}
    <div class="grand-bar"><span class="grand-lbl">إجمالي الإيرادات</span><span class="grand-val">${fmt(revenue.total)}</span></div>
    <h3 style="font-size:13px;margin:16px 0 10px">المصروفات</h3>${acctList(expense.rows)}
    <div class="grand-bar"><span class="grand-lbl">إجمالي المصروفات</span><span class="grand-val">${fmt(expense.total)}</span></div>
    <div class="grand-bar" style="margin-top:16px;background:transparent;border:2px solid var(--border)">
      <span class="grand-lbl">صافي الربح (الخسارة)</span><span class="grand-val" style="color:${net>=0?'var(--ok)':'var(--danger)'}">${fmt(net)}</span></div>`;
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

// ── الطباعة الرسمية (تصدير PDF عبر مربع حوار طباعة المتصفح) ──────────────────────────────
window.printReport = (tab) => {
  const body = document.getElementById('report-body').innerHTML;
  renderPrintArea(reportTitle(tab), body);
  window.print();
};
function reportTitle(tab) { return tab === 'tb' ? 'ميزان المراجعة' : tab === 'bs' ? 'الميزانية العمومية' : 'قائمة الدخل'; }

function printDocument(doc, items, isReceipt) {
  const rows = items.map((it, i) => `<tr><td>${i+1}</td><td class="mono">${it.materials.store_num}</td><td>${it.materials.name}</td>
    <td>${fmtQty(it.qty)} ${it.materials.unit}</td><td class="mono">${fmt(it.unit_price)}</td><td class="mono">${fmt(it.total)}</td></tr>`).join('');
  const html = `
    <table style="width:100%;font-size:12px;margin-bottom:14px"><tr>
      <td>رقم الوثيقة: <b class="mono">${doc.doc_num}</b></td><td>التاريخ: <b>${doc.doc_date}</b></td><td>المخزن: <b>${doc.warehouses?.name||''}</b></td>
    </tr></table>
    ${isReceipt ? `<div style="font-size:12px;margin-bottom:10px">المورّد: <b>${doc.supplier||'—'}</b> ${doc.purchase_ref?('— مرجع الشراء: '+doc.purchase_ref):''}</div>`
                : `<div style="font-size:12px;margin-bottom:10px">الجهة المستلمة: <b>${doc.recipient_name}</b> ${doc.recipient_person?('— المستلم: '+doc.recipient_person):''}</div>`}
    <table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="border-bottom:1px solid #999">
      <th>#</th><th>الرقم المخزني</th><th>اسم المادة</th><th>الكمية</th><th>${isReceipt?'سعر الوصل':'السعر الوسطي'}</th><th>الإجمالي</th>
    </tr></thead><tbody>${rows}</tbody></table>
    <div style="text-align:left;margin-top:10px;font-weight:800">الإجمالي الكلي: ${fmt(doc.total)}</div>
    ${doc.notes ? `<div style="margin-top:10px;font-size:12px">ملاحظات: ${doc.notes}</div>` : ''}
    <div style="display:flex;justify-content:space-between;margin-top:50px;font-size:12px">
      <div>توقيع أمين المخزن: ____________________</div><div>توقيع المحاسب: ____________________</div><div>توقيع المدير: ____________________</div>
    </div>`;
  renderPrintArea((isReceipt ? 'وثيقة استلام مخزني' : 'وثيقة إصدار مخزني'), html);
  window.print();
}
window.printDocument = printDocument;

function renderPrintArea(title, bodyHTML) {
  // #print-area is display:none on screen and shown only inside @media print (see styles.css)
  let area = document.getElementById('print-area');
  if (!area) { area = document.createElement('div'); area.id = 'print-area'; document.body.appendChild(area); }
  area.innerHTML = `<div class="print-header"><div class="print-seal">🏛</div>
      <div style="text-align:center"><div style="font-weight:800;font-size:15px">${window.APP_CONFIG.APP_NAME}</div><div style="font-size:12px">${title}</div></div>
      <div style="font-size:11px">تاريخ الطباعة: ${new Date().toLocaleString('ar-IQ')}</div></div>
    ${bodyHTML}`;
}
