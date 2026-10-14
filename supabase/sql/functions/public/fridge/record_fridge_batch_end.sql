-- Function: public.record_fridge_batch_end
-- Source: supabase/migrations/092_add_fridge_batch_end_records.sql
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
