-- Function: public.undo_fridge_batch_end_record
-- Source: supabase/migrations/092_add_fridge_batch_end_records.sql
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
