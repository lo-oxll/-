// ══════════════════════════════════════════════════════════════════
//  الحركة المخزنية: دليل المواد، المخازن، الاستلام، الإصدار، الأرصدة
// ══════════════════════════════════════════════════════════════════

// ── لوحة التحكم ──────────────────────────────
PAGE_RENDER.dashboard = async (root) => {
  const [mats, low, receipts, issues] = await Promise.all([
    DB.listMaterials(), DB.lowStock(), DB.listReceipts(5), DB.listIssues(5),
  ]);
  const todayR = receipts.filter(r => r.doc_date === todayISO()).length;
  const todayI = issues.filter(r => r.doc_date === todayISO()).length;

  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">لوحة التحكم</div><div class="ph-sub">نظرة عامة على الحركة المخزنية والمحاسبية</div></div></div>
    <div class="stats">
      <div class="stat"><div class="stat-lbl">عدد المواد المسجّلة</div><div class="stat-val">${mats.length}</div></div>
      <div class="stat ${low.length ? 'danger' : ''}"><div class="stat-lbl">مواد تحتاج إعادة طلب</div><div class="stat-val ${low.length ? 'danger' : ''}">${low.length}</div></div>
      <div class="stat"><div class="stat-lbl">استلامات اليوم</div><div class="stat-val">${todayR}</div></div>
      <div class="stat"><div class="stat-lbl">إصدارات اليوم</div><div class="stat-val">${todayI}</div></div>
    </div>
    <div class="fg2">
      <div class="card">
        <div class="card-title">آخر وثائق الاستلام</div>
        ${receipts.length ? `<div class="itw"><table><thead><tr><th>الوثيقة</th><th>التاريخ</th><th>المخزن</th><th>الإجمالي</th></tr></thead><tbody>
          ${receipts.map(r => `<tr><td><span class="doc-num">${r.doc_num}</span></td><td>${r.doc_date}</td><td>${r.warehouses?.name || ''}</td><td class="gold-txt">${fmt(r.total)}</td></tr>`).join('')}
        </tbody></table></div>` : `<div class="ec">لا توجد وثائق استلام بعد</div>`}
      </div>
      <div class="card">
        <div class="card-title">آخر وثائق الإصدار</div>
        ${issues.length ? `<div class="itw"><table><thead><tr><th>الوثيقة</th><th>التاريخ</th><th>الجهة</th><th>الإجمالي</th></tr></thead><tbody>
          ${issues.map(r => `<tr><td><span class="doc-num">${r.doc_num}</span></td><td>${r.doc_date}</td><td>${r.recipient_name}</td><td class="gold-txt">${fmt(r.total)}</td></tr>`).join('')}
        </tbody></table></div>` : `<div class="ec">لا توجد وثائق إصدار بعد</div>`}
      </div>
    </div>
    ${low.length ? `<div class="card"><div class="card-title">⚠️ تنبيهات إعادة الطلب (أدنى 5)</div>
      <div class="itw"><table><thead><tr><th>الرقم المخزني</th><th>المادة</th><th>المخزن</th><th>الرصيد</th><th>الحد الأدنى</th></tr></thead><tbody>
      ${low.slice(0,5).map(l => `<tr><td class="mono">${l.store_num}</td><td>${l.name}</td><td>${l.warehouse_name}</td><td class="chip-danger" style="padding:2px 8px;border-radius:6px">${fmtQty(l.qty_on_hand)}</td><td>${fmtQty(l.min_qty)}</td></tr>`).join('')}
      </tbody></table></div></div>` : ''}
  `;
};

// ── المخازن ──────────────────────────────
PAGE_RENDER.warehouses = async (root) => {
  const whs = await DB.listWarehouses();
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">المخازن</div><div class="ph-sub">إدارة مواقع التخزين</div></div>
      <div class="ph-actions"><button class="btn btn-p" onclick="openWhModal()">+ مخزن جديد</button></div></div>
    <div class="card"><div class="itw"><table><thead><tr><th>الرمز</th><th>الاسم</th><th>الموقع</th></tr></thead><tbody>
      ${whs.map(w => `<tr><td class="mono">${w.code}</td><td>${w.name}</td><td>${w.location || '—'}</td></tr>`).join('') || '<tr><td colspan="3" class="ec">لا توجد مخازن مسجّلة</td></tr>'}
    </tbody></table></div></div>`;
};
window.openWhModal = () => {
  showModal('مخزن جديد', `
    <div class="fgroup" style="margin-bottom:10px"><label>رمز المخزن *</label><input id="m-wh-code"></div>
    <div class="fgroup" style="margin-bottom:10px"><label>اسم المخزن *</label><input id="m-wh-name"></div>
    <div class="fgroup" style="margin-bottom:10px"><label>الموقع</label><input id="m-wh-loc"></div>
  `, async () => {
    const code = gv('m-wh-code'), name = gv('m-wh-name');
    if (!code || !name) { toast('الرمز والاسم مطلوبان', 'e'); return false; }
    const { error } = await sb.from('warehouses').insert({ code, name, location: gv('m-wh-loc') });
    if (error) { toast('خطأ: ' + error.message, 'e'); return false; }
    toast('تم إضافة المخزن', 's'); go('warehouses'); return true;
  });
};

