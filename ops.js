// ══════════════════════════════════════════════════════════════════
//  حزمة التوسعة: تحويل مخزني، دليل الموردين، سلف الموظفين، الأصول
//  الثابتة والإهلاك، الموازنة التقديرية، فحص سلامة البيانات، الأمان (2FA)
// ══════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════
//  التحويل المخزني بين المخازن
// ════════════════════════════════════════════════════════════════
PAGE_RENDER.transfer = async (root, mode = 'list', id = null) => {
  if (!can('admin','accountant')) { root.innerHTML = '<div class="card ec">لا تملك صلاحية الوصول لهذه الصفحة</div>'; return; }
  if (mode === 'new') return renderTransferForm(root);
  if (mode === 'view') return renderTransferView(root, id);

  const list = await DB.listStockTransfers();
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">🔀 تحويل بين المخازن</div><div class="ph-sub">نقل مادة من مخزن لآخر بالسعر الوسطي الحالي — بدون أثر على القيود المحاسبية (نفس حساب المخزون)</div></div>
      <div class="ph-actions"><button class="btn btn-p" onclick="PAGE_RENDER.transfer(document.getElementById('page-root'),'new')">+ تحويل جديد</button></div></div>
    <div class="card"><div class="itw"><table><thead><tr><th>تسلسل</th><th>رقم المستند</th><th>التاريخ</th><th>من</th><th>إلى</th><th>الحالة</th><th></th></tr></thead><tbody>
      ${list.map(t => `<tr><td class="mono">${t.seq_no}</td><td class="doc-num">${t.doc_num}</td><td class="mono">${t.doc_date}</td>
        <td>${t.from?.code} — ${t.from?.name}</td><td>${t.to?.code} — ${t.to?.name}</td>
        <td>${t.is_cancelled ? '<span class="chip-danger chip">ملغى</span>' : '<span class="chip-ok chip">مُنفَّذ</span>'}</td>
        <td><button class="btn btn-o btn-sm" onclick="PAGE_RENDER.transfer(document.getElementById('page-root'),'view','${t.id}')">عرض</button>
          ${can('admin') && !t.is_cancelled ? `<button class="btn btn-d btn-sm" onclick="cancelTransferConfirm('${t.id}','${t.doc_num}')">إلغاء</button>` : ''}
          ${can('admin') ? `<button class="btn btn-d btn-sm" onclick="deleteTransferConfirm('${t.id}','${t.doc_num}')">🗑 حذف</button>` : ''}
        </td></tr>`).join('') || '<tr><td colspan="7" class="ec">لا توجد تحويلات مسجّلة بعد</td></tr>'}
    </tbody></table></div></div>`;
};

function trItemRowHTML() {
  return `<tr>
    <td class="mono row-idx"></td>
    <td style="min-width:220px" class="ac-wrap"><input class="tr-mat-search" placeholder="ابحث بالرقم المخزني أو الاسم..."><div class="ac-portal"></div><input type="hidden" class="tr-mat-id"></td>
    <td style="width:100px" class="tr-avail mono">—</td>
    <td style="width:100px"><input type="number" step="0.001" class="tr-qty mono" value="1"></td>
    <td style="width:40px"><button class="btn btn-d btn-sm" onclick="this.closest('tr').remove()">✕</button></td>
  </tr>`;
}
async function addTransferRow() {
  const tbody = document.getElementById('tr-items');
  tbody.insertAdjacentHTML('beforeend', trItemRowHTML());
  const row = tbody.lastElementChild;
  const searchInp = row.querySelector('.tr-mat-search');
  const portal = row.querySelector('.ac-portal');
  bindAutocomplete(searchInp, portal,
    term => term ? DB.listMaterials(term) : [],
    async m => {
      searchInp.value = `${m.store_num} — ${m.name}`;
      row.querySelector('.tr-mat-id').value = m.id;
      const fromWh = gv('tr-from');
      if (fromWh) {
        const stock = await DB.stockOf(m.id, fromWh);
        row.querySelector('.tr-avail').textContent = fmtQty(stock?.qty_on_hand || 0);
      }
    },
    (m, first) => `<div class="ac-item ${first?'hi':''}"><span class="ac-code">${m.store_num}</span><span>${m.name}</span></div>`
  );
  [...tbody.children].forEach((tr, i) => tr.querySelector('.row-idx').textContent = i + 1);
}
window.addTransferRow = addTransferRow;

function renderTransferForm(root) {
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">🔀 تحويل مخزني جديد</div></div>
      <div class="ph-actions"><button class="btn btn-o" onclick="go('transfer')">إلغاء</button><button class="btn btn-p" id="tr-save-btn">💾 حفظ وتنفيذ التحويل</button></div></div>
    <div class="card">
      <div class="fg" style="margin-bottom:14px" id="tr-header-fields"></div>
      <div class="itw"><table><thead><tr><th>#</th><th>المادة</th><th>الرصيد المتاح بالمصدر</th><th>الكمية المحوَّلة</th><th></th></tr></thead><tbody id="tr-items"></tbody></table></div>
      <button class="btn btn-o btn-sm" style="margin-top:10px" onclick="addTransferRow()">+ إضافة مادة</button>
    </div>`;
  DB.listWarehouses().then(whs => {
    const opts = whs.map(w => `<option value="${w.id}">${w.code} — ${w.name}</option>`).join('');
    document.getElementById('tr-header-fields').innerHTML = `
      <div class="fgroup"><label>رقم المستند *</label><input id="tr-docnum"></div>
      <div class="fgroup"><label>التاريخ *</label><input type="date" id="tr-docdate" value="${todayISO()}"></div>
      <div class="fgroup"><label>من مخزن *</label><select id="tr-from"><option value="">اختر...</option>${opts}</select></div>
      <div class="fgroup"><label>إلى مخزن *</label><select id="tr-to"><option value="">اختر...</option>${opts}</select></div>
      <div class="fgroup s2"><label>ملاحظات</label><input id="tr-notes"></div>`;
    addTransferRow();
  });
  document.getElementById('tr-save-btn').onclick = saveTransfer;
}
async function saveTransfer() {
  const docNum = gv('tr-docnum'), from = gv('tr-from'), to = gv('tr-to');
  if (!docNum || !from || !to) { toast('أكمل رقم المستند والمخزنين', 'e'); return; }
  if (from === to) { toast('لا يمكن التحويل لنفس المخزن', 'e'); return; }
  const items = [];
  for (const tr of document.querySelectorAll('#tr-items tr')) {
    const matId = tr.querySelector('.tr-mat-id').value;
    const qty = Number(tr.querySelector('.tr-qty').value) || 0;
    if (!matId || qty <= 0) continue;
    const stock = await DB.stockOf(matId, from);
    items.push({ material_id: matId, qty, unit_price: stock?.avg_price || 0 });
  }
  if (!items.length) { toast('أضف مادة واحدة على الأقل', 'e'); return; }
  if (!confirm(`سيتم تنفيذ التحويل فوراً وتحديث أرصدة المخزنين. متابعة؟`)) return;
  try {
    const t = await DB.createStockTransfer({ doc_num: docNum, doc_date: gv('tr-docdate'), from_warehouse_id: from, to_warehouse_id: to, notes: gv('tr-notes') || null }, items);
    toast('✅ تم تنفيذ التحويل', 's');
    PAGE_RENDER.transfer(document.getElementById('page-root'), 'view', t.id);
  } catch (e) { toast('خطأ: ' + friendlyStockError(e.message), 'e'); }
}
async function renderTransferView(root, id) {
  const t = await DB.getStockTransfer(id);
  const items = await DB.stockTransferItems(id);
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">🔀 تحويل رقم ${t.doc_num}</div><div class="ph-sub">${t.doc_date} — من ${t.from?.name} إلى ${t.to?.name} — ${t.is_cancelled?'ملغى':'مُنفَّذ'}</div></div>
      <div class="ph-actions"><button class="btn btn-o" onclick="go('transfer')">◀ رجوع</button></div></div>
    <div class="card"><div class="itw"><table><thead><tr><th>المادة</th><th>الكمية</th><th>السعر الوسطي وقت التحويل</th></tr></thead><tbody>
      ${items.map(it => `<tr><td>${it.materials?.store_num} — ${it.materials?.name}</td><td class="mono">${fmtQty(it.qty)} ${it.materials?.unit||''}</td><td class="mono">${fmt(it.unit_price)}</td></tr>`).join('')}
    </tbody></table></div>${t.notes ? `<div style="margin-top:10px;font-size:12.5px">ملاحظات: ${t.notes}</div>` : ''}</div>`;
}
window.cancelTransferConfirm = async (id, docNum) => {
  if (!confirm(`⚠️ إلغاء التحويل "${docNum}" وعكس أثره على المخزنين. متابعة؟`)) return;
  try { await DB.cancelStockTransfer(id, docNum); toast('تم الإلغاء', 's'); go('transfer'); }
  catch (e) { toast('تعذر الإلغاء: ' + friendlyStockError(e.message), 'e'); }
};
window.deleteTransferConfirm = async (id, docNum) => {
  if (!confirm(`⚠️ حذف نهائي لسجل التحويل "${docNum}" (بدون عكس الأثر إن لم يُلغَ أولاً). متابعة؟`)) return;
  try { await DB.deleteStockTransfer(id, docNum); toast('تم الحذف', 's'); go('transfer'); }
  catch (e) { toast('تعذر الحذف: ' + e.message, 'e'); }
};

// ════════════════════════════════════════════════════════════════
//  دليل الموردين
// ════════════════════════════════════════════════════════════════
PAGE_RENDER.suppliers = async (root) => {
  if (!can('admin','accountant','central_accountant')) { root.innerHTML = '<div class="card ec">لا تملك صلاحية الوصول لهذه الصفحة</div>'; return; }
  const list = await DB.listSuppliers(false);
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">🏪 دليل الموردين والمحلات</div></div>
      <div class="ph-actions"><button class="btn btn-p" onclick="openSupplierModal()">+ مورد جديد</button></div></div>
    <div class="card"><div class="itw"><table><thead><tr><th>الاسم</th><th>الهاتف</th><th>العنوان</th><th>الحالة</th><th></th></tr></thead><tbody>
      ${list.map(s => `<tr><td>${s.name}</td><td class="mono">${s.phone||'—'}</td><td>${s.address||'—'}</td>
        <td>${s.is_active?'<span class="chip-ok chip">فعّال</span>':'<span class="chip-danger chip">موقوف</span>'}</td>
        <td><button class="btn btn-o btn-sm" onclick='openSupplierModal(${JSON.stringify(s).replace(/'/g,"&#39;")})'>تعديل</button>
          ${can('admin') ? `<button class="btn btn-d btn-sm" onclick="deleteSupplierConfirm('${s.id}','${(s.name||'').replace(/'/g,"\\'")}')">حذف</button>` : ''}
        </td></tr>`).join('') || '<tr><td colspan="5" class="ec">لا يوجد موردون بعد</td></tr>'}
    </tbody></table></div></div>`;
};
window.openSupplierModal = (s = null) => {
  showModal(s ? 'تعديل مورد' : 'مورد جديد', `
    <div class="fg2" style="margin-bottom:10px">
      <div class="fgroup s2"><label>الاسم *</label><input id="m-sup-name" value="${s?.name||''}"></div>
      <div class="fgroup"><label>الهاتف</label><input id="m-sup-phone" value="${s?.phone||''}"></div>
      <div class="fgroup"><label>العنوان</label><input id="m-sup-addr" value="${s?.address||''}"></div>
    </div><div class="fgroup"><label>ملاحظات</label><textarea id="m-sup-notes">${s?.notes||''}</textarea></div>
  `, async () => {
    const name = gv('m-sup-name');
    if (!name) { toast('أدخل اسم المورد', 'e'); return false; }
    const payload = { name, phone: gv('m-sup-phone')||null, address: gv('m-sup-addr')||null, notes: gv('m-sup-notes')||null };
    try {
      if (s) await DB.updateSupplier(s.id, payload); else await DB.createSupplier({ ...payload, is_active: true });
      toast('تم الحفظ', 's'); go('suppliers'); return true;
    } catch (e) { toast('خطأ: ' + e.message, 'e'); return false; }
  });
};
window.deleteSupplierConfirm = async (id, name) => {
  if (!confirm(`حذف المورد "${name}"؟`)) return;
  try { await DB.deleteSupplier(id, name); toast('تم الحذف', 's'); go('suppliers'); }
  catch (e) { toast('تعذر الحذف: ' + e.message, 'e'); }
};

