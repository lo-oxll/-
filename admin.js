// ══════════════════════════════════════════════════════════════════
//  الإدارة: المستخدمون والصلاحيات + سجل المراجعة
// ══════════════════════════════════════════════════════════════════
PAGE_RENDER.users = async (root) => {
  const { data: users, error } = await sb.from('profiles').select('*').order('created_at');
  if (error) { root.innerHTML = `<div class="card ec">تعذر جلب المستخدمين: ${error.message}</div>`; return; }
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">المستخدمون والصلاحيات</div><div class="ph-sub">إدارة أدوار المستخدمين في النظام</div></div></div>
    <div class="card"><div class="itw"><table><thead><tr><th>الاسم</th><th>الدور</th><th>الحالة</th><th></th></tr></thead><tbody>
      ${users.map(u => `<tr><td>${u.full_name}</td>
        <td><select onchange="changeRole('${u.id}', this.value)">
          ${['admin','accountant','manager','auditor'].map(r => `<option value="${r}" ${u.role===r?'selected':''}>${ROLE_LABEL[r]}</option>`).join('')}
        </select></td>
        <td>${u.is_active ? '<span class="chip-ok chip">فعّال</span>' : '<span class="chip-danger chip">موقوف</span>'}</td>
        <td><button class="btn btn-o btn-sm" onclick="toggleActive('${u.id}', ${!u.is_active})">${u.is_active?'إيقاف':'تفعيل'}</button></td>
      </tr>`).join('')}
    </tbody></table></div></div>`;
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

PAGE_RENDER.auditlog = async (root) => {
  const logs = await DB.auditLog(150);
  root.innerHTML = `
    <div class="ph"><div><div class="ph-title">🔐 سجل المراجعة</div><div class="ph-sub">سجل غير قابل للتعديل بكل العمليات الحساسة في النظام</div></div></div>
    <div class="card"><div class="itw"><table><thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>الكيان</th><th>تفاصيل</th></tr></thead><tbody>
      ${logs.map(l => `<tr><td class="mono">${new Date(l.created_at).toLocaleString('ar-IQ')}</td><td>${l.profiles?.full_name || '—'}</td>
        <td><span class="chip">${l.action}</span></td><td>${l.entity}</td><td class="mono" style="font-size:11px">${JSON.stringify(l.details||{})}</td></tr>`).join('') || '<tr><td colspan="5" class="ec">لا توجد سجلات بعد</td></tr>'}
    </tbody></table></div></div>`;
};
