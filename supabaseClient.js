// ══════════════════════════════════════════════════════════════════
//  عميل Supabase الموحّد + دوال الوصول للبيانات (Data Access Layer)
// ══════════════════════════════════════════════════════════════════
const { createClient } = supabase;
const sb = createClient(window.APP_CONFIG.SUPABASE_URL, window.APP_CONFIG.SUPABASE_ANON_KEY);

const DB = {
  // ── جلسة وملف المستخدم ─────────────────────────────
  async currentSession() {
    const { data } = await sb.auth.getSession();
    return data.session;
  },
  async currentProfile() {
    const session = await this.currentSession();
    if (!session) return null;
    const { data, error } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
    if (error) { console.error(error); return null; }
    return data;
  },

  // ── مخازن ─────────────────────────────
  async listWarehouses() {
    const { data, error } = await sb.from('warehouses').select('*').eq('is_active', true).order('code');
    if (error) throw error; return data;
  },

  // ── دليل المواد ─────────────────────────────
  async listMaterials(term = '') {
    let q = sb.from('materials').select('*').eq('is_active', true).order('store_num');
    if (term) q = q.or(`name.ilike.%${term}%,store_num.ilike.%${term}%`);
    const { data, error } = await q; if (error) throw error; return data;
  },
  async upsertMaterial(m) {
    const { data, error } = await sb.from('materials').upsert(m, { onConflict: 'store_num' }).select().single();
    if (error) throw error; return data;
  },

  // ── الأرصدة والسعر الوسطي ─────────────────────────────
  async stockOf(materialId, warehouseId) {
    const { data, error } = await sb.from('material_stock').select('*')
      .eq('material_id', materialId).eq('warehouse_id', warehouseId).maybeSingle();
    if (error) throw error; return data || { qty_on_hand: 0, avg_price: 0 };
  },
  async lowStock() {
    const { data, error } = await sb.from('v_low_stock').select('*').order('store_num');
    if (error) throw error; return data;
  },
  async fullBalance(warehouseId = null) {
    let q = sb.from('material_stock').select('*, materials(store_num,name,unit,min_qty), warehouses(code,name)');
    if (warehouseId) q = q.eq('warehouse_id', warehouseId);
    const { data, error } = await q; if (error) throw error; return data;
  },

  // ── وثائق الاستلام ─────────────────────────────
  async createReceipt(doc, items) {
    const { data: rdoc, error: e1 } = await sb.from('receipt_docs').insert(doc).select().single();
    if (e1) throw e1;
    const rows = items.map(it => ({ ...it, receipt_doc_id: rdoc.id }));
    const { error: e2 } = await sb.from('receipt_items').insert(rows);
    if (e2) throw e2;
    const { error: e3 } = await sb.rpc('fn_post_receipt_journal', { p_receipt_id: rdoc.id });
    if (e3) throw e3;
    await this.log('create_receipt', 'receipt_docs', rdoc.id, { doc_num: doc.doc_num, items: items.length });
    return rdoc;
  },
  async listReceipts(limit = 50, fiscalYearId = null) {
    let q = sb.from('receipt_docs').select('*, warehouses(code,name)').order('created_at', { ascending: false }).limit(limit);
    if (fiscalYearId) q = q.eq('fiscal_year_id', fiscalYearId);
    const { data, error } = await q;
    if (error) throw error; return data;
  },
  async receiptItems(receiptId) {
    const { data, error } = await sb.from('receipt_items').select('*, materials(store_num,name,unit)')
      .eq('receipt_doc_id', receiptId);
    if (error) throw error; return data;
  },

  // ── وثائق الإصدار ─────────────────────────────
  async createIssue(doc, items) {
    const { data: idoc, error: e1 } = await sb.from('issue_docs').insert(doc).select().single();
    if (e1) throw e1;
    const rows = items.map(it => ({ ...it, issue_doc_id: idoc.id, unit_price: 0 })); // يُملأ تلقائياً بالتريغر
    const { error: e2 } = await sb.from('issue_items').insert(rows);
    if (e2) throw e2;
    const { error: e3 } = await sb.rpc('fn_post_issue_journal', { p_issue_id: idoc.id });
    if (e3) throw e3;
    await this.log('create_issue', 'issue_docs', idoc.id, { doc_num: doc.doc_num, items: items.length });
    return idoc;
  },
  async listIssues(limit = 50, fiscalYearId = null) {
    let q = sb.from('issue_docs').select('*, warehouses(code,name)').order('created_at', { ascending: false }).limit(limit);
    if (fiscalYearId) q = q.eq('fiscal_year_id', fiscalYearId);
    const { data, error } = await q;
    if (error) throw error; return data;
  },
  async issueItems(issueId) {
    const { data, error } = await sb.from('issue_items').select('*, materials(store_num,name,unit)')
      .eq('issue_doc_id', issueId);
    if (error) throw error; return data;
  },

  // ── المحاسبة: دليل الحسابات + القيود ─────────────────────────────
  async chartOfAccounts() {
    const { data, error } = await sb.from('chart_of_accounts').select('*').order('code');
    if (error) throw error; return data;
  },
  async trialBalance() {
    const { data, error } = await sb.from('v_trial_balance').select('*');
    if (error) throw error; return data;
  },
  async journalEntries(limit = 50) {
    const { data, error } = await sb.from('journal_entries').select('*, journal_lines(*, chart_of_accounts(code,name))')
      .order('created_at', { ascending: false }).limit(limit);
    if (error) throw error; return data;
  },
  async postManualEntry(entry, lines) {
    const totalD = lines.reduce((s, l) => s + (l.debit || 0), 0);
    const totalC = lines.reduce((s, l) => s + (l.credit || 0), 0);
    if (Math.abs(totalD - totalC) > 0.001) throw new Error('القيد غير متوازن: المدين لا يساوي الدائن');
    const { data: je, error: e1 } = await sb.from('journal_entries').insert(entry).select().single();
    if (e1) throw e1;
    const rows = lines.map(l => ({ ...l, entry_id: je.id }));
    const { error: e2 } = await sb.from('journal_lines').insert(rows);
    if (e2) throw e2;
    await this.log('post_journal', 'journal_entries', je.id, { entry_no: entry.entry_no });
    return je;
  },

  // ── السنوات المالية ─────────────────────────────
  async listFiscalYears() {
    const { data, error } = await sb.from('fiscal_years').select('*').order('year', { ascending: false });
    if (error) throw error; return data;
  },
  async activeFiscalYear() {
    const { data, error } = await sb.from('fiscal_years').select('*').eq('is_active', true).maybeSingle();
    if (error) throw error; return data;
  },
  async closeFiscalYear(newYear) {
    const { data, error } = await sb.rpc('fn_close_fiscal_year', { p_new_year: newYear });
    if (error) throw error;
    await this.log('close_fiscal_year', 'fiscal_years', null, { new_year: newYear });
    return data;
  },
  async openingBalances(fiscalYearId) {
    const { data, error } = await sb.from('v_opening_balances').select('*').eq('fiscal_year_id', fiscalYearId).order('seq');
    if (error) throw error; return data;
  },

  // ── سجل المراجعة ─────────────────────────────
  async log(action, entity, entity_id, details = {}) {
    const session = await this.currentSession();
    await sb.from('audit_log').insert({ user_id: session?.user?.id, action, entity, entity_id, details });
  },
  async auditLog(limit = 100) {
    const { data, error } = await sb.from('audit_log').select('*, profiles(full_name,role)')
      .order('created_at', { ascending: false }).limit(limit);
    if (error) throw error; return data;
  },
};

window.DB = DB;
window.sb = sb;