// ── دليل المواد ──────────────────────────────
PAGE_RENDER.materials = async (root, term = '') => {
  const mats = await DB.listMaterials(term);
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">دليل المواد</div><div class="ph-sub">${mats.length} مادة</div></div>
      <div class="ph-actions">
        <input id="mat-search" placeholder="بحث بالاسم أو الرقم المخزني..." style="width:240px" value="${term}">
        <button class="btn btn-p" onclick="openMatModal()">+ مادة جديدة</button>
      </div></div>
    <div class="card"><div class="itw"><table><thead><tr><th>الرقم المخزني</th><th>الاسم</th><th>الوحدة</th><th>التصنيف</th><th>حد إعادة الطلب</th><th></th></tr></thead><tbody>
      ${mats.map(m => `<tr><td class="mono">${m.store_num}</td><td>${m.name}</td><td>${m.unit}</td><td>${m.category || '—'}</td><td>${fmtQty(m.min_qty)}</td>
        <td><button class="btn btn-o btn-sm" onclick='openMatModal(${JSON.stringify(m).replace(/'/g,"&#39;")})'>تعديل</button></td></tr>`).join('') || '<tr><td colspan="6" class="ec">لا توجد نتائج</td></tr>'}
    </tbody></table></div></div>`;
  document.getElementById('mat-search').addEventListener('input', debounce(e => PAGE_RENDER.materials(root, e.target.value), 300));
};
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

window.openMatModal = (m = null) => {
  showModal(m ? 'تعديل مادة' : 'مادة جديدة', `
    <div class="fg2" style="margin-bottom:10px">
      <div class="fgroup"><label>الرقم المخزني *</label><input id="m-mat-sn" value="${m?.store_num || ''}" ${m ? 'readonly' : ''}></div>
      <div class="fgroup"><label>الوحدة</label><input id="m-mat-unit" value="${m?.unit || 'قطعة'}"></div>
    </div>
    <div class="fgroup" style="margin-bottom:10px"><label>اسم المادة *</label><input id="m-mat-name" value="${m?.name || ''}"></div>
    <div class="fg2" style="margin-bottom:10px">
      <div class="fgroup"><label>التصنيف</label><input id="m-mat-cat" value="${m?.category || ''}"></div>
      <div class="fgroup"><label>حد إعادة الطلب</label><input type="number" step="0.001" id="m-mat-min" value="${m?.min_qty ?? 0}"></div>
    </div>
    <div class="fgroup"><label>ملاحظات</label><textarea id="m-mat-notes">${m?.notes || ''}</textarea></div>
  `, async () => {
    const store_num = gv('m-mat-sn'), name = gv('m-mat-name');
    if (!store_num || !name) { toast('الرقم المخزني والاسم مطلوبان', 'e'); return false; }
    try {
      await DB.upsertMaterial({ store_num, name, unit: gv('m-mat-unit') || 'قطعة', category: gv('m-mat-cat'), min_qty: Number(gv('m-mat-min')) || 0, notes: gv('m-mat-notes') });
      toast('تم الحفظ', 's'); go('materials'); return true;
    } catch (e) { toast('خطأ: ' + e.message, 'e'); return false; }
  });
};

// ── مكوّن عام: صفوف مواد لوثيقة استلام/إصدار ──────────────────────────────
function itemRowHTML(prefix, isReceive) {
  return `<tr>
    <td style="width:34px" class="mono row-idx"></td>
    <td style="min-width:230px"><div class="ac-wrap">
      <input class="mat-search" placeholder="ابحث بالرقم المخزني أو الاسم...">
      <div class="ac-portal"></div>
      <input type="hidden" class="mat-id">
    </div></td>
    <td style="width:70px"><span class="mat-unit">—</span></td>
    <td style="width:110px"><input type="number" step="0.001" min="0.001" class="qty-in" placeholder="0"></td>
    <td style="width:120px">${isReceive
      ? `<input type="number" step="0.0001" min="0" class="price-in" placeholder="0.00">`
      : `<span class="price-out mono" style="color:var(--gold)">0.0000</span>`}</td>
    <td style="width:120px" class="row-total mono">0.00</td>
    <td style="width:40px"><button class="btn btn-d btn-sm" onclick="this.closest('tr').remove(); recalcItems('${prefix}')">✕</button></td>
  </tr>`;
}

function addItemRow(prefix, isReceive) {
  const tbody = document.getElementById(prefix + '-items');
  tbody.insertAdjacentHTML('beforeend', itemRowHTML(prefix, isReceive));
  const row = tbody.lastElementChild;
  const searchInp = row.querySelector('.mat-search');
  const portal = row.querySelector('.ac-portal');
  const whGetter = () => gv(prefix + '-wh');

  bindAutocomplete(searchInp, portal,
    async term => term ? await DB.listMaterials(term) : [],
    async m => {
      searchInp.value = `${m.store_num} — ${m.name}`;
      row.querySelector('.mat-id').value = m.id;
      row.querySelector('.mat-unit').textContent = m.unit;
      if (!isReceive) {
        const wh = whGetter();
        if (wh) {
          const stock = await DB.stockOf(m.id, wh);
          row.querySelector('.price-out').textContent = Number(stock.avg_price).toFixed(4);
        }
      }
      recalcItems(prefix);
    },
    (m, first) => `<div class="ac-item ${first ? 'hi' : ''}"><span class="ac-code">${m.store_num}</span><span>${m.name}</span></div>`
  );
  row.querySelectorAll('.qty-in, .price-in').forEach(inp => inp.addEventListener('input', () => recalcItems(prefix)));
  renumberRows(prefix);
}
window.addItemRow = addItemRow;

function renumberRows(prefix) {
  document.querySelectorAll(`#${prefix}-items tr`).forEach((tr, i) => tr.querySelector('.row-idx').textContent = i + 1);
}

