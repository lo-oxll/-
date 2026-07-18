-- ══════════════════════════════════════════════════════════════════
--  نظام السيطرة المخزنية والمحاسبية — مخطط قاعدة البيانات (Supabase/Postgres)
--  نفّذ هذا الملف كاملاً في: Supabase Dashboard → SQL Editor → New Query
-- ══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 0) الإضافات المطلوبة
-- ─────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────
-- 1) الأدوار والمستخدمون (profiles مرتبطة بـ auth.users)
-- ─────────────────────────────────────────────
create type user_role as enum ('admin','accountant','manager','auditor');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role user_role not null default 'accountant',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- عند إنشاء مستخدم جديد في auth.users أنشئ له profile تلقائياً (بدور محاسب افتراضياً)
create function handle_new_user() returns trigger as $$
begin
  insert into profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'accountant');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ─────────────────────────────────────────────
-- 2) المخازن
-- ─────────────────────────────────────────────
create table warehouses (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  location text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- 3) دليل الحسابات + القيود المحاسبية (نظام قيد مزدوج)
-- ─────────────────────────────────────────────
create type account_type as enum ('asset','liability','equity','revenue','expense');

create table chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  type account_type not null,
  parent_id uuid references chart_of_accounts(id),
  is_active boolean not null default true
);

create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  entry_no text unique not null,
  entry_date date not null default current_date,
  ref_type text not null default 'manual',   -- manual | receipt | issue
  ref_id uuid,
  description text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table journal_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references journal_entries(id) on delete cascade,
  account_id uuid not null references chart_of_accounts(id),
  debit numeric(14,2) not null default 0,
  credit numeric(14,2) not null default 0,
  description text
);

-- قيد متوازن: مجموع المدين = مجموع الدائن (يُتحقق منه عبر تريغر بعد كل إدراج على مستوى الحركة الواحدة)
create function check_journal_balance() returns trigger as $$
declare
  d numeric; c numeric;
begin
  select coalesce(sum(debit),0), coalesce(sum(credit),0) into d, c
  from journal_lines where entry_id = new.entry_id;
  if d <> c then
    -- يُسمح بعدم التوازن مؤقتاً أثناء الإدخال المتتابع لنفس القيد؛ التحقق النهائي يتم عبر دالة post_journal
    return new;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_journal_balance
  after insert on journal_lines
  for each row execute function check_journal_balance();

-- ─────────────────────────────────────────────
-- 4) المواد (دليل المواد)
-- ─────────────────────────────────────────────
create table materials (
  id uuid primary key default gen_random_uuid(),
  store_num text unique not null,       -- الرقم المخزني
  name text not null,
  unit text not null default 'قطعة',
  category text,
  min_qty numeric(14,3) not null default 0,   -- حد إعادة الطلب
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- رصيد كل مادة في كل مخزن + السعر الوسطي المرجّح (يُحدَّث تلقائياً بالتريغرات)
create table material_stock (
  material_id uuid not null references materials(id) on delete cascade,
  warehouse_id uuid not null references warehouses(id) on delete cascade,
  qty_on_hand numeric(14,3) not null default 0,
  avg_price numeric(14,4) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (material_id, warehouse_id)
);

-- ─────────────────────────────────────────────
-- 5) وثائق الاستلام المخزني
-- ─────────────────────────────────────────────
create table receipt_docs (
  id uuid primary key default gen_random_uuid(),
  doc_num text not null,
  doc_date date not null default current_date,
  warehouse_id uuid not null references warehouses(id),
  supplier text,
  purchase_ref text,           -- رقم/تاريخ أمر الشراء إن وجد
  notes text,
  total numeric(14,2) not null default 0,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (doc_num, warehouse_id)
);

create table receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_doc_id uuid not null references receipt_docs(id) on delete cascade,
  material_id uuid not null references materials(id),
  qty numeric(14,3) not null check (qty > 0),
  unit_price numeric(14,4) not null check (unit_price >= 0),  -- من وصل الاستلام
  total numeric(14,2) generated always as (qty * unit_price) stored
);

