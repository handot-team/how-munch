import { type NextRequest } from 'next/server';

import { respondWithDbError, withAuth } from '@/apps/route';

import { apiResponse } from '@/commons/lib/http/apiResponse';

import { type BudgetMonthReport } from '@/entities/budget';

const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
/** 외식비는 가게가 여럿이라 한 줄로 묶는다 */
const DINING_STORE_LABEL = '식당·배달';
const UNKNOWN_STORE_LABEL = '가게 모름';

/**
 * @description 'YYYY-MM'의 첫날과 마지막 날을 구한다.
 */
function resolveMonthRange(yearMonth: string) {
  const [year, month] = yearMonth.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    startDate: `${yearMonth}-01`,
    endDate: `${yearMonth}-${String(lastDay).padStart(2, '0')}`,
  };
}

/**
 * GET /api/budgets/month-report?householdId=&yearMonth=
 * 월 화면형 예산 현황의 가게별 합계와 가구원별 입력 건수.
 * 가구원별로는 금액을 내지 않는다. 결제자 칸이 없어 입력한 사람이 낸 사람이 아니다.
 */
export const GET = withAuth(async (req: NextRequest, { supabase }) => {
  const { searchParams } = req.nextUrl;
  const householdId = searchParams.get('householdId');
  const yearMonth = searchParams.get('yearMonth');

  if (!householdId || !yearMonth) {
    return apiResponse.BAD_REQUEST('CMN_002', 'householdId, yearMonth가 필요합니다.');
  }
  if (!YEAR_MONTH_PATTERN.test(yearMonth)) {
    return apiResponse.BAD_REQUEST('BUD_002', '예산 연월 형식이 올바르지 않습니다.');
  }

  const { startDate, endDate } = resolveMonthRange(yearMonth);

  const [expenseResult, memberResult] = await Promise.all([
    supabase
      .from('v_food_expenses')
      .select('kind, store, price, user_id')
      .eq('household_id', householdId)
      .gte('date', startDate)
      .lte('date', endDate),
    supabase.from('household_members').select('user_id').eq('household_id', householdId),
  ]);

  if (expenseResult.error) return respondWithDbError(expenseResult.error, 'GET month-report');
  if (memberResult.error) return respondWithDbError(memberResult.error, 'GET month-report');

  const memberIds = (memberResult.data ?? []).map((row) => row.user_id);
  const { data: profiles, error: profileError } = memberIds.length
    ? await supabase.from('profiles').select('user_id, nickname').in('user_id', memberIds)
    : { data: [] as { user_id: string; nickname: string }[], error: null };

  if (profileError) return respondWithDbError(profileError, 'GET month-report');

  const amountByStore = new Map<string, number>();
  const countByUser = new Map<string, number>();
  for (const expense of expenseResult.data ?? []) {
    const store =
      expense.kind === 'grocery' ? (expense.store ?? UNKNOWN_STORE_LABEL) : DINING_STORE_LABEL;
    amountByStore.set(store, (amountByStore.get(store) ?? 0) + Number(expense.price));
    if (expense.user_id) {
      countByUser.set(expense.user_id, (countByUser.get(expense.user_id) ?? 0) + 1);
    }
  }

  const nicknameByUser = new Map((profiles ?? []).map((row) => [row.user_id, row.nickname]));

  const report: BudgetMonthReport = {
    stores: [...amountByStore.entries()]
      .map(([label, amount]) => ({ label, amount }))
      // 식당·배달은 장보기 가게들 뒤에 둔다
      .sort(
        (a, b) =>
          Number(a.label === DINING_STORE_LABEL) - Number(b.label === DINING_STORE_LABEL) ||
          b.amount - a.amount,
      ),
    members: memberIds
      .map((userId) => ({
        userId,
        nickname: nicknameByUser.get(userId) ?? '가구원',
        count: countByUser.get(userId) ?? 0,
      }))
      .sort((a, b) => b.count - a.count),
  };

  return apiResponse.OK(report);
});