function recalcItems(prefix) {
  let grand = 0;
  document.querySelectorAll(`#${prefix}-items tr`).forEach(tr => {
    const qty = Number(tr.querySelector('.qty-in')?.value) || 0;
    const priceIn = tr.querySelector('.price-in');
    const price = priceIn ? (Number(priceIn.value) || 0) : (Number(tr.querySelector('.price-out')?.textContent) || 0);
    const total = qty * price;
    tr.querySelector('.row-total').textContent = fmt(total);
    grand += total;
  });
  renumberRows(prefix);
  const grandEl = document.getElementById(prefix + '-grand');
  if (grandEl) grandEl.textContent = fmt(grand);
}
window.recalcItems = recalcItems;

function collectItemRows(prefix) {
  const rows = [];
  document.querySelectorAll(`#${prefix}-items tr`).forEach(tr => {
    const material_id = tr.querySelector('.mat-id').value;
    const qty = Number(tr.querySelector('.qty-in').value) || 0;
    if (!material_id || qty <= 0) return;
    const priceIn = tr.querySelector('.price-in');
    const unit_price = priceIn ? (Number(priceIn.value) || 0) : 0;
    rows.push({ material_id, qty, unit_price });
  });
  return rows;
}

// ── الاستلام المخزني ──────────────────────────────
PAGE_RENDER.receive = async (root) => {
  const whs = await DB.listWarehouses();
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">📥 استلام مخزني</div><div class="ph-sub">تسجيل وارد جديد إلى المخزن — السعر من وصل الاستلام</div></div></div>
    <div class="card">
      <div class="card-title">بيانات الوثيقة</div>
      <div class="fg">
        <div class="fgroup"><label>رقم الوثيقة *</label><input id="r-docnum"></div>
        <div class="fgroup"><label>تاريخ الوثيقة *</label><input type="date" id="r-date" value="${todayISO()}"></div>
        <div class="fgroup"><label>المخزن *</label><select id="r-wh"><option value="">اختر...</option>${whs.map(w => `<option value="${w.id}">${w.code} — ${w.name}</option>`).join('')}</select></div>
        <div class="fgroup"><label>المورّد</label><input id="r-supplier"></div>
        <div class="fgroup s2"><label>مرجع أمر الشراء (رقم/تاريخ)</label><input id="r-pref"></div>
      </div>
      <div class="fgroup" style="margin-top:12px"><label>ملاحظات</label><textarea id="r-notes"></textarea></div>
    </div>
    <div class="card">
      <div class="card-title">المواد المستلَمة</div>
      <div class="itw"><table><thead><tr><th>#</th><th>المادة</th><th>الوحدة</th><th>الكمية</th><th>سعر الوصل</th><th>الإجمالي</th><th></th></tr></thead>
        <tbody id="r-items"></tbody></table></div>
      <button class="btn btn-o btn-sm" onclick="addItemRow('r', true)">+ إضافة مادة</button>
      <div class="grand-bar"><span class="grand-lbl">الإجمالي الكلي</span><span class="grand-val" id="r-grand">0.00</span></div>
      <div class="form-foot"><button class="btn btn-p" onclick="submitReceipt()">حفظ وترحيل الوثيقة</button></div>
    </div>`;
  addItemRow('r', true);
};
window.submitReceipt = async () => {
  const docnum = gv('r-docnum'), date = gv('r-date'), wh = gv('r-wh');
  if (!docnum || !date || !wh) { toast('أكمل بيانات الوثيقة (رقم/تاريخ/مخزن)', 'e'); return; }
  const items = collectItemRows('r');
  if (!items.length) { toast('أضف مادة واحدة على الأقل مع كمية وسعر', 'e'); return; }
  if (items.some(i => i.unit_price <= 0)) { toast('يجب إدخال سعر الوصل لكل مادة مستلَمة', 'e'); return; }
  try {
    await DB.createReceipt({ doc_num: docnum, doc_date: date, warehouse_id: wh, supplier: gv('r-supplier'), purchase_ref: gv('r-pref'), notes: gv('r-notes'), created_by: ME.id }, items);
    toast('✅ تم حفظ وترحيل وثيقة الاستلام', 's');
    go('docs');
  } catch (e) { toast('خطأ: ' + e.message, 'e'); }
};

// ── الإصدار المخزني ──────────────────────────────
PAGE_RENDER.issue = async (root) => {
  const whs = await DB.listWarehouses();
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">📤 إصدار مخزني</div><div class="ph-sub">السعر يُحسب تلقائياً بالمتوسط الوزني المرجّح لحظة الحفظ</div></div></div>
    <div class="card">
      <div class="card-title">بيانات الوثيقة</div>
      <div class="fg">
        <div class="fgroup"><label>رقم الوثيقة *</label><input id="i-docnum"></div>
        <div class="fgroup"><label>تاريخ الوثيقة *</label><input type="date" id="i-date" value="${todayISO()}"></div>
        <div class="fgroup"><label>المخزن *</label><select id="i-wh"><option value="">اختر...</option>${whs.map(w => `<option value="${w.id}">${w.code} — ${w.name}</option>`).join('')}</select></div>
        <div class="fgroup"><label>نوع الجهة المستلمة</label><select id="i-rtype"><option>قسم داخلي</option><option>جهة خارجية</option><option>موظف</option></select></div>
        <div class="fgroup"><label>اسم الجهة/القسم *</label><input id="i-rname"></div>
        <div class="fgroup"><label>اسم المستلم</label><input id="i-rperson"></div>
      </div>
      <div class="fgroup" style="margin-top:12px"><label>ملاحظات</label><textarea id="i-notes"></textarea></div>
    </div>
    <div class="card">
      <div class="card-title">المواد المصروفة</div>
      <div class="itw"><table><thead><tr><th>#</th><th>المادة</th><th>الوحدة</th><th>الكمية</th><th>السعر الوسطي</th><th>الإجمالي</th><th></th></tr></thead>
        <tbody id="i-items"></tbody></table></div>
      <button class="btn btn-o btn-sm" onclick="addItemRow('i', false)">+ إضافة مادة</button>
      <div class="grand-bar"><span class="grand-lbl">الإجمالي الكلي</span><span class="grand-val" id="i-grand">0.00</span></div>
      <div class="form-foot"><button class="btn btn-p" onclick="submitIssue()">حفظ وترحيل الوثيقة</button></div>
    </div>`;
  addItemRow('i', false);
};
window.submitIssue = async () => {
  const docnum = gv('i-docnum'), date = gv('i-date'), wh = gv('i-wh'), rname = gv('i-rname');
  if (!docnum || !date || !wh || !rname) { toast('أكمل بيانات الوثيقة (رقم/تاريخ/مخزن/الجهة المستلمة)', 'e'); return; }
  const items = collectItemRows('i');
  if (!items.length) { toast('أضف مادة واحدة على الأقل مع الكمية', 'e'); return; }
  // تحقق من كفاية الرصيد قبل الإرسال
  for (const it of items) {
    const stock = await DB.stockOf(it.material_id, wh);
    if (it.qty > stock.qty_on_hand) { toast('الكمية المطلوبة تتجاوز الرصيد المتاح لإحدى المواد', 'e'); return; }
  }
  try {
    await DB.createIssue({ doc_num: docnum, doc_date: date, warehouse_id: wh, recipient_type: gv('i-rtype'), recipient_name: rname, recipient_person: gv('i-rperson'), notes: gv('i-notes'), created_by: ME.id }, items);
    toast('✅ تم حفظ وترحيل وثيقة الإصدار', 's');
    go('docs');
  } catch (e) { toast('خطأ: ' + e.message, 'e'); }
};