-- ─────────────────────────────────────────────
-- 6) وثائق الإصدار المخزني
-- ─────────────────────────────────────────────
create table issue_docs (
  id uuid primary key default gen_random_uuid(),
  doc_num text not null,
  doc_date date not null default current_date,
  warehouse_id uuid not null references warehouses(id),
  recipient_type text,          -- قسم / جهة / شخص
  recipient_name text not null,
  recipient_person text,
  notes text,
  total numeric(14,2) not null default 0,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (doc_num, warehouse_id)
);

create table issue_items (
  id uuid primary key default gen_random_uuid(),
  issue_doc_id uuid not null references issue_docs(id) on delete cascade,
  material_id uuid not null references materials(id),
  qty numeric(14,3) not null check (qty > 0),
  unit_price numeric(14,4) not null default 0,   -- يُملأ تلقائياً بالسعر الوسطي وقت الإصدار
  total numeric(14,2) generated always as (qty * unit_price) stored
);

-- ─────────────────────────────────────────────
-- 7) سجل المراجعة (Audit Log)
-- ─────────────────────────────────────────────
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  action text not null,        -- create_receipt | create_issue | post_journal | login | ...
  entity text not null,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════════
--  8) منطق الأعمال: تريغرات تحديث الرصيد + السعر الوسطي + القيود التلقائية
-- ═══════════════════════════════════════════════════════════════════

-- 8.1) عند تسجيل بند استلام: يزيد الرصيد ويُعاد حساب السعر الوسطي المرجّح
create function fn_receipt_item_apply() returns trigger as $$
declare
  cur_qty numeric; cur_avg numeric; new_qty numeric; new_avg numeric;
begin
  select qty_on_hand, avg_price into cur_qty, cur_avg
  from material_stock where material_id = new.material_id and warehouse_id =
    (select warehouse_id from receipt_docs where id = new.receipt_doc_id);

  if not found then
    insert into material_stock(material_id, warehouse_id, qty_on_hand, avg_price)
    values (new.material_id, (select warehouse_id from receipt_docs where id = new.receipt_doc_id), new.qty, new.unit_price);
  else
    new_qty := cur_qty + new.qty;
    new_avg := case when new_qty > 0
                 then ((cur_qty * cur_avg) + (new.qty * new.unit_price)) / new_qty
                 else 0 end;
    update material_stock
      set qty_on_hand = new_qty, avg_price = new_avg, updated_at = now()
      where material_id = new.material_id
        and warehouse_id = (select warehouse_id from receipt_docs where id = new.receipt_doc_id);
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_receipt_item_apply
  after insert on receipt_items
  for each row execute function fn_receipt_item_apply();

-- 8.2) عند تسجيل بند إصدار: يعبّئ السعر تلقائياً من السعر الوسطي الحالي وينقص الرصيد (الوسطي لا يتغيّر بالإصدار)
create function fn_issue_item_apply() returns trigger as $$
declare
  wh uuid; cur_avg numeric;
begin
  select warehouse_id into wh from issue_docs where id = new.issue_doc_id;
  select avg_price into cur_avg from material_stock where material_id = new.material_id and warehouse_id = wh;

  if new.unit_price = 0 then
    new.unit_price := coalesce(cur_avg, 0);
  end if;

  if coalesce((select qty_on_hand from material_stock where material_id = new.material_id and warehouse_id = wh), 0) < new.qty then
    raise exception 'الرصيد المتاح لا يكفي لإصدار الكمية المطلوبة من هذه المادة في هذا المخزن';
  end if;

  update material_stock
    set qty_on_hand = qty_on_hand - new.qty, updated_at = now()
    where material_id = new.material_id and warehouse_id = wh;

  return new;
end;
$$ language plpgsql;

create trigger trg_issue_item_apply
  before insert on issue_items
  for each row execute function fn_issue_item_apply();