// ════════════════════════════════════════════════════════════════
//  سلف الموظفين
// ════════════════════════════════════════════════════════════════
PAGE_RENDER.loans = async (root) => {
  if (!can('admin','central_accountant')) { root.innerHTML = '<div class="card ec">لا تملك صلاحية الوصول لهذه الصفحة</div>'; return; }
  const loans = await DB.listEmployeeLoans();
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">💳 سلف الموظفين</div><div class="ph-sub">قسط كل سلفة نشطة يُخصم تلقائياً من راتب الموظف عند إضافته لأي كشف راتب جديد، ويقل الرصيد المتبقي تلقائياً عند ترحيل الكشف</div></div>
      <div class="ph-actions"><button class="btn btn-p" onclick="openLoanModal()">+ سلفة جديدة</button></div></div>
    <div class="card"><div class="itw"><table><thead><tr><th>الموظف</th><th>مبلغ السلفة</th><th>القسط الشهري</th><th>الرصيد المتبقي</th><th>الحالة</th><th></th></tr></thead><tbody>
      ${loans.map(l => `<tr><td>${l.employees?.full_name||'—'}</td><td class="mono">${fmt(l.principal_amount)}</td><td class="mono">${fmt(l.monthly_installment)}</td>
        <td class="gold-txt mono">${fmt(l.remaining_balance)}</td>
        <td>${l.status==='active'?'<span class="chip-ok chip">نشطة</span>':'<span class="chip chip-gold">مُسدَّدة</span>'}</td>
        <td>${l.status==='active' ? `<button class="btn btn-o btn-sm" onclick="closeLoanConfirm('${l.id}')">إغلاق يدوي</button>` : ''}
          ${can('admin') ? `<button class="btn btn-d btn-sm" onclick="deleteLoanConfirm('${l.id}')">حذف</button>` : ''}
        </td></tr>`).join('') || '<tr><td colspan="6" class="ec">لا توجد سلف مسجّلة بعد</td></tr>'}
    </tbody></table></div></div>`;
};
window.openLoanModal = async () => {
  const emps = await DB.listEmployees(true);
  const opts = emps.map(e => `<option value="${e.id}">${e.full_name}</option>`).join('');
  showModal('سلفة جديدة لموظف', `
    <div class="fg2" style="margin-bottom:10px">
      <div class="fgroup s2"><label>الموظف *</label><select id="m-loan-emp"><option value="">اختر...</option>${opts}</select></div>
      <div class="fgroup"><label>مبلغ السلفة *</label><input type="number" id="m-loan-amount"></div>
      <div class="fgroup"><label>القسط الشهري *</label><input type="number" id="m-loan-installment"></div>
    </div><div class="fgroup"><label>ملاحظات</label><input id="m-loan-notes"></div>
  `, async () => {
    const emp = gv('m-loan-emp'), amount = Number(gv('m-loan-amount')), inst = Number(gv('m-loan-installment'));
    if (!emp || !amount || !inst) { toast('أكمل كل الحقول', 'e'); return false; }
    try {
      const existing = await DB.activeLoanForEmployee(emp);
      if (existing) { toast('لهذا الموظف سلفة نشطة بالفعل — أغلقها أولاً قبل إضافة سلفة جديدة', 'e'); return false; }
      await DB.createEmployeeLoan({ employee_id: emp, principal_amount: amount, monthly_installment: inst, notes: gv('m-loan-notes')||null });
      toast('تم تسجيل السلفة', 's'); go('loans'); return true;
    } catch (e) { toast('خطأ: ' + e.message, 'e'); return false; }
  });
};
window.closeLoanConfirm = async (id) => {
  if (!confirm('إغلاق هذه السلفة يدوياً (تعتبر مسدَّدة بالكامل)؟')) return;
  try { await DB.closeEmployeeLoan(id); toast('تم الإغلاق', 's'); go('loans'); } catch (e) { toast('خطأ: ' + e.message, 'e'); }
};
window.deleteLoanConfirm = async (id) => {
  if (!confirm('⚠️ حذف نهائي لسجل هذه السلفة. متابعة؟')) return;
  try { await DB.deleteEmployeeLoan(id); toast('تم الحذف', 's'); go('loans'); } catch (e) { toast('تعذر الحذف: ' + e.message, 'e'); }
};

// ════════════════════════════════════════════════════════════════
//  الأصول الثابتة + الإهلاك
// ════════════════════════════════════════════════════════════════
PAGE_RENDER.fixedassets = async (root) => {
  if (!can('admin','central_accountant','manager','auditor')) { root.innerHTML = '<div class="card ec">لا تملك صلاحية الوصول لهذه الصفحة</div>'; return; }
  const canWrite = can('admin','central_accountant');
  const [assets, runs] = await Promise.all([DB.listFixedAssets(), DB.listDepreciationRuns()]);
  const totalCost = assets.reduce((s,a)=>s+Number(a.cost),0);
  const totalDep = assets.reduce((s,a)=>s+Number(a.accum_depreciation),0);
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">🏢 الأصول الثابتة</div><div class="ph-sub">إهلاك بطريقة القسط الثابت — يُرحَّل قيد إهلاك سنوي دفعة واحدة لكل الأصول النشطة</div></div>
      ${canWrite ? `<div class="ph-actions"><button class="btn btn-o" onclick="postDepreciationConfirm()">📉 ترحيل إهلاك السنة</button><button class="btn btn-p" onclick="openAssetModal()">+ أصل جديد</button></div>` : ''}
    </div>
    <div class="stats">
      <div class="stat"><div class="stat-lbl">إجمالي كلفة الأصول</div><div class="stat-val">${fmt(totalCost)}</div></div>
      <div class="stat"><div class="stat-lbl">مجمّع الإهلاك</div><div class="stat-val danger">${fmt(totalDep)}</div></div>
      <div class="stat"><div class="stat-lbl">صافي القيمة الدفترية</div><div class="stat-val gold">${fmt(totalCost-totalDep)}</div></div>
    </div>
    <div class="card"><div class="card-title">سجل الأصول</div><div class="itw"><table><thead><tr>
      <th>الرمز</th><th>الاسم</th><th>الفئة</th><th>تاريخ الشراء</th><th>الكلفة</th><th>مجمّع الإهلاك</th><th>صافي القيمة</th><th>الحالة</th><th></th>
    </tr></thead><tbody>
      ${assets.map(a => `<tr><td class="mono">${a.asset_code}</td><td>${a.name}</td><td>${a.category||'—'}</td><td class="mono">${a.purchase_date}</td>
        <td class="mono">${fmt(a.cost)}</td><td class="mono" style="color:var(--danger)">${fmt(a.accum_depreciation)}</td><td class="gold-txt mono">${fmt(a.cost-a.accum_depreciation)}</td>
        <td>${a.status==='active'?'<span class="chip-ok chip">نشط</span>':'<span class="chip-danger chip">مُستبعَد</span>'}</td>
        <td>${canWrite && a.status==='active' ? `<button class="btn btn-o btn-sm" onclick="disposeAssetConfirm('${a.id}')">استبعاد</button>` : ''}
          ${can('admin') ? `<button class="btn btn-d btn-sm" onclick="deleteAssetConfirm('${a.id}','${(a.name||'').replace(/'/g,"\\'")}')">حذف</button>` : ''}
        </td></tr>`).join('') || '<tr><td colspan="9" class="ec">لا توجد أصول مسجّلة بعد</td></tr>'}
    </tbody></table></div></div>
    <div class="card" style="border:1px dashed var(--border)"><div class="card-title">سجل عمليات الإهلاك المرحَّلة</div><div class="itw"><table><thead><tr><th>التاريخ</th><th>الفترة</th><th>المبلغ الكلي</th>${can('admin')?'<th></th>':''}</tr></thead><tbody>
      ${runs.map(r => `<tr><td class="mono">${r.run_date}</td><td>${r.period_label||'—'}</td><td class="mono">${fmt(r.total_amount)}</td>
        ${can('admin') ? `<td><button class="btn btn-d btn-sm" onclick="deleteDepRunConfirm('${r.id}','${r.journal_entry_id||''}')">حذف</button></td>` : ''}</tr>`).join('') || `<tr><td colspan="${can('admin')?4:3}" class="ec">لا توجد عمليات إهلاك مرحَّلة بعد</td></tr>`}
    </tbody></table></div></div>`;
};
window.openAssetModal = async () => {
  const accs = await DB.chartOfAccounts();
  const opts = accs.map(a => `<option value="${a.id}">${a.code} — ${a.name}</option>`).join('');
  showModal('أصل ثابت جديد', `
    <div class="fg2" style="margin-bottom:10px">
      <div class="fgroup"><label>رمز الأصل *</label><input id="m-fa-code"></div>
      <div class="fgroup"><label>الاسم *</label><input id="m-fa-name"></div>
      <div class="fgroup"><label>الفئة</label><input id="m-fa-cat"></div>
      <div class="fgroup"><label>تاريخ الشراء *</label><input type="date" id="m-fa-date" value="${todayISO()}"></div>
      <div class="fgroup"><label>الكلفة *</label><input type="number" id="m-fa-cost"></div>
      <div class="fgroup"><label>قيمة الخردة</label><input type="number" id="m-fa-salvage" value="0"></div>
      <div class="fgroup"><label>العمر الإنتاجي (سنوات) *</label><input type="number" id="m-fa-life" value="5"></div>
      <div class="fgroup"><label>الموقع</label><input id="m-fa-loc"></div>
      <div class="fgroup s2"><label>حساب الأصل (بالميزانية)</label><select id="m-fa-acc"><option value="">— اختياري —</option>${opts}</select></div>
      <div class="fgroup s2"><label>حساب مصروف الإهلاك</label><select id="m-fa-depacc"><option value="">— اختياري —</option>${opts}</select></div>
    </div>
  `, async () => {
    const code = gv('m-fa-code'), name = gv('m-fa-name'), cost = Number(gv('m-fa-cost')), life = Number(gv('m-fa-life'));
    if (!code || !name || !cost || !life) { toast('أكمل الحقول الإلزامية', 'e'); return false; }
    try {
      await DB.createFixedAsset({ asset_code: code, name, category: gv('m-fa-cat')||null, purchase_date: gv('m-fa-date'), cost,
        salvage_value: Number(gv('m-fa-salvage'))||0, useful_life_years: life, location: gv('m-fa-loc')||null,
        asset_account_id: gv('m-fa-acc')||null, depreciation_account_id: gv('m-fa-depacc')||null });
      toast('تم تسجيل الأصل', 's'); go('fixedassets'); return true;
    } catch (e) { toast('خطأ: ' + e.message, 'e'); return false; }
  });
};
window.disposeAssetConfirm = async (id) => {
  if (!confirm('استبعاد هذا الأصل (لن يُحسب له إهلاك بعد الآن)؟')) return;
  try { await DB.disposeFixedAsset(id); toast('تم الاستبعاد', 's'); go('fixedassets'); } catch (e) { toast('خطأ: ' + e.message, 'e'); }
};
window.deleteAssetConfirm = async (id, name) => {
  if (!confirm(`⚠️ حذف نهائي للأصل "${name}". متابعة؟`)) return;
  try { await DB.deleteFixedAsset(id, name); toast('تم الحذف', 's'); go('fixedassets'); } catch (e) { toast('تعذر الحذف: ' + e.message, 'e'); }
};
window.postDepreciationConfirm = async () => {
  const label = prompt('عنوان فترة الإهلاك (مثال: سنة 2026):', new Date().getFullYear().toString());
  if (!label) return;
  if (!confirm('سيتم احتساب إهلاك سنة كاملة لكل الأصول النشطة المضبوطة بحساباتها، وترحيل قيد واحد. متابعة؟')) return;
  try { await DB.postDepreciation(label); toast('✅ تم ترحيل قيد الإهلاك', 's'); go('fixedassets'); }
  catch (e) { toast('خطأ: ' + e.message, 'e'); }
};
window.deleteDepRunConfirm = async (id, journalEntryId) => {
  if (!confirm('⚠️ حذف سجل عملية الإهلاك هذه وقيدها المحاسبي (لن يعكس مجمّع الإهلاك المسجَّل بالأصول تلقائياً). متابعة؟')) return;
  try { await DB.deleteDepreciationRun(id, journalEntryId||null); toast('تم الحذف', 's'); go('fixedassets'); }
  catch (e) { toast('تعذر الحذف: ' + e.message, 'e'); }
};