// ── سجل الوثائق ──────────────────────────────
PAGE_RENDER.docs = async (root, tab = 'receipts') => {
  const [receipts, issues] = await Promise.all([DB.listReceipts(100), DB.listIssues(100)]);
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">سجل الوثائق</div><div class="ph-sub">جميع وثائق الاستلام والإصدار المرحّلة</div></div>
      <div class="ph-actions">
        <button class="btn ${tab === 'receipts' ? 'btn-p' : 'btn-o'} btn-sm" onclick="PAGE_RENDER.docs(document.getElementById('page-root'),'receipts')">استلام (${receipts.length})</button>
        <button class="btn ${tab === 'issues' ? 'btn-p' : 'btn-o'} btn-sm" onclick="PAGE_RENDER.docs(document.getElementById('page-root'),'issues')">إصدار (${issues.length})</button>
      </div></div>
    <div class="card"><div class="itw"><table><thead><tr>
      ${tab === 'receipts' ? '<th>الوثيقة</th><th>التاريخ</th><th>المخزن</th><th>المورّد</th><th>الإجمالي</th><th></th>'
                           : '<th>الوثيقة</th><th>التاريخ</th><th>المخزن</th><th>الجهة</th><th>الإجمالي</th><th></th>'}
    </tr></thead><tbody>
      ${(tab === 'receipts' ? receipts : issues).map(d => `<tr>
        <td><span class="doc-num">${d.doc_num}</span></td><td>${d.doc_date}</td><td>${d.warehouses?.name || ''}</td>
        <td>${tab === 'receipts' ? (d.supplier || '—') : d.recipient_name}</td><td class="gold-txt">${fmt(d.total)}</td>
        <td><button class="btn btn-o btn-sm" onclick="viewDoc('${tab}','${d.id}')">عرض/طباعة</button></td></tr>`).join('') || '<tr><td colspan="6" class="ec">لا توجد وثائق</td></tr>'}
    </tbody></table></div></div>`;
};

window.viewDoc = async (tab, id) => {
  const isR = tab === 'receipts';
  const docs = isR ? await DB.listReceipts(200) : await DB.listIssues(200);
  const doc = docs.find(d => d.id === id);
  const items = isR ? await DB.receiptItems(id) : await DB.issueItems(id);
  printDocument(doc, items, isR);
};

// ── الأرصدة والجرد ──────────────────────────────
PAGE_RENDER.balance = async (root, whId = '') => {
  const whs = await DB.listWarehouses();
  const stock = await DB.fullBalance(whId || null);
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">الأرصدة والجرد</div><div class="ph-sub">الرصيد الحالي وقيمته بالسعر الوسطي المرجّح</div></div>
      <div class="ph-actions"><select id="bal-wh" onchange="PAGE_RENDER.balance(document.getElementById('page-root'), this.value)">
        <option value="">كل المخازن</option>${whs.map(w => `<option value="${w.id}" ${w.id === whId ? 'selected' : ''}>${w.code} — ${w.name}</option>`).join('')}
      </select></div></div>
    <div class="card"><div class="itw"><table><thead><tr><th>الرقم المخزني</th><th>المادة</th><th>المخزن</th><th>الرصيد</th><th>السعر الوسطي</th><th>القيمة</th></tr></thead><tbody>
      ${stock.map(s => `<tr><td class="mono">${s.materials?.store_num || ''}</td><td>${s.materials?.name || ''}</td><td>${s.warehouses?.name || ''}</td>
        <td class="${s.qty_on_hand <= (s.materials?.min_qty||0) && s.materials?.min_qty>0 ? 'chip-danger' : ''}" style="${s.qty_on_hand <= (s.materials?.min_qty||0) && s.materials?.min_qty>0 ? 'padding:2px 8px;border-radius:6px' : ''}">${fmtQty(s.qty_on_hand)} ${s.materials?.unit||''}</td>
        <td class="mono">${fmt(s.avg_price)}</td><td class="gold-txt">${fmt(s.qty_on_hand * s.avg_price)}</td></tr>`).join('') || '<tr><td colspan="6" class="ec">لا توجد أرصدة بعد</td></tr>'}
    </tbody></table></div>
    <div class="grand-bar"><span class="grand-lbl">إجمالي قيمة المخزون</span><span class="grand-val">${fmt(stock.reduce((s,x)=>s+x.qty_on_hand*x.avg_price,0))}</span></div>
    </div>`;
};