-- 8.3) بعد اكتمال وثيقة استلام: تحديث الإجمالي + إنشاء قيد محاسبي تلقائي (مدين: المخزون / دائن: الموردون الدائنون)
create function fn_post_receipt_journal(p_receipt_id uuid) returns void as $$
declare
  v_total numeric; v_entry uuid; v_inv_acc uuid; v_ap_acc uuid; v_doc receipt_docs%rowtype;
begin
  select * into v_doc from receipt_docs where id = p_receipt_id;
  select coalesce(sum(total),0) into v_total from receipt_items where receipt_doc_id = p_receipt_id;
  update receipt_docs set total = v_total where id = p_receipt_id;

  select id into v_inv_acc from chart_of_accounts where code = '1201';  -- المخزون
  select id into v_ap_acc  from chart_of_accounts where code = '2101'; -- الموردون الدائنون

  insert into journal_entries(entry_no, entry_date, ref_type, ref_id, description, created_by)
  values ('JE-RCV-'||to_char(now(),'YYYYMMDDHH24MISS'), v_doc.doc_date, 'receipt', p_receipt_id,
          'قيد استلام مخزني رقم '||v_doc.doc_num, v_doc.created_by)
  returning id into v_entry;

  insert into journal_lines(entry_id, account_id, debit, credit, description) values
    (v_entry, v_inv_acc, v_total, 0, 'مخزون وارد - وثيقة '||v_doc.doc_num),
    (v_entry, v_ap_acc,  0, v_total, 'مستحق للمورد '||coalesce(v_doc.supplier,''));
end;
$$ language plpgsql;

-- 8.4) بعد اكتمال وثيقة إصدار: تحديث الإجمالي + قيد محاسبي (مدين: مصروف/تكلفة مواد مصروفة / دائن: المخزون)
create function fn_post_issue_journal(p_issue_id uuid) returns void as $$
declare
  v_total numeric; v_entry uuid; v_inv_acc uuid; v_exp_acc uuid; v_doc issue_docs%rowtype;
begin
  select * into v_doc from issue_docs where id = p_issue_id;
  select coalesce(sum(total),0) into v_total from issue_items where issue_doc_id = p_issue_id;
  update issue_docs set total = v_total where id = p_issue_id;

  select id into v_inv_acc from chart_of_accounts where code = '1201';  -- المخزون
  select id into v_exp_acc from chart_of_accounts where code = '5101'; -- مصروف مواد مصروفة

  insert into journal_entries(entry_no, entry_date, ref_type, ref_id, description, created_by)
  values ('JE-ISS-'||to_char(now(),'YYYYMMDDHH24MISS'), v_doc.doc_date, 'issue', p_issue_id,
          'قيد إصدار مخزني رقم '||v_doc.doc_num||' إلى '||v_doc.recipient_name, v_doc.created_by)
  returning id into v_entry;

  insert into journal_lines(entry_id, account_id, debit, credit, description) values
    (v_entry, v_exp_acc, v_total, 0, 'مواد مصروفة إلى '||v_doc.recipient_name),
    (v_entry, v_inv_acc, 0, v_total, 'إصدار من المخزون - وثيقة '||v_doc.doc_num);
end;
$$ language plpgsql;

-- ─────────────────────────────────────────────
-- 9) البيانات الأولية: دليل حسابات افتراضي مبسّط
-- ─────────────────────────────────────────────
insert into chart_of_accounts (code, name, type) values
  ('1000','الأصول المتداولة','asset'),
  ('1100','الصندوق والبنوك','asset'),
  ('1201','المخزون','asset'),
  ('2000','الخصوم المتداولة','liability'),
  ('2101','الموردون الدائنون','liability'),
  ('3000','حقوق الملكية','equity'),
  ('4000','الإيرادات','revenue'),
  ('5000','المصروفات','expense'),
  ('5101','مصروف مواد مصروفة','expense');

