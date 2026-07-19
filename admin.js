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
  const { error } = await sb.from('profiles').update({ role }).eq('id', id);
  if (error) { toast('خطأ: ' + error.message, 'e'); return; }
  await DB.log('change_role', 'profiles', id, { role });
  toast('تم تحديث الدور', 's');
};
window.toggleActive = async (id, val) => {
  const { error } = await sb.from('profiles').update({ is_active: val }).eq('id', id);
  if (error) { toast('خطأ: ' + error.message, 'e'); return; }
  await DB.log(val ? 'activate_user' : 'deactivate_user', 'profiles', id, {});
  go('users');
};

// ── إعدادات حسابات فروقات الجرد الدوري (تُستخدم عند ترحيل قيد الجرد) ──────────────────────────────
async function renderCountSettingsCard() {
  const accs = await DB.chartOfAccounts();
  const opts = (selected) => `<option value="">— اختر حساب —</option>` + accs.map(a => `<option value="${a.id}" ${a.id===selected?'selected':''}>${a.code} — ${a.name}</option>`).join('');
  const [inv, short, surplus, cashbox, salExp, salPay] = await Promise.all([
    DB.getSetting('inventory_account_id'), DB.getSetting('inventory_shortage_account_id'), DB.getSetting('inventory_surplus_account_id'),
    DB.getSetting('cashbox_account_id'), DB.getSetting('salary_expense_account_id'), DB.getSetting('salary_payment_account_id'),
  ]);
  return `
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

PAGE_RENDER.auditlog = async (root) => {
  if (!can('admin','manager','central_accountant')) { root.innerHTML = '<div class="card ec">لا تملك صلاحية الوصول لهذه الصفحة</div>'; return; }
  const logs = await DB.auditLog(150);
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">🔐 سجل المراجعة</div><div class="ph-sub">سجل غير قابل للتعديل بكل العمليات الحساسة في النظام</div></div>
      <div class="ph-actions"><button class="btn btn-o btn-sm" onclick="exportAuditLogExcel()">⬇ تصدير إكسل</button></div></div>
    <div class="card"><div class="itw"><table><thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>الكيان</th><th>تفاصيل</th></tr></thead><tbody>
      ${logs.map(l => `<tr><td class="mono">${new Date(l.created_at).toLocaleString('ar-IQ')}</td><td>${l.profiles?.full_name || '—'}</td>
        <td><span class="chip">${l.action}</span></td><td>${l.entity}</td><td class="mono" style="font-size:11px">${JSON.stringify(l.details||{})}</td></tr>`).join('') || '<tr><td colspan="5" class="ec">لا توجد سجلات بعد</td></tr>'}
    </tbody></table></div></div>`;
};
window.exportAuditLogExcel = async () => {
  const logs = await DB.auditLog(2000);
  exportRowsToExcel(
    logs.map((l,i) => ({ 'م': i+1, 'الوقت': new Date(l.created_at).toLocaleString('ar-IQ'), 'المستخدم': l.profiles?.full_name || '—', 'العملية': l.action, 'الكيان': l.entity, 'تفاصيل': JSON.stringify(l.details||{}) })),
    'سجل المراجعة', `سجل_المراجعة_${todayISO()}.xlsx`
  );
};
