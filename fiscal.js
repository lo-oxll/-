// ══════════════════════════════════════════════════════════════════
//  السنوات المالية: عرض الأرشيف + إقفال السنة الحالية وبدء سنة جديدة
//  + تصدير/استيراد الأرصدة الافتتاحية (إكسل)
// ══════════════════════════════════════════════════════════════════

PAGE_RENDER.fiscal = async (root) => {
  const years = await DB.listFiscalYears();
  const active = years.find(y => y.is_active);

  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">📅 السنوات المالية</div><div class="ph-sub">السنة النشطة الحالية: <b style="color:var(--gold)">${active ? active.year : '—'}</b></div></div>
      ${can('admin') ? `<div class="ph-actions"><button class="btn btn-p" onclick="openCloseYearModal(${active ? active.year : 'null'})">🔒 إقفال السنة الحالية وبدء سنة جديدة</button></div>` : ''}
    </div>

    <div class="card"><div class="card-title">جميع السنوات</div>
      <div class="itw"><table><thead><tr><th>السنة</th><th>الحالة</th><th>تاريخ الفتح</th><th>تاريخ الإقفال</th><th></th></tr></thead><tbody>
        ${years.map(y => `<tr>
          <td class="mono" style="font-weight:800">${y.year}</td>
          <td>${y.is_active ? '<span class="chip-ok chip">نشطة</span>' : '<span class="chip chip-gold">مؤرشفة</span>'}</td>
          <td class="mono">${new Date(y.opened_at).toLocaleDateString('ar-IQ')}</td>
          <td class="mono">${y.closed_at ? new Date(y.closed_at).toLocaleDateString('ar-IQ') : '—'}</td>
          <td>
            <button class="btn btn-o btn-sm" onclick="viewOpeningBalances('${y.id}', ${y.year})">عرض الأرصدة الافتتاحية</button>
            <button class="btn btn-o btn-sm" onclick="exportOpeningBalancesExcel('${y.id}', ${y.year})">⬇ تصدير إكسل</button>
          </td>
        </tr>`).join('') || '<tr><td colspan="5" class="ec">لا توجد سنوات مسجّلة</td></tr>'}
      </tbody></table></div>
    </div>

    <div id="ob-view"></div>

    <div class="card" style="border:1px dashed var(--border)">
      <div class="card-title">ℹ️ كيف يعمل الإقفال السنوي</div>
      <div style="font-size:12.5px;color:var(--ink2);line-height:2">
        1) عند الإقفال، يُلتقط رصيد كل مادة (الكمية + السعر الوسطي) بكل مخزن كما هو لحظة الإقفال ويُسجَّل كـ"رصيد افتتاحي" للسنة الجديدة.<br>
        2) صافي أرصدة حسابات الأصول والخصوم وحقوق الملكية يُرحَّل كرصيد افتتاحي؛ حسابات الإيرادات والمصروفات تبدأ من صفر بالسنة الجديدة (كما بالأصول المحاسبية).<br>
        3) دليل المواد والمخازن ودليل الحسابات <b>لا تتكرر</b> — تبقى مشتركة بين كل السنوات.<br>
        4) وثائق الاستلام/الإصدار والقيود المحاسبية للسنوات المُقفلة تبقى محفوظة بالكامل ويمكن الرجوع لها من صفحة "سجل الوثائق" باختيار السنة (للأدمن فقط).<br>
        5) الإقفال إجراء ${can('admin') ? '<b style="color:var(--danger)">لا يمكن التراجع عنه</b>' : 'يقوم به مدير النظام فقط'} — تأكد من ترحيل كل وثائق السنة الحالية قبل الإقفال.
      </div>
    </div>
  `;
};

// ── عرض الأرصدة الافتتاحية لسنة معينة ──────────────────────────────
window.viewOpeningBalances = async (fyId, year) => {
  const rows = await DB.openingBalances(fyId);
  const el = document.getElementById('ob-view');
  const matRows = rows.filter(r => r.store_num);
  const accRows = rows.filter(r => r.account_code);
  el.innerHTML = `
    <div class="card">
      <div class="card-title">الأرصدة الافتتاحية — سنة ${year} (${rows.length} صف)</div>
      ${matRows.length ? `<h3 style="font-size:12.5px;margin:10px 0">أرصدة المواد</h3>
      <div class="itw"><table><thead><tr><th>م</th><th>الرقم المخزني</th><th>المادة</th><th>المخزن</th><th>الكمية</th><th>السعر</th><th>القيمة</th></tr></thead><tbody>
        ${matRows.map(r => `<tr><td class="mono">${r.seq}</td><td class="mono">${r.store_num}</td><td>${r.material_name}</td><td>${r.warehouse_name}</td>
          <td class="mono">${fmtQty(r.qty)}</td><td class="mono">${fmt(r.unit_price)}</td><td class="gold-txt">${fmt(r.total)}</td></tr>`).join('')}
      </tbody></table></div>` : ''}
      ${accRows.length ? `<h3 style="font-size:12.5px;margin:16px 0 10px">أرصدة الحسابات</h3>
      <div class="itw"><table><thead><tr><th>م</th><th>الرمز</th><th>الحساب</th><th>الرصيد</th></tr></thead><tbody>
        ${accRows.map(r => `<tr><td class="mono">${r.seq}</td><td class="mono">${r.account_code}</td><td>${r.account_name}</td><td class="mono">${fmt(r.qty * r.unit_price)}</td></tr>`).join('')}
      </tbody></table></div>` : ''}
      ${!rows.length ? '<div class="ec">لا توجد أرصدة مسجّلة لهذه السنة</div>' : ''}
    </div>`;
  el.scrollIntoView({ behavior: 'smooth' });
};

// ── تصدير الأرصدة الافتتاحية إلى إكسل (بالأعمدة المطلوبة: م/الوثيقة/الحساب/المادة/الكمية/السعر/القيمة/التاريخ) ──────────────────────────────
window.exportOpeningBalancesExcel = async (fyId, year) => {
  const rows = await DB.openingBalances(fyId);
  if (!rows.length) { toast('لا توجد أرصدة افتتاحية لهذه السنة', 'e'); return; }
  const excelRows = rows.map(r => ({
    'م': r.seq,
    'الوثيقة': r.doc_ref || '',
    'الحساب': r.account_code ? `${r.account_code} — ${r.account_name}` : '',
    'المادة': r.store_num ? `${r.store_num} — ${r.material_name}` : '',
    'المخزن': r.warehouse_name || '',
    'الكمية': r.store_num ? r.qty : '',
    'السعر': r.unit_price,
    'القيمة': r.total,
    'التاريخ': r.balance_date,
  }));
  const ws = XLSX.utils.json_to_sheet(excelRows);
  ws['!cols'] = [{wch:5},{wch:14},{wch:26},{wch:26},{wch:14},{wch:12},{wch:12},{wch:14},{wch:12}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `أرصدة ${year}`);
  XLSX.writeFile(wb, `الأرصدة_الافتتاحية_${year}.xlsx`);
};

// ── إقفال السنة الحالية وبدء سنة جديدة ──────────────────────────────
window.openCloseYearModal = (currentYear) => {
  const suggested = (currentYear || new Date().getFullYear()) + 1;
  showModal('🔒 إقفال السنة الحالية وبدء سنة جديدة', `
    <div style="background:rgba(209,85,74,.1);border:1px solid var(--danger);border-radius:10px;padding:12px;margin-bottom:14px;font-size:12.5px;color:var(--danger)">
      ⚠️ هذا الإجراء نهائي ولا يمكن التراجع عنه. تأكد من ترحيل كل وثائق ${currentYear || 'السنة الحالية'} قبل المتابعة.
    </div>
    <div class="fgroup"><label>سنة البدء الجديدة *</label><input type="number" id="m-new-year" value="${suggested}"></div>
  `, async () => {
    const newYear = Number(gv('m-new-year'));
    if (!newYear || newYear <= (currentYear || 0)) { toast('أدخل سنة صحيحة أكبر من السنة الحالية', 'e'); return false; }
    if (!confirm(`متأكد تريد إقفال سنة ${currentYear} وبدء سنة ${newYear}؟ هذا الإجراء نهائي.`)) return false;
    try {
      await DB.closeFiscalYear(newYear);
      toast(`✅ تم إقفال السنة وبدء سنة ${newYear}`, 's');
      go('fiscal');
      return true;
    } catch (e) { toast('خطأ: ' + e.message, 'e'); return false; }
  });
};