// ── تنبيهات إعادة الطلب ──────────────────────────────
PAGE_RENDER.lowstock = async (root) => {
  const low = await DB.lowStock();
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">🔔 تنبيهات إعادة الطلب</div><div class="ph-sub">مواد وصلت أو تجاوزت الحد الأدنى المسموح</div></div></div>
    <div class="card"><div class="itw"><table><thead><tr><th>الرقم المخزني</th><th>المادة</th><th>المخزن</th><th>الرصيد الحالي</th><th>الحد الأدنى</th><th>النسبة</th></tr></thead><tbody>
      ${low.map(l => { const pct = l.min_qty > 0 ? Math.min(100, (l.qty_on_hand / l.min_qty) * 100) : 0; return `<tr>
        <td class="mono">${l.store_num}</td><td>${l.name}</td><td>${l.warehouse_name}</td>
        <td class="chip-danger" style="padding:2px 8px;border-radius:6px">${fmtQty(l.qty_on_hand)} ${l.unit}</td><td>${fmtQty(l.min_qty)}</td>
        <td style="min-width:120px"><div class="progress-bar"><div class="progress-fill danger" style="width:${pct}%"></div></div></td>
      </tr>`; }).join('') || '<tr><td colspan="6" class="ec">✅ لا توجد مواد تحت الحد الأدنى حالياً</td></tr>'}
    </tbody></table></div></div>`;
};

// ── نافذة عامة (Modal) ──────────────────────────────
function showModal(title, bodyHTML, onSave) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal"><div class="card-title">${title}</div>${bodyHTML}
    <div class="form-foot"><button class="btn btn-o btn-sm" data-x>إلغاء</button><button class="btn btn-p btn-sm" data-s>حفظ</button></div></div>`;
  document.body.appendChild(bg);
  bg.querySelector('[data-x]').onclick = () => bg.remove();
  bg.addEventListener('mousedown', e => { if (e.target === bg) bg.remove(); });
  bg.querySelector('[data-s]').onclick = async () => { const ok = await onSave(); if (ok !== false) bg.remove(); };
}
window.showModal = showModal;