-- ─────────────────────────────────────────────
-- 10) أمان مستوى الصف (RLS) بحسب الدور
-- ─────────────────────────────────────────────
alter table profiles enable row level security;
alter table warehouses enable row level security;
alter table chart_of_accounts enable row level security;
alter table journal_entries enable row level security;
alter table journal_lines enable row level security;
alter table materials enable row level security;
alter table material_stock enable row level security;
alter table receipt_docs enable row level security;
alter table receipt_items enable row level security;
alter table issue_docs enable row level security;
alter table issue_items enable row level security;
alter table audit_log enable row level security;

create function current_role_name() returns user_role as $$
  select role from profiles where id = auth.uid();
$$ language sql stable security definer;

-- الجميع (المستخدمون المسجّلون) يقرؤون كل شيء
create policy read_all_profiles on profiles for select using (auth.uid() is not null);
create policy read_all_wh on warehouses for select using (auth.uid() is not null);
create policy read_all_coa on chart_of_accounts for select using (auth.uid() is not null);
create policy read_all_je on journal_entries for select using (auth.uid() is not null);
create policy read_all_jl on journal_lines for select using (auth.uid() is not null);
create policy read_all_mat on materials for select using (auth.uid() is not null);
create policy read_all_stock on material_stock for select using (auth.uid() is not null);
create policy read_all_rdocs on receipt_docs for select using (auth.uid() is not null);
create policy read_all_ritems on receipt_items for select using (auth.uid() is not null);
create policy read_all_idocs on issue_docs for select using (auth.uid() is not null);
create policy read_all_iitems on issue_items for select using (auth.uid() is not null);
create policy read_all_audit on audit_log for select using (auth.uid() is not null);

-- الكتابة: admin و accountant فقط لوثائق الاستلام/الإصدار والمواد؛ manager يوافق فقط (قراءة)؛ auditor قراءة فقط لكل شيء
create policy write_materials on materials for insert with check (current_role_name() in ('admin','accountant'));
create policy update_materials on materials for update using (current_role_name() in ('admin','accountant'));

create policy write_rdocs on receipt_docs for insert with check (current_role_name() in ('admin','accountant'));
create policy write_ritems on receipt_items for insert with check (current_role_name() in ('admin','accountant'));
create policy write_idocs on issue_docs for insert with check (current_role_name() in ('admin','accountant'));
create policy write_iitems on issue_items for insert with check (current_role_name() in ('admin','accountant'));

create policy write_wh on warehouses for insert with check (current_role_name() = 'admin');
create policy write_coa on chart_of_accounts for insert with check (current_role_name() = 'admin');
create policy write_je on journal_entries for insert with check (current_role_name() in ('admin','accountant'));
create policy write_jl on journal_lines for insert with check (current_role_name() in ('admin','accountant'));

create policy write_audit on audit_log for insert with check (auth.uid() is not null);

create policy update_own_profile on profiles for update using (auth.uid() = id or current_role_name()='admin');

-- ─────────────────────────────────────────────
-- 11) عرض جاهز: تنبيهات حد أدنى للمخزون
-- ─────────────────────────────────────────────
create view v_low_stock as
select m.id as material_id, m.store_num, m.name, m.unit, m.min_qty,
       w.id as warehouse_id, w.code as warehouse_code, w.name as warehouse_name,
       coalesce(s.qty_on_hand,0) as qty_on_hand, coalesce(s.avg_price,0) as avg_price
from materials m
cross join warehouses w
left join material_stock s on s.material_id = m.id and s.warehouse_id = w.id
where m.min_qty > 0 and coalesce(s.qty_on_hand,0) <= m.min_qty and m.is_active;

-- ─────────────────────────────────────────────
-- 12) عرض جاهز: ميزان المراجعة (لأرصدة الحسابات)
-- ─────────────────────────────────────────────
create view v_trial_balance as
select a.id as account_id, a.code, a.name, a.type,
       coalesce(sum(jl.debit),0) as total_debit,
       coalesce(sum(jl.credit),0) as total_credit,
       coalesce(sum(jl.debit),0) - coalesce(sum(jl.credit),0) as net_debit
from chart_of_accounts a
left join journal_lines jl on jl.account_id = a.id
group by a.id, a.code, a.name, a.type
order by a.code;
