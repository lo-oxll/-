// ══════════════════════════════════════════════════════════════════
//  الحركة المخزنية: دليل المواد، المخازن، الاستلام، الإصدار، الأرصدة
//  + الجرد الدوري + اللوحة البيانية
// ══════════════════════════════════════════════════════════════════

// ── لوحة التحكم ──────────────────────────────
PAGE_RENDER.dashboard = async (root) => {
  const [mats, low, receipts, issues, invValue] = await Promise.all([
    DB.listMaterials(), DB.lowStock(), DB.listReceipts(5), DB.listIssues(5), DB.inventoryValueTrend(),
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
      <div class="stat"><div class="stat-lbl">قيمة المخزون الحالية</div><div class="stat-val gold">${fmt(invValue)}</div></div>
    </div>

    <div class="fg2">
      <div class="card"><div class="card-title">📈 حركة المخزون الشهرية (قيمة الاستلام مقابل الإصدار)</div>
        <canvas id="chart-movement" height="230"></canvas></div>
      <div class="card"><div class="card-title">🏆 أعلى المواد استهلاكاً (بالكمية)</div>
        <canvas id="chart-top" height="230"></canvas></div>
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
  renderDashboardCharts();
};

// ── رسم اللوحة البيانية (Chart.js) ──────────────────────────────
window.__dashCharts = window.__dashCharts || [];
async function renderDashboardCharts() {
  window.__dashCharts.forEach(c => c.destroy());
  window.__dashCharts = [];
  if (typeof Chart === 'undefined') return; // تحميل المكتبة قد يكون بطيئاً بالشبكات الضعيفة

  const [movement, topMats] = await Promise.all([DB.monthlyMovementChart(6), DB.topConsumedMaterials(8)]);

  const elM = document.getElementById('chart-movement');
  if (elM) {
    window.__dashCharts.push(new Chart(elM, {
      type: 'bar',
      data: {
        labels: movement.map(m => m.month),
        datasets: [
          { label: 'استلام', data: movement.map(m => m.receipts), backgroundColor: '#3d7ab8' },
          { label: 'إصدار', data: movement.map(m => m.issues), backgroundColor: '#d4a24c' },
        ],
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom', rtl: true } }, scales: { y: { beginAtZero: true } } },
    }));
  }

  const elT = document.getElementById('chart-top');
  if (elT) {
    window.__dashCharts.push(new Chart(elT, {
      type: 'bar',
      data: {
        labels: topMats.map(m => m.name),
        datasets: [{ label: 'الكمية المصروفة', data: topMats.map(m => m.qty), backgroundColor: '#2f9e6e' }],
      },
      options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } },
    }));
  }
}

// ── المخازن ──────────────────────────────
PAGE_RENDER.warehouses = async (root) => {
  const whs = await DB.listWarehouses();
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">المخازن</div><div class="ph-sub">إدارة مواقع التخزين</div></div>
      <div class="ph-actions"><button class="btn btn-p" onclick="openWhModal()">+ مخزن جديد</button></div></div>
    <div class="card"><div class="itw"><table><thead><tr><th>الرمز</th><th>الاسم</th><th>الموقع</th><th></th></tr></thead><tbody>
      ${whs.map(w => `<tr><td class="mono">${w.code}</td><td>${w.name}</td><td>${w.location || '—'}</td>
        <td>
          <button class="btn btn-o btn-sm" onclick='openWhModal(${JSON.stringify(w).replace(/'/g,"&#39;")})'>تعديل</button>
          <button class="btn btn-d btn-sm" onclick="deleteWarehouseConfirm('${w.id}', '${(w.name||'').replace(/'/g,"\\'")}')">حذف</button>
        </td></tr>`).join('') || '<tr><td colspan="4" class="ec">لا توجد مخازن مسجّلة</td></tr>'}
    </tbody></table></div></div>`;
};
window.openWhModal = (w = null) => {
  showModal(w ? 'تعديل مخزن' : 'مخزن جديد', `
    <div class="fgroup" style="margin-bottom:10px"><label>رمز المخزن *</label><input id="m-wh-code" value="${w?.code || ''}"></div>
    <div class="fgroup" style="margin-bottom:10px"><label>اسم المخزن *</label><input id="m-wh-name" value="${w?.name || ''}"></div>
    <div class="fgroup" style="margin-bottom:10px"><label>الموقع</label><input id="m-wh-loc" value="${w?.location || ''}"></div>
  `, async () => {
    const code = gv('m-wh-code'), name = gv('m-wh-name');
    if (!code || !name) { toast('الرمز والاسم مطلوبان', 'e'); return false; }
    try {
      if (w) {
        await DB.updateWarehouse(w.id, { code, name, location: gv('m-wh-loc') });
        toast('تم تحديث بيانات المخزن', 's');
      } else {
        await DB.createWarehouse({ code, name, location: gv('m-wh-loc') });
        toast('تم إضافة المخزن', 's');
      }
      go('warehouses'); return true;
    } catch (e) { toast('خطأ: ' + e.message, 'e'); return false; }
  });
};
window.deleteWarehouseConfirm = async (id, name) => {
  if (!confirm(`متأكد تريد حذف المخزن "${name}"؟ لن يُحذف تاريخ وثائقه، لكنه سيختفي من قوائم الاختيار.`)) return;
  try {
    await DB.deleteWarehouse(id);
    toast('تم حذف المخزن', 's');
    go('warehouses');
  } catch (e) { toast('تعذر الحذف: ' + e.message, 'e'); }
};

// ── دليل المواد ──────────────────────────────
PAGE_RENDER.materials = async (root, term = '') => {
  const mats = await DB.listMaterials(term);
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">دليل المواد</div><div class="ph-sub">${mats.length} مادة</div></div>
      <div class="ph-actions">
        <input id="mat-search" placeholder="بحث بالاسم أو الرقم المخزني..." style="width:220px" value="${term}">
        <button class="btn btn-o btn-sm" onclick="exportMaterialsExcel()">⬇ تصدير إكسل</button>
        <button class="btn btn-o btn-sm" onclick="document.getElementById('mat-import-file').click()">⬆ استيراد إكسل</button>
        <input type="file" id="mat-import-file" accept=".xlsx,.xls" class="hidden" onchange="importMaterialsExcel(this.files[0])">
        <button class="btn btn-p" onclick="openMatModal()">+ مادة جديدة</button>
      </div></div>
    <div class="card"><div class="itw"><table><thead><tr><th>الرقم المخزني</th><th>الاسم</th><th>الوحدة</th><th>التصنيف</th><th>حد إعادة الطلب</th><th></th></tr></thead><tbody>
      ${mats.map(m => `<tr><td class="mono">${m.store_num}</td><td>${m.name}</td><td>${m.unit}</td><td>${m.category || '—'}</td><td>${fmtQty(m.min_qty)}</td>
        <td><button class="btn btn-o btn-sm" onclick='openMatModal(${JSON.stringify(m).replace(/'/g,"&#39;")})'>تعديل</button></td></tr>`).join('') || '<tr><td colspan="6" class="ec">لا توجد نتائج</td></tr>'}
    </tbody></table></div></div>`;
  document.getElementById('mat-search').addEventListener('input', debounce(e => PAGE_RENDER.materials(root, e.target.value), 300));
};
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// ── تصدير دليل المواد إلى إكسل ──────────────────────────────
window.exportMaterialsExcel = async () => {
  const mats = await DB.listMaterials();
  exportRowsToExcel(
    mats.map((m, i) => ({
      'م': i + 1, 'الرقم المخزني': m.store_num, 'اسم المادة': m.name,
      'الوحدة': m.unit, 'التصنيف': m.category || '', 'حد إعادة الطلب': m.min_qty, 'ملاحظات': m.notes || '',
    })),
    'دليل المواد', `دليل_المواد_${todayISO()}.xlsx`
  );
};

// ── استيراد دليل المواد من إكسل ──────────────────────────────
// الأعمدة المتوقعة (بالترتيب أو بالاسم): الرقم المخزني | اسم المادة | الوحدة | التصنيف | حد إعادة الطلب | ملاحظات
window.importMaterialsExcel = async (file) => {
  if (!file) return;
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (!rows.length) { toast('الملف فارغ', 'e'); return; }

    let ok = 0, fail = 0; const errors = [];
    for (const [i, r] of rows.entries()) {
      const store_num = String(r['الرقم المخزني'] ?? r['store_num'] ?? '').trim();
      const name = String(r['اسم المادة'] ?? r['الاسم'] ?? r['name'] ?? '').trim();
      if (!store_num || !name) { fail++; errors.push(`صف ${i + 2}: الرقم المخزني أو الاسم مفقود`); continue; }
      try {
        await DB.upsertMaterial({
          store_num, name,
          unit: String(r['الوحدة'] ?? r['unit'] ?? 'قطعة').trim() || 'قطعة',
          category: String(r['التصنيف'] ?? r['category'] ?? '').trim(),
          min_qty: Number(r['حد إعادة الطلب'] ?? r['min_qty'] ?? 0) || 0,
          notes: String(r['ملاحظات'] ?? r['notes'] ?? '').trim(),
        });
        ok++;
      } catch (e) { fail++; errors.push(`صف ${i + 2} (${store_num}): ${e.message}`); }
    }
    await DB.log('import_materials', 'materials', null, { ok, fail, total: rows.length });
    toast(`تم الاستيراد: ${ok} نجح${fail ? `، ${fail} فشل` : ''}`, fail ? 'e' : 's');
    if (errors.length) console.warn('أخطاء الاستيراد:', errors);
    document.getElementById('mat-import-file').value = '';
    go('materials');
  } catch (e) { toast('تعذر قراءة الملف: ' + e.message, 'e'); }
};

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
    async term => {
      if (!term) return [];
      const found = await DB.listMaterials(term);
      // إذا لا يوجد تطابق تام على الرقم المخزني، أضف خيار "تعريف مادة جديدة" (فقط بوثائق الاستلام)
      const exact = found.some(m => m.store_num.toLowerCase() === term.trim().toLowerCase());
      if (isReceive && !exact && term.trim().length >= 2) found.push({ __new: true, store_num: term.trim() });
      return found;
    },
    async m => {
      if (m.__new) {
        const name = prompt(`تعريف مادة جديدة بالرقم المخزني "${m.store_num}"\nأدخل اسم المادة:`);
        if (!name || !name.trim()) return;
        const unit = prompt('وحدة القياس (اختياري):', 'قطعة') || 'قطعة';
        try {
          const created = await DB.upsertMaterial({ store_num: m.store_num, name: name.trim(), unit, category: '', min_qty: 0, notes: 'أُنشئت تلقائياً من وثيقة استلام' });
          await DB.log('auto_create_material', 'materials', created.id, { store_num: m.store_num, source: 'receipt' });
          toast('تم تعريف المادة الجديدة', 's');
          m = created;
        } catch (e) { toast('تعذر إنشاء المادة: ' + e.message, 'e'); return; }
      }
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
    (m, first) => m.__new
      ? `<div class="ac-item ${first ? 'hi' : ''}" style="color:var(--ok);font-weight:700">+ تعريف مادة جديدة برقم "${m.store_num}"</div>`
      : `<div class="ac-item ${first ? 'hi' : ''}"><span class="ac-code">${m.store_num}</span><span>${m.name}</span></div>`
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

// يتحقّق من كل صف بدل حذف الصفوف الناقصة بصمت (كانت هذه مصدر مشكلة "اختفاء" مواد عند الحفظ:
// أي صف كُتبت فيه كمية/سعر لكن لم يُختر فيه المادة فعلياً من قائمة الاقتراحات كان يُهمَل من غير أي تنبيه)
function collectItemRows(prefix) {
  const rows = [];
  const problems = [];
  document.querySelectorAll(`#${prefix}-items tr`).forEach((tr, idx) => {
    const material_id = tr.querySelector('.mat-id').value;
    const searchVal = tr.querySelector('.mat-search')?.value?.trim() || '';
    const qtyRaw = tr.querySelector('.qty-in').value;
    const qty = Number(qtyRaw) || 0;
    const priceIn = tr.querySelector('.price-in');
    const priceRaw = priceIn ? priceIn.value : '';
    const unit_price = priceIn ? (Number(priceRaw) || 0) : 0;
    const rowTouched = searchVal || qtyRaw !== '' || priceRaw !== '';
    if (!rowTouched) return; // صف فاضي تماماً (لم يُلمس) — تجاهله بصمت، هذا طبيعي

    if (!material_id) {
      problems.push(`الصف ${idx + 1}: لم تختر المادة فعلياً من قائمة الاقتراحات (اكتب واضغط على النتيجة من القائمة، لا يكفي كتابة الاسم فقط)`);
      return;
    }
    if (qty <= 0) {
      problems.push(`الصف ${idx + 1} (${searchVal || material_id}): الكمية فارغة أو غير صحيحة`);
      return;
    }
    rows.push({ material_id, qty, unit_price });
  });
  return { rows, problems };
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
      <div class="fg2" style="margin-top:12px">
        <div class="fgroup"><label>ملاحظات</label><textarea id="r-notes"></textarea></div>
        <div class="fgroup"><label>📎 مرفق وصل المورّد الأصلي (صورة أو PDF)</label><input type="file" id="r-attach" accept="image/*,.pdf">
          <div style="font-size:11px;color:var(--ink3);margin-top:4px">يُحفظ بشكل آمن ويمكن الرجوع له لاحقاً من سجل الوثائق للتدقيق</div></div>
      </div>
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
  const { rows: items, problems } = collectItemRows('r');
  if (problems.length) { alert('⚠️ لا يمكن الحفظ — تحقق من الصفوف التالية:\n\n' + problems.join('\n')); return; }
  if (!items.length) { toast('أضف مادة واحدة على الأقل مع كمية وسعر', 'e'); return; }
  if (items.some(i => i.unit_price <= 0)) { toast('يجب إدخال سعر الوصل لكل مادة مستلَمة', 'e'); return; }
  const attachFile = document.getElementById('r-attach')?.files?.[0] || null;
  try {
    const rdoc = await DB.createReceipt({ doc_num: docnum, doc_date: date, warehouse_id: wh, supplier: gv('r-supplier'), purchase_ref: gv('r-pref'), notes: gv('r-notes'), created_by: ME.id }, items);
    if (attachFile) {
      try { await DB.uploadReceiptAttachment(rdoc.id, attachFile); }
      catch (e) { toast('تم حفظ الوثيقة لكن تعذر رفع المرفق: ' + e.message, 'e'); }
    }
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
        <div class="fgroup"><label>المخزن *</label><select id="i-wh" onchange="refreshIssueRowPrices()"><option value="">اختر...</option>${whs.map(w => `<option value="${w.id}">${w.code} — ${w.name}</option>`).join('')}</select></div>
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
window.refreshIssueRowPrices = async () => {
  const wh = gv('i-wh');
  if (!wh) return;
  const rows = document.querySelectorAll('#i-items tr');
  for (const tr of rows) {
    const matId = tr.querySelector('.mat-id')?.value;
    if (!matId) continue;
    const stock = await DB.stockOf(matId, wh);
    const priceOut = tr.querySelector('.price-out');
    if (priceOut) priceOut.textContent = Number(stock.avg_price).toFixed(4);
  }
  recalcItems('i');
};

window.submitIssue = async () => {
  const docnum = gv('i-docnum'), date = gv('i-date'), wh = gv('i-wh'), rname = gv('i-rname');
  if (!docnum || !date || !wh || !rname) { toast('أكمل بيانات الوثيقة (رقم/تاريخ/مخزن/الجهة المستلمة)', 'e'); return; }
  const { rows: items, problems } = collectItemRows('i');
  if (problems.length) { alert('⚠️ لا يمكن الحفظ — تحقق من الصفوف التالية:\n\n' + problems.join('\n')); return; }
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
PAGE_RENDER.docs = async (root, tab = 'receipts', fyId = '') => {
  const isArchiveMode = can('admin') && fyId;
  const fys = can('admin') ? await DB.listFiscalYears() : [];
  const [receipts, issues] = await Promise.all([DB.listReceipts(100, fyId || null), DB.listIssues(100, fyId || null)]);
  window.__docsCache = { receipts, issues };
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">سجل الوثائق</div><div class="ph-sub">${isArchiveMode ? '📦 عرض أرشيف — للقراءة فقط' : 'جميع وثائق الاستلام والإصدار المرحّلة (السنة الحالية)'}</div></div>
      <div class="ph-actions">
        ${can('admin') ? `<select onchange="PAGE_RENDER.docs(document.getElementById('page-root'),'${tab}',this.value)" style="width:170px">
          <option value="">السنة الحالية</option>
          ${fys.map(f => `<option value="${f.id}" ${f.id === fyId ? 'selected' : ''}>${f.year}${f.is_active ? ' (نشطة)' : ' (أرشيف)'}</option>`).join('')}
        </select>` : ''}
        <button class="btn ${tab === 'receipts' ? 'btn-p' : 'btn-o'} btn-sm" onclick="PAGE_RENDER.docs(document.getElementById('page-root'),'receipts','${fyId}')">استلام (${receipts.length})</button>
        <button class="btn ${tab === 'issues' ? 'btn-p' : 'btn-o'} btn-sm" onclick="PAGE_RENDER.docs(document.getElementById('page-root'),'issues','${fyId}')">إصدار (${issues.length})</button>
        <button class="btn btn-o btn-sm" onclick="exportDocsExcel('${tab}')">⬇ تصدير إكسل</button>
      </div></div>
    <div class="card"><div class="itw"><table><thead><tr>
      ${tab === 'receipts' ? '<th>الوثيقة</th><th>التاريخ</th><th>المخزن</th><th>المورّد</th><th>الإجمالي</th><th></th>'
                           : '<th>الوثيقة</th><th>التاريخ</th><th>المخزن</th><th>الجهة</th><th>الإجمالي</th><th></th>'}
    </tr></thead><tbody>
      ${(tab === 'receipts' ? receipts : issues).map(d => `<tr>
        <td><span class="doc-num">${d.doc_num}</span></td><td>${d.doc_date}</td><td>${d.warehouses?.name || ''}</td>
        <td>${tab === 'receipts' ? (d.supplier || '—') : d.recipient_name}</td><td class="gold-txt">${fmt(d.total)}</td>
        <td>
          <button class="btn btn-o btn-sm" onclick="viewDoc('${tab}','${d.id}')">عرض/طباعة</button>
          ${tab === 'receipts' && d.attachment_path ? `<button class="btn btn-o btn-sm" onclick="viewAttachment('${d.attachment_path}')">📎 المرفق</button>` : ''}
        </td></tr>`).join('') || '<tr><td colspan="6" class="ec">لا توجد وثائق</td></tr>'}
    </tbody></table></div></div>`;
};

window.exportDocsExcel = (tab) => {
  const data = window.__docsCache?.[tab] || [];
  const rows = data.map((d, i) => tab === 'receipts' ? {
    'م': i + 1, 'رقم الوثيقة': d.doc_num, 'التاريخ': d.doc_date, 'المخزن': d.warehouses?.name || '',
    'المورّد': d.supplier || '', 'مرجع الشراء': d.purchase_ref || '', 'الإجمالي': d.total, 'ملاحظات': d.notes || '',
  } : {
    'م': i + 1, 'رقم الوثيقة': d.doc_num, 'التاريخ': d.doc_date, 'المخزن': d.warehouses?.name || '',
    'الجهة المستلمة': d.recipient_name || '', 'المستلم': d.recipient_person || '', 'الإجمالي': d.total, 'ملاحظات': d.notes || '',
  });
  exportRowsToExcel(rows, tab === 'receipts' ? 'وثائق الاستلام' : 'وثائق الإصدار', `${tab === 'receipts' ? 'وثائق_الاستلام' : 'وثائق_الإصدار'}_${todayISO()}.xlsx`);
};

window.viewDoc = async (tab, id) => {
  const isR = tab === 'receipts';
  const docs = isR ? await DB.listReceipts(200) : await DB.listIssues(200);
  const doc = docs.find(d => d.id === id);
  const items = isR ? await DB.receiptItems(id) : await DB.issueItems(id);
  printDocument(doc, items, isR);
};

window.viewAttachment = async (path) => {
  try {
    const url = await DB.getAttachmentUrl(path);
    window.open(url, '_blank');
  } catch (e) { toast('تعذر فتح المرفق: ' + e.message, 'e'); }
};

// ── الأرصدة والجرد ──────────────────────────────
PAGE_RENDER.balance = async (root, whId = '') => {
  const whs = await DB.listWarehouses();
  const stock = await DB.fullBalance(whId || null);
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">الأرصدة والجرد</div><div class="ph-sub">الرصيد الحالي وقيمته بالسعر الوسطي المرجّح</div></div>
      <div class="ph-actions">
        <select id="bal-wh" onchange="PAGE_RENDER.balance(document.getElementById('page-root'), this.value)">
          <option value="">كل المخازن</option>${whs.map(w => `<option value="${w.id}" ${w.id === whId ? 'selected' : ''}>${w.code} — ${w.name}</option>`).join('')}
        </select>
        <button class="btn btn-o btn-sm" onclick="exportBalanceExcel('${whId}')">⬇ تصدير إكسل</button>
      </div></div>
    <div class="card"><div class="itw"><table><thead><tr><th>الرقم المخزني</th><th>المادة</th><th>المخزن</th><th>الرصيد</th><th>السعر الوسطي</th><th>القيمة</th></tr></thead><tbody>
      ${stock.map(s => `<tr><td class="mono">${s.materials?.store_num || ''}</td><td>${s.materials?.name || ''}</td><td>${s.warehouses?.name || ''}</td>
        <td class="${s.qty_on_hand <= (s.materials?.min_qty||0) && s.materials?.min_qty>0 ? 'chip-danger' : ''}" style="${s.qty_on_hand <= (s.materials?.min_qty||0) && s.materials?.min_qty>0 ? 'padding:2px 8px;border-radius:6px' : ''}">${fmtQty(s.qty_on_hand)} ${s.materials?.unit||''}</td>
        <td class="mono">${fmt(s.avg_price)}</td><td class="gold-txt">${fmt(s.qty_on_hand * s.avg_price)}</td></tr>`).join('') || '<tr><td colspan="6" class="ec">لا توجد أرصدة بعد</td></tr>'}
    </tbody></table></div>
    <div class="grand-bar"><span class="grand-lbl">إجمالي قيمة المخزون</span><span class="grand-val">${fmt(stock.reduce((s,x)=>s+x.qty_on_hand*x.avg_price,0))}</span></div>
    </div>`;
};
window.exportBalanceExcel = async (whId) => {
  const stock = await DB.fullBalance(whId || null);
  exportRowsToExcel(
    stock.map((s,i) => ({ 'م': i+1, 'الرقم المخزني': s.materials?.store_num||'', 'المادة': s.materials?.name||'', 'المخزن': s.warehouses?.name||'',
      'الرصيد': s.qty_on_hand, 'الوحدة': s.materials?.unit||'', 'السعر الوسطي': s.avg_price, 'القيمة': s.qty_on_hand * s.avg_price })),
    'الأرصدة والجرد', `الأرصدة_والجرد_${todayISO()}.xlsx`
  );
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

// ══════════════════════════════════════════════════════════════════
//  الجرد الدوري (Physical Count)
// ══════════════════════════════════════════════════════════════════
PAGE_RENDER.physcount = async (root, mode = 'list', countId = '') => {
  if (mode === 'new') return renderPhysCountNew(root);
  if (mode === 'view') return renderPhysCountView(root, countId);
  const counts = await DB.listPhysicalCounts();
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">🧮 الجرد الدوري</div><div class="ph-sub">جرد فعلي لمواد المخزن ومقارنته بالرصيد الدفتري + قيد تسوية تلقائي للفروقات</div></div>
      <div class="ph-actions">${can('admin','accountant','manager') ? `<button class="btn btn-p" onclick="PAGE_RENDER.physcount(document.getElementById('page-root'),'new')">+ جرد جديد</button>` : ''}</div></div>
    <div class="card"><div class="itw"><table><thead><tr><th>رقم الجرد</th><th>المخزن</th><th>التاريخ</th><th>الحالة</th><th></th></tr></thead><tbody>
      ${counts.map(c => `<tr><td class="mono">${c.count_no}</td><td>${c.warehouses?.name || ''}</td><td class="mono">${c.count_date}</td>
        <td>${c.status === 'posted' ? '<span class="chip-ok chip">مُرحَّل</span>' : '<span class="chip chip-gold">مسودة</span>'}</td>
        <td><button class="btn btn-o btn-sm" onclick="PAGE_RENDER.physcount(document.getElementById('page-root'),'view','${c.id}')">عرض</button></td></tr>`).join('') || '<tr><td colspan="5" class="ec">لا توجد عمليات جرد بعد</td></tr>'}
    </tbody></table></div></div>`;
};

async function renderPhysCountNew(root) {
  const whs = await DB.listWarehouses();
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">🧮 جرد فعلي جديد</div><div class="ph-sub">اختر المخزن ثم حمّل أرصدته الدفترية وابدأ بإدخال الكميات المعدودة فعلياً</div></div>
      <div class="ph-actions"><button class="btn btn-o btn-sm" onclick="PAGE_RENDER.physcount(document.getElementById('page-root'),'list')">↩ رجوع للقائمة</button></div></div>
    <div class="card">
      <div class="card-title">بيانات الجرد</div>
      <div class="fg">
        <div class="fgroup"><label>رقم الجرد *</label><input id="pc-no" value="PC-${Date.now().toString().slice(-8)}"></div>
        <div class="fgroup"><label>تاريخ الجرد *</label><input type="date" id="pc-date" value="${todayISO()}"></div>
        <div class="fgroup"><label>المخزن *</label><select id="pc-wh"><option value="">اختر...</option>${whs.map(w => `<option value="${w.id}">${w.code} — ${w.name}</option>`).join('')}</select></div>
      </div>
      <div class="fgroup" style="margin-top:12px"><label>ملاحظات</label><textarea id="pc-notes"></textarea></div>
      <div class="form-foot"><button class="btn btn-o" onclick="loadPhysCountMaterials()">📥 تحميل أرصدة المخزن</button></div>
    </div>
    <div id="pc-items-card"></div>
  `;
}

window.loadPhysCountMaterials = async () => {
  const whId = gv('pc-wh');
  if (!whId) { toast('اختر المخزن أولاً', 'e'); return; }
  const [mats, stock] = await Promise.all([DB.listMaterials(), DB.fullBalance(whId)]);
  const stockMap = {}; stock.forEach(s => { stockMap[s.material_id] = s; });
  const merged = mats.map(m => ({
    material_id: m.id, store_num: m.store_num, name: m.name, unit: m.unit,
    system_qty: Number(stockMap[m.id]?.qty_on_hand) || 0, unit_price: Number(stockMap[m.id]?.avg_price) || 0,
  }));
  const card = document.getElementById('pc-items-card');
  card.innerHTML = `
    <div class="card">
      <div class="card-title">مقارنة الجرد (${merged.length} مادة)</div>
      <input id="pc-filter" placeholder="فلترة بالاسم أو الرقم المخزني..." style="margin-bottom:12px;max-width:280px">
      <div class="itw"><table><thead><tr><th>الرقم المخزني</th><th>المادة</th><th>الوحدة</th><th>الرصيد الدفتري</th><th>الكمية المعدودة</th><th>الفرق</th><th>قيمة الفرق</th></tr></thead>
        <tbody id="pc-items">
          ${merged.map(m => `<tr data-mid="${m.material_id}" data-sys="${m.system_qty}" data-price="${m.unit_price}" data-name="${(m.store_num+' '+m.name).toLowerCase()}">
            <td class="mono">${m.store_num}</td><td>${m.name}</td><td>${m.unit}</td>
            <td class="mono pc-sys">${fmtQty(m.system_qty)}</td>
            <td><input type="number" step="0.001" class="pc-counted" value="${m.system_qty}" oninput="recalcPhysCountRow(this)"></td>
            <td class="mono pc-diff">0</td><td class="mono pc-diffval">0.00</td>
          </tr>`).join('')}
        </tbody></table></div>
      <div class="form-foot"><button class="btn btn-p" onclick="submitPhysCount()">💾 حفظ الجرد (كمسودة)</button></div>
    </div>`;
  document.getElementById('pc-filter').addEventListener('input', e => {
    const term = e.target.value.trim().toLowerCase();
    document.querySelectorAll('#pc-items tr').forEach(tr => { tr.style.display = tr.dataset.name.includes(term) ? '' : 'none'; });
  });
};

window.recalcPhysCountRow = (input) => {
  const tr = input.closest('tr');
  const sys = Number(tr.dataset.sys) || 0;
  const price = Number(tr.dataset.price) || 0;
  const counted = Number(input.value) || 0;
  const diff = counted - sys;
  tr.querySelector('.pc-diff').textContent = (diff > 0 ? '+' : '') + fmtQty(diff);
  tr.querySelector('.pc-diff').style.color = diff > 0 ? 'var(--ok)' : diff < 0 ? 'var(--danger)' : 'var(--ink2)';
  tr.querySelector('.pc-diffval').textContent = fmt(diff * price);
};

window.submitPhysCount = async () => {
  const count_no = gv('pc-no'), count_date = gv('pc-date'), whId = gv('pc-wh');
  if (!count_no || !count_date || !whId) { toast('أكمل بيانات الجرد', 'e'); return; }
  const items = [];
  document.querySelectorAll('#pc-items tr').forEach(tr => {
    const counted = Number(tr.querySelector('.pc-counted').value);
    if (Number.isNaN(counted)) return;
    items.push({ material_id: tr.dataset.mid, system_qty: Number(tr.dataset.sys) || 0, counted_qty: counted, unit_price: Number(tr.dataset.price) || 0 });
  });
  if (!items.length) { toast('لا توجد صفوف لحفظها', 'e'); return; }
  try {
    const active = await DB.activeFiscalYear();
    const pc = await DB.createPhysicalCount({ count_no, count_date, warehouse_id: whId, fiscal_year_id: active?.id || null, notes: gv('pc-notes'), created_by: ME.id }, items);
    toast('✅ تم حفظ الجرد كمسودة — راجعه ثم رحّله', 's');
    PAGE_RENDER.physcount(document.getElementById('page-root'), 'view', pc.id);
  } catch (e) { toast('خطأ: ' + e.message, 'e'); }
};

async function renderPhysCountView(root, countId) {
  const [counts, items] = await Promise.all([DB.listPhysicalCounts(), DB.countItems(countId)]);
  const c = counts.find(x => x.id === countId);
  if (!c) { root.innerHTML = '<div class="card ec">لم يتم العثور على الجرد</div>'; return; }
  const changed = items.filter(it => Number(it.counted_qty) !== Number(it.system_qty));
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">🧮 جرد ${c.count_no}</div><div class="ph-sub">${c.warehouses?.name || ''} — ${c.count_date} — ${c.status === 'posted' ? 'مُرحَّل' : 'مسودة'}</div></div>
      <div class="ph-actions">
        <button class="btn btn-o btn-sm" onclick="PAGE_RENDER.physcount(document.getElementById('page-root'),'list')">↩ رجوع للقائمة</button>
        <button class="btn btn-o btn-sm" onclick="exportPhysCountExcel('${countId}')">⬇ تصدير إكسل</button>
        ${c.status !== 'posted' && can('admin','accountant') ? `<button class="btn btn-p btn-sm" onclick="postPhysCountConfirm('${countId}')">🔒 ترحيل الجرد وإنشاء قيد التسوية</button>` : ''}
      </div></div>
    ${c.status !== 'posted' ? `<div class="card" style="border:1px solid var(--warn);background:rgba(212,162,76,.08)"><div style="font-size:12.5px;color:var(--ink2)">
      ⚠️ هذا الجرد بحالة مسودة ولم يُرحَّل محاسبياً بعد. عند الترحيل سيُنشأ قيد تسوية تلقائي بفروقات العجز/الزيادة، وسيُحدَّث الرصيد الفعلي للمواد بهذا المخزن. يتطلب ضبط حسابات الجرد مسبقاً من صفحة "المستخدمون والصلاحيات".</div></div>` : ''}
    <div class="card">
      <div class="card-title">تفاصيل المقارنة (${changed.length} مادة فيها فرق من أصل ${items.length})</div>
      <div class="itw"><table><thead><tr><th>الرقم المخزني</th><th>المادة</th><th>الرصيد الدفتري</th><th>الكمية المعدودة</th><th>الفرق</th><th>قيمة الفرق</th></tr></thead><tbody>
        ${items.map(it => { const diff = Number(it.counted_qty) - Number(it.system_qty); return `<tr>
          <td class="mono">${it.materials?.store_num || ''}</td><td>${it.materials?.name || ''}</td>
          <td class="mono">${fmtQty(it.system_qty)}</td><td class="mono">${fmtQty(it.counted_qty)}</td>
          <td class="mono" style="color:${diff>0?'var(--ok)':diff<0?'var(--danger)':'var(--ink2)'}">${diff>0?'+':''}${fmtQty(diff)}</td>
          <td class="mono">${fmt(diff * it.unit_price)}</td></tr>`; }).join('') || '<tr><td colspan="6" class="ec">لا توجد بيانات</td></tr>'}
      </tbody></table></div>
    </div>`;
}
window.exportPhysCountExcel = async (countId) => {
  const items = await DB.countItems(countId);
  exportRowsToExcel(
    items.map((it,i) => ({ 'م': i+1, 'الرقم المخزني': it.materials?.store_num||'', 'المادة': it.materials?.name||'',
      'الرصيد الدفتري': it.system_qty, 'الكمية المعدودة': it.counted_qty, 'الفرق': Number(it.counted_qty)-Number(it.system_qty),
      'السعر': it.unit_price, 'قيمة الفرق': (Number(it.counted_qty)-Number(it.system_qty))*it.unit_price })),
    'الجرد الدوري', `الجرد_الدوري_${todayISO()}.xlsx`
  );
};
window.postPhysCountConfirm = async (countId) => {
  if (!confirm('سيتم ترحيل الجرد وإنشاء قيد تسوية محاسبي بفروقات العجز/الزيادة، وتحديث الرصيد الفعلي للمواد. هذا الإجراء لا يمكن التراجع عنه. متابعة؟')) return;
  try {
    await DB.postPhysicalCount(countId);
    toast('✅ تم ترحيل الجرد وإنشاء قيد التسوية', 's');
    PAGE_RENDER.physcount(document.getElementById('page-root'), 'view', countId);
  } catch (e) { toast('تعذر الترحيل: ' + e.message, 'e'); }
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