// ════════════════════════════════════════════════════════════════
//  الموازنة التقديرية مقابل الفعلي
// ════════════════════════════════════════════════════════════════
PAGE_RENDER.budget = async (root) => {
  if (!can('admin','manager','central_accountant','auditor')) { root.innerHTML = '<div class="card ec">لا تملك صلاحية الوصول لهذه الصفحة</div>'; return; }
  const years = await DB.listFiscalYears();
  const active = years.find(y => y.is_active) || years[0];
  if (!active) { root.innerHTML = '<div class="card ec">لا توجد سنوات مالية مسجّلة بعد</div>'; return; }
  const [budgets, actualMap, accs] = await Promise.all([DB.listBudgets(active.id), DB.actualByAccount(active.id), DB.chartOfAccounts()]);
  const expAccs = accs.filter(a => a.type === 'expense');
  const budgetMap = Object.fromEntries(budgets.map(b => [b.account_id, b]));
  const canWrite = can('admin','manager');
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">📐 الموازنة التقديرية — سنة ${active.year}</div><div class="ph-sub">مقارنة المصروف الفعلي بالمخطط له لكل حساب مصروف</div></div></div>
    <div class="card"><div class="itw"><table><thead><tr><th>الحساب</th><th>الموازنة المخصَّصة</th><th>الفعلي المتحقق</th><th>الانحراف</th><th>النسبة</th>${canWrite?'<th></th>':''}</tr></thead><tbody>
      ${expAccs.map(a => {
        const b = budgetMap[a.id]; const budgeted = Number(b?.budgeted_amount || 0);
        const actual = Number(actualMap[a.id] || 0); const variance = budgeted - actual;
        const pct = budgeted ? Math.round((actual/budgeted)*100) : (actual ? 100 : 0);
        return `<tr><td>${a.code} — ${a.name}</td><td class="mono">${fmt(budgeted)}</td><td class="mono">${fmt(actual)}</td>
          <td class="mono" style="color:${variance>=0?'var(--ok)':'var(--danger)'}">${fmt(variance)}</td>
          <td><div class="progress-bar" style="width:80px"><div class="progress-fill ${pct>100?'danger':''}" style="width:${Math.min(pct,100)}%"></div></div> ${pct}%</td>
          ${canWrite ? `<td><button class="btn btn-o btn-sm" onclick="openBudgetModal('${active.id}','${a.id}','${a.code} — ${a.name}',${budgeted})">تعديل</button></td>` : ''}
        </tr>`;
      }).join('') || `<tr><td colspan="${canWrite?6:5}" class="ec">لا توجد حسابات مصروفات بدليل الحسابات</td></tr>`}
    </tbody></table></div></div>`;
};
window.openBudgetModal = (fyId, accId, accLabel, current) => {
  showModal(`موازنة: ${accLabel}`, `<div class="fgroup"><label>المبلغ المخصَّص للسنة (د.ع)</label><input type="number" id="m-bud-amount" value="${current}"></div>`, async () => {
    const amount = Number(gv('m-bud-amount')) || 0;
    try { await DB.upsertBudget({ fiscal_year_id: fyId, account_id: accId, budgeted_amount: amount }); toast('تم الحفظ', 's'); go('budget'); return true; }
    catch (e) { toast('خطأ: ' + e.message, 'e'); return false; }
  });
};

// ════════════════════════════════════════════════════════════════
//  فحص سلامة البيانات
// ════════════════════════════════════════════════════════════════
PAGE_RENDER.integrity = async (root) => {
  if (!can('admin','manager','auditor')) { root.innerHTML = '<div class="card ec">لا تملك صلاحية الوصول لهذه الصفحة</div>'; return; }
  root.innerHTML = '<div class="ec">جارِ الفحص...</div>';
  const rows = await DB.integrityCheck();
  const icon = s => s === 'ok' ? '✅' : s === 'warn' ? '⚠️' : '❌';
  const failCount = rows.filter(r => r.status === 'fail').length;
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">🩺 فحص سلامة البيانات</div><div class="ph-sub">فحوصات تشخيصية فقط (بدون أي تعديل) — يتأكد من توازن القيود، الأرصدة، والروابط المحاسبية</div></div>
      <div class="ph-actions"><button class="btn btn-o" onclick="go('integrity')">🔄 إعادة الفحص</button></div></div>
    <div class="stats">
      <div class="stat ${failCount ? 'danger' : ''}"><div class="stat-lbl">نتيجة الفحص</div><div class="stat-val ${failCount ? 'danger' : ''}">${failCount ? `⚠️ ${failCount} مشكلة` : '✅ سليم بالكامل'}</div></div>
    </div>
    <div class="card"><div class="itw"><table><thead><tr><th></th><th>الفحص</th><th>التفاصيل</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td style="font-size:18px">${icon(r.status)}</td><td>${r.check_name}</td><td class="mono" style="font-size:12px">${r.detail}</td></tr>`).join('')}
    </tbody></table></div></div>`;
};

// ════════════════════════════════════════════════════════════════
//  الأمان — المصادقة الثنائية (2FA / TOTP) عبر Supabase Auth
// ════════════════════════════════════════════════════════════════
PAGE_RENDER.security = async (root) => {
  root.innerHTML = '<div class="ec">جارِ التحميل...</div>';
  const { data: factorsData, error: e1 } = await sb.auth.mfa.listFactors();
  if (e1) { root.innerHTML = `<div class="card ec">تعذر تحميل إعدادات الأمان: ${e1.message}</div>`; return; }
  const verified = (factorsData.totp || []).filter(f => f.status === 'verified');
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">🛡️ الأمان — المصادقة الثنائية (2FA)</div><div class="ph-sub">تحمي حسابك حتى لو تسربت كلمة المرور — يُطلب رمز من تطبيق مصادقة (Google Authenticator أو مشابه) عند كل تسجيل دخول</div></div></div>
    <div class="card">
      ${verified.length ? `
        <div style="color:var(--ok);font-weight:700;margin-bottom:14px">✅ المصادقة الثنائية مُفعّلة على حسابك</div>
        <button class="btn btn-d btn-sm" onclick="disable2FAConfirm('${verified[0].id}')">إلغاء تفعيل المصادقة الثنائية</button>
      ` : `
        <div style="color:var(--warn);font-weight:700;margin-bottom:14px">⚠️ المصادقة الثنائية غير مُفعّلة حالياً</div>
        <button class="btn btn-p" onclick="enroll2FA()">🔐 تفعيل المصادقة الثنائية</button>
      `}
      <div id="mfa-enroll-area" style="margin-top:16px"></div>
    </div>
    ${can('admin') ? `<div class="card" style="border:1px dashed var(--border)"><div class="card-title">💡 توصية لمدير النظام</div>
      <div style="font-size:12.5px;color:var(--ink2);line-height:1.9">
        يُفضَّل تفعيل المصادقة الثنائية إلزامياً على الأقل لحسابات <b>admin</b> بما إنها أعلى صلاحية بالنظام. هذا الإعداد شخصي لكل مستخدم — وجّه بقية المدراء لتفعيله من هذه الصفحة بحساباتهم.<br><br>
        للنسخ الاحتياطي: فعّل <b>Point-in-Time Recovery</b> من لوحة تحكم Supabase (Database → Backups) — هذه ميزة على مستوى المشروع ولا تُدار من داخل التطبيق.
      </div></div>` : ''}
  `;
};
window.enroll2FA = async () => {
  const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp' });
  if (error) { toast('خطأ: ' + error.message, 'e'); return; }
  document.getElementById('mfa-enroll-area').innerHTML = `
    <div style="text-align:center;margin-bottom:14px"><img src="${data.totp.qr_code}" style="width:180px;height:180px;border-radius:10px;border:1px solid var(--border)"></div>
    <div style="font-size:11px;color:var(--ink3);text-align:center;margin-bottom:14px">امسح الرمز بتطبيق المصادقة، ثم أدخل الرمز المكوَّن من 6 أرقام</div>
    <div class="fgroup"><label>رمز التحقق</label><input id="mfa-code" maxlength="6" style="text-align:center;letter-spacing:4px;font-size:18px"></div>
    <button class="btn btn-p btn-sm" style="margin-top:10px" onclick="verify2FA('${data.id}')">✅ تأكيد التفعيل</button>
  `;
};
window.verify2FA = async (factorId) => {
  const code = gv('mfa-code');
  if (!code || code.length !== 6) { toast('أدخل رمزاً من 6 أرقام', 'e'); return; }
  try {
    const { data: ch, error: e1 } = await sb.auth.mfa.challenge({ factorId });
    if (e1) throw e1;
    const { error: e2 } = await sb.auth.mfa.verify({ factorId, challengeId: ch.id, code });
    if (e2) throw e2;
    toast('✅ تم تفعيل المصادقة الثنائية بنجاح', 's');
    go('security');
  } catch (e) { toast('رمز غير صحيح: ' + e.message, 'e'); }
};
window.disable2FAConfirm = async (factorId) => {
  if (!confirm('⚠️ إلغاء تفعيل المصادقة الثنائية سيقلل حماية حسابك. متابعة؟')) return;
  const { error } = await sb.auth.mfa.unenroll({ factorId });
  if (error) { toast('خطأ: ' + error.message, 'e'); return; }
  toast('تم إلغاء التفعيل', 's');
  go('security');
};
