-- Function: public.get_discarded_food_expense_summary
-- Source: supabase/migrations/092_add_fridge_batch_end_records.sql
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
