-- 냉장고 구매분 끝 기록(다 먹음/버림)
-- 카드를 밀면 재료 전체를 소진·삭제하는 것밖에 없어, 구매분 하나에서 일부만 먹거나 버린 것을 남길 길이 없었다.
-- 끝 기록은 구매분 수량을 줄이고, 버린 시점의 금액(모르면 null)을 함께 남겨 마감한 달 숫자가 나중에 안 바뀌게 한다.

create table if not exists public.fridge_batch_end_records (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  fridge_item_id uuid not null references public.fridge_items(id) on delete cascade,
  batch_id uuid not null references public.fridge_item_batches(id) on delete cascade,
  kind text not null check (kind in ('eaten', 'discarded')),
  amount numeric not null check (amount > 0),
  -- 끝낸 양의 금액(원) = 연결된 장보기 금액 ÷ 산 수량 × amount. 장보기 연결이 없거나 금액 0원이면 null(모름).
  price_amount integer,
  -- 집계 기준일(한국 날짜). 버린 식비는 버린 날의 달에 센다.
  ended_on date not null default (now() at time zone 'Asia/Seoul')::date,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  undone_at timestamptz
);

create index if not exists idx_fridge_batch_end_records_batch
  on public.fridge_batch_end_records (batch_id)
  where undone_at is null;

create index if not exists idx_fridge_batch_end_records_household_month
  on public.fridge_batch_end_records (household_id, ended_on)
  where undone_at is null;

alter table public.fridge_batch_end_records enable row level security;

-- 쓰기는 RPC(security definer)로만 한다.
create policy "fridge_batch_end_records_select_household_members"
  on public.fridge_batch_end_records
  for select
  using (public.is_household_member(household_id));

-- Function: public.record_fridge_batch_end
-- 역할: 냉장고 구매분 하나의 일부나 전부를 다 먹음/버림으로 끝낸다.
-- 동작:
-- 1. 구매분·재료 존재와 가구원 권한을 확인한다.
-- 2. 종류(eaten/discarded)와 양(0 < amount <= 남은 양)을 확인한다.
-- 3. 연결된 장보기 금액으로 끝낸 양의 금액을 계산한다(모르면 null).
-- 4. 구매분 수량을 줄이고 재료 총량을 다시 계산한 뒤 끝 기록을 남긴다.
create or replace function public.record_fridge_batch_end(
  p_batch_id uuid,
  p_kind text,
  p_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fridge_item_id uuid;
  v_household_id uuid;
  v_quantity numeric;
  v_price integer;
  v_count numeric;
  v_price_amount integer;
  v_record_id uuid;
begin
  select b.fridge_item_id, f.household_id, b.quantity
    into v_fridge_item_id, v_household_id, v_quantity
  from public.fridge_item_batches b
  join public.fridge_items f on f.id = b.fridge_item_id
  where b.id = p_batch_id
    and b.deleted_at is null
    and f.deleted_at is null
  for update of b;

  if v_fridge_item_id is null then
    raise exception using
      errcode = 'F0005',
      message = '재고 배치를 찾을 수 없습니다.',
      hint = 'FRIDGE_BATCH_NOT_FOUND';
  end if;

  if not public.is_household_member(v_household_id) then
    raise exception using
      errcode = 'A0002',
      message = '권한이 없습니다.',
      hint = 'COMMON_PERMISSION_DENIED';
  end if;

  if p_kind not in ('eaten', 'discarded') or p_amount is null or p_amount <= 0 or p_amount > v_quantity then
    raise exception using
      errcode = 'F0006',
      message = '유효하지 않은 수량입니다.',
      hint = 'FRIDGE_INVALID_QUANTITY';
  end if;

  select i.price, i.count
    into v_price, v_count
  from public.ingredients i
  where i.linked_fridge_batch_id = p_batch_id
    and i.deleted_at is null
  order by i.created_at asc
  limit 1;

  if v_price is not null and v_price > 0 and v_count is not null and v_count > 0 then
    v_price_amount := round(v_price * p_amount / v_count);
  end if;

  update public.fridge_item_batches
  set quantity = quantity - p_amount,
      updated_at = now()
  where id = p_batch_id;

  perform public.refresh_fridge_item_total_count(v_fridge_item_id);

  insert into public.fridge_batch_end_records (
    household_id, fridge_item_id, batch_id, kind, amount, price_amount, created_by
  )
  values (
    v_household_id, v_fridge_item_id, p_batch_id, p_kind, p_amount, v_price_amount, auth.uid()
  )
  returning id into v_record_id;

  return v_record_id;
end;
$$;

-- Function: public.undo_fridge_batch_end_record
-- 역할: 끝 기록 하나를 되돌린다.
-- 동작:
-- 1. 되돌리지 않은 기록인지, 가구원인지 확인한다.
-- 2. 구매분 수량에 끝낸 양을 다시 더하고 재료 총량을 다시 계산한다.
-- 3. 기록에 되돌린 시각을 남긴다(지우지 않는다).
create or replace function public.undo_fridge_batch_end_record(p_record_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record public.fridge_batch_end_records%rowtype;
begin
  select *
    into v_record
  from public.fridge_batch_end_records r
  where r.id = p_record_id
    and r.undone_at is null
  for update;

  if v_record.id is null then
    raise exception using
      errcode = 'F0008',
      message = '끝 기록을 찾을 수 없습니다.',
      hint = 'FRIDGE_END_RECORD_NOT_FOUND';
  end if;

  if not public.is_household_member(v_record.household_id) then
    raise exception using
      errcode = 'A0002',
      message = '권한이 없습니다.',
      hint = 'COMMON_PERMISSION_DENIED';
  end if;

  update public.fridge_item_batches
  set quantity = quantity + v_record.amount,
      updated_at = now()
  where id = v_record.batch_id;

  perform public.refresh_fridge_item_total_count(v_record.fridge_item_id);

  update public.fridge_batch_end_records
  set undone_at = now()
  where id = p_record_id;
end;
$$;

-- Function: public.get_discarded_food_expense_summary
-- 역할: 한 달의 버린 식비를 "아는 금액 / 모름 건수"로 돌려준다.
-- 동작:
-- 1. 가구원 권한과 연월 형식을 확인한다.
-- 2. 그 달(버린 날 기준)에 되돌리지 않은 '버림' 기록의 금액 합과 금액 모름 건수를 센다.
create or replace function public.get_discarded_food_expense_summary(
  p_household_id uuid,
  p_year_month text
)
returns table (
  known_amount bigint,
  unknown_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_household_member(p_household_id) then
    raise exception '가구 구성원만 조회할 수 있습니다'
      using errcode = 'A0002', hint = 'COMMON_PERMISSION_DENIED';
  end if;

  if p_year_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception '예산 연월 형식이 올바르지 않습니다'
      using errcode = 'B0002', hint = 'BUDGET_YEAR_MONTH_INVALID';
  end if;

  return query
  select
    coalesce(sum(r.price_amount), 0)::bigint as known_amount,
    count(*) filter (where r.price_amount is null)::integer as unknown_count
  from public.fridge_batch_end_records r
  where r.household_id = p_household_id
    and r.kind = 'discarded'
    and r.undone_at is null
    and to_char(r.ended_on, 'YYYY-MM') = p_year_month;
end;
$$;
