// ══════════════════════════════════════════════════════════════════
//  المصادقة: تسجيل الدخول / إنشاء حساب / تسجيل الخروج
// ══════════════════════════════════════════════════════════════════
function showLogin() {
  document.getElementById('app-shell').classList.add('hidden');
  document.getElementById('pending-screen')?.classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
}
window.showLogin = showLogin;

window.doLogin = async () => {
  const email = gv('l-email'), pass = gv('l-pass');
  const errEl = document.getElementById('login-err');
  errEl.textContent = '';
  if (!email || !pass) { errEl.textContent = 'الرجاء إدخال البريد وكلمة المرور'; return; }
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) { errEl.textContent = 'بيانات الدخول غير صحيحة'; return; }
  await DB.log('login', 'auth', null, { email });
  location.reload();
};

window.doSignup = async () => {
  const name = gv('s-name'), email = gv('s-email'), pass = gv('s-pass'), pass2 = gv('s-pass2');
  const errEl = document.getElementById('signup-err');
  errEl.textContent = '';
  if (!name || !email || !pass) { errEl.textContent = 'يرجى تعبئة جميع الحقول'; return; }
  if (pass !== pass2) { errEl.textContent = 'كلمتا المرور غير متطابقتين'; return; }
  if (pass.length < 6) { errEl.textContent = 'كلمة المرور يجب أن لا تقل عن 6 أحرف'; return; }
  const { error } = await sb.auth.signUp({ email, password: pass, options: { data: { full_name: name } } });
  if (error) { errEl.textContent = 'تعذر إنشاء الحساب: ' + error.message; return; }
  toast('تم إنشاء الحساب — بانتظار تفعيل الصلاحيات من قبل مدير النظام', 's');
  window.showAuthPane('login');
};

window.doLogout = async () => {
  await DB.log('logout', 'auth', null, {});
  await sb.auth.signOut();
  location.reload();
};

window.showAuthPane = (which) => {
  document.getElementById('pane-login').classList.toggle('hidden', which !== 'login');
  document.getElementById('pane-signup').classList.toggle('hidden', which !== 'signup');
};
