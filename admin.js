// ══════════════════════════════════════════════════════════════════
//  الإدارة: المستخدمون والصلاحيات + سجل المراجعة + إعدادات النظام
// ══════════════════════════════════════════════════════════════════
PAGE_RENDER.users = async (root) => {
  const { data: users, error } = await sb.from('profiles').select('*').order('created_at');
  if (error) { root.innerHTML = `<div class="card ec">تعذر جلب المستخدمين: ${error.message}</div>`; return; }
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">المستخدمون والصلاحيات</div><div class="ph-sub">إدارة أدوار المستخدمين في النظام</div></div></div>
    <div class="card"><div class="itw"><table><thead><tr><th>الاسم</th><th>الدور</th><th>الحالة</th><th></th></tr></thead><tbody>
      ${users.map(u => `<tr><td>${u.full_name}</td>
        <td><select onchange="changeRole('${u.id}', this.value)">
          ${['admin','accountant','central_accountant','manager','auditor'].map(r => `<option value="${r}" ${u.role===r?'selected':''}>${ROLE_LABEL[r]}</option>`).join('')}
        </select></td>
        <td>${u.is_active ? '<span class="chip-ok chip">فعّال</span>' : '<span class="chip-danger chip">موقوف</span>'}</td>
        <td><button class="btn btn-o btn-sm" onclick="toggleActive('${u.id}', ${!u.is_active})">${u.is_active?'إيقاف':'تفعيل'}</button></td>
      </tr>`).join('')}
    </tbody></table></div></div>

    ${can('admin') ? await renderCountSettingsCard() : ''}
  `;
  if (can('admin')) bindCountSettingsHandlers();
};
window.changeRole = async (id, role) => {
  // تدقيق قبل/بعد: نجلب الدور القديم أولاً حتى يُسجَّل بسجل المراجعة مع الدور الجديد
  const { data: before } = await sb.from('profiles').select('role').eq('id', id).maybeSingle();
  const { error } = await sb.from('profiles').update({ role }).eq('id', id);
  if (error) { toast('خطأ: ' + error.message, 'e'); return; }
  await DB.log('change_role', 'profiles', id, { old_value: { role: before?.role || null }, new_value: { role } });
  toast('تم تحديث الدور', 's');
};
window.toggleActive = async (id, val) => {
  const { data: before } = await sb.from('profiles').select('is_active').eq('id', id).maybeSingle();
  const { error } = await sb.from('profiles').update({ is_active: val }).eq('id', id);
  if (error) { toast('خطأ: ' + error.message, 'e'); return; }
  await DB.log(val ? 'activate_user' : 'deactivate_user', 'profiles', id, { old_value: { is_active: before?.is_active ?? null }, new_value: { is_active: val } });
  go('users');
};

// ── إعدادات حسابات فروقات الجرد الدوري (تُستخدم عند ترحيل قيد الجرد) ──────────────────────────────
async function renderCountSettingsCard() {
  const accs = await DB.chartOfAccounts();
  const opts = (selected) => `<option value="">— اختر حساب —</option>` + accs.map(a => `<option value="${a.id}" ${a.id===selected?'selected':''}>${a.code} — ${a.name}</option>`).join('');
  const [inv, short, surplus, cashbox, salExp, salPay, printOrg, printLogo, printHeader, printFooter] = await Promise.all([
    DB.getSetting('inventory_account_id'), DB.getSetting('inventory_shortage_account_id'), DB.getSetting('inventory_surplus_account_id'),
    DB.getSetting('cashbox_account_id'), DB.getSetting('salary_expense_account_id'), DB.getSetting('salary_payment_account_id'),
    DB.getSetting('print_org_name'), DB.getSetting('print_logo_url'), DB.getSetting('print_header_note'), DB.getSetting('print_footer_note'),
  ]);
  return `
    <div class="card" style="border:1px dashed var(--border)">
      <div class="card-title">🖨 قالب الطباعة (شعار المؤسسة + رأس/تذييل)</div>
      <div style="font-size:12px;color:var(--ink3);margin-bottom:14px">يظهر هذا بكل مستند مطبوع (وثائق الاستلام/الإصدار والتقارير المالية). اترك الحقول فارغة لاستخدام القيم الافتراضية.</div>
      <div class="fg2" style="margin-bottom:10px">
        <div class="fgroup"><label>اسم المؤسسة بالطباعة</label><input id="cs-print-org" value="${printOrg || ''}" placeholder="${window.APP_CONFIG.APP_NAME}"></div>
        <div class="fgroup"><label>رابط شعار المؤسسة (اختياري)</label><input id="cs-print-logo" value="${printLogo || ''}" placeholder="https://... أو data:image/..."></div>
      </div>
      <div class="fg2" style="margin-bottom:10px">
        <div class="fgroup"><label>ملاحظة برأس المستند</label><input id="cs-print-header" value="${printHeader || ''}"></div>
        <div class="fgroup"><label>ملاحظة بتذييل المستند</label><input id="cs-print-footer" value="${printFooter || ''}"></div>
      </div>
      <button class="btn btn-p btn-sm" id="cs-save3">💾 حفظ قالب الطباعة</button>
      <div id="cs-msg3" style="margin-top:8px;font-size:12px"></div>
    </div>
    <div class="card" style="border:1px dashed var(--border)">
      <div class="card-title">⚙️ إعدادات الجرد الدوري — حسابات فروقات الجرد</div>
      <div style="font-size:12px;color:var(--ink3);margin-bottom:14px">تُستخدم هذه الحسابات تلقائياً عند ترحيل قيد تسوية أي جرد فعلي (عجز/زيادة). يجب ضبطها مرة واحدة قبل أول عملية ترحيل جرد.</div>
      <div class="fg" style="margin-bottom:10px">
        <div class="fgroup"><label>حساب المخزون (أصل)</label><select id="cs-inv">${opts(inv)}</select></div>
        <div class="fgroup"><label>حساب عجز الجرد (مصروف)</label><select id="cs-short">${opts(short)}</select></div>
        <div class="fgroup"><label>حساب زيادة الجرد (إيراد)</label><select id="cs-surplus">${opts(surplus)}</select></div>
      </div>
      <button class="btn btn-p btn-sm" id="cs-save">💾 حفظ إعدادات الجرد</button>
      <div id="cs-msg" style="margin-top:8px;font-size:12px"></div>
    </div>

    <div class="card" style="border:1px dashed var(--border)">
      <div class="card-title">⚙️ إعدادات صندوق المركز والرواتب</div>
      <div style="font-size:12px;color:var(--ink3);margin-bottom:14px">تُستخدم عند تسجيل حركات الصندوق وترحيل قيود الرواتب. اضبطها مرة واحدة قبل استخدام صفحتي "صندوق المركز" و"الرواتب".</div>
      <div class="fg" style="margin-bottom:10px">
        <div class="fgroup"><label>حساب الصندوق/النقدية</label><select id="cs-cashbox">${opts(cashbox)}</select></div>
        <div class="fgroup"><label>حساب مصروف الرواتب</label><select id="cs-salexp">${opts(salExp)}</select></div>
        <div class="fgroup"><label>حساب دفع الرواتب (نقدية/بنك)</label><select id="cs-salpay">${opts(salPay)}</select></div>
      </div>
      <button class="btn btn-p btn-sm" id="cs-save2">💾 حفظ إعدادات الخزينة والرواتب</button>
      <div id="cs-msg2" style="margin-top:8px;font-size:12px"></div>
    </div>`;
}
function bindCountSettingsHandlers() {
  const btn3 = document.getElementById('cs-save3');
  if (btn3) btn3.onclick = async () => {
    try {
      await Promise.all([
        DB.setSetting('print_org_name', gv('cs-print-org')),
        DB.setSetting('print_logo_url', gv('cs-print-logo')),
        DB.setSetting('print_header_note', gv('cs-print-header')),
        DB.setSetting('print_footer_note', gv('cs-print-footer')),
      ]);
      document.getElementById('cs-msg3').innerHTML = '<span style="color:var(--ok)">✓ تم حفظ قالب الطباعة</span>';
      toast('تم حفظ قالب الطباعة', 's');
    } catch (e) { toast('خطأ: ' + e.message, 'e'); }
  };
  const btn = document.getElementById('cs-save');
  if (btn) btn.onclick = async () => {
    const inv = gv('cs-inv'), short = gv('cs-short'), surplus = gv('cs-surplus');
    if (!inv || !short || !surplus) { toast('اختر الحسابات الثلاثة قبل الحفظ', 'e'); return; }
    try {
      await Promise.all([
        DB.setSetting('inventory_account_id', inv),
        DB.setSetting('inventory_shortage_account_id', short),
        DB.setSetting('inventory_surplus_account_id', surplus),
      ]);
      document.getElementById('cs-msg').innerHTML = '<span style="color:var(--ok)">✓ تم حفظ إعدادات الجرد</span>';
      toast('تم حفظ إعدادات الجرد', 's');
    } catch (e) { toast('خطأ: ' + e.message, 'e'); }
  };
  const btn2 = document.getElementById('cs-save2');
  if (btn2) btn2.onclick = async () => {
    const cashbox = gv('cs-cashbox'), salExp = gv('cs-salexp'), salPay = gv('cs-salpay');
    if (!cashbox || !salExp || !salPay) { toast('اختر الحسابات الثلاثة قبل الحفظ', 'e'); return; }
    try {
      await Promise.all([
        DB.setSetting('cashbox_account_id', cashbox),
        DB.setSetting('salary_expense_account_id', salExp),
        DB.setSetting('salary_payment_account_id', salPay),
      ]);
      document.getElementById('cs-msg2').innerHTML = '<span style="color:var(--ok)">✓ تم حفظ إعدادات الخزينة والرواتب</span>';
      toast('تم حفظ إعدادات الخزينة والرواتب', 's');
    } catch (e) { toast('خطأ: ' + e.message, 'e'); }
  };
}

const AUDIT_PAGE_SIZE = 100;
PAGE_RENDER.auditlog = async (root, pageSize = AUDIT_PAGE_SIZE) => {
  if (!can('admin','manager','central_accountant')) { root.innerHTML = '<div class="card ec">لا تملك صلاحية الوصول لهذه الصفحة</div>'; return; }
  const logs = await DB.auditLog(pageSize);
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">🔐 سجل المراجعة</div><div class="ph-sub">سجل غير قابل للتعديل بكل العمليات الحساسة في النظام — عرض ${logs.length} من أصل ${logs.total}</div></div>
      <div class="ph-actions"><button class="btn btn-o btn-sm" onclick="exportAuditLogExcel()">⬇ تصدير إكسل</button></div></div>
    <div class="card"><div class="itw"><table><thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>الكيان</th><th>تفاصيل (قديم → جديد)</th></tr></thead><tbody>
      ${logs.map(l => `<tr><td class="mono">${new Date(l.created_at).toLocaleString('ar-IQ')}</td><td>${l.profiles?.full_name || '—'}</td>
        <td><span class="chip">${l.action}</span></td><td>${l.entity}</td><td class="mono" style="font-size:11px">${renderAuditDetails(l.details)}</td></tr>`).join('') || '<tr><td colspan="5" class="ec">لا توجد سجلات بعد</td></tr>'}
    </tbody></table></div>
    ${logs.length < logs.total ? `<div style="text-align:center;padding:12px"><button class="btn btn-o btn-sm" onclick="PAGE_RENDER.auditlog(document.getElementById('page-root'), ${pageSize + AUDIT_PAGE_SIZE})">تحميل المزيد (${logs.total - logs.length} متبقٍ)</button></div>` : ''}
    </div>`;
};
// عرض تفاصيل التدقيق بشكل قديم→جديد إن وُجدت، وإلا JSON كما هي (توافقاً مع سجلات أقدم قبل إضافة old_value/new_value)
function renderAuditDetails(details) {
  const d = details || {};
  if (d.old_value || d.new_value) return `${JSON.stringify(d.old_value || {})} → ${JSON.stringify(d.new_value || {})}`;
  return JSON.stringify(d);
}
window.exportAuditLogExcel = async () => {
  const logs = await DB.auditLog(2000);
  exportRowsToExcel(
    logs.map((l,i) => ({ 'م': i+1, 'الوقت': new Date(l.created_at).toLocaleString('ar-IQ'), 'المستخدم': l.profiles?.full_name || '—', 'العملية': l.action, 'الكيان': l.entity, 'تفاصيل': JSON.stringify(l.details||{}) })),
    'سجل المراجعة', `سجل_المراجعة_${todayISO()}.xlsx`
  );
};
