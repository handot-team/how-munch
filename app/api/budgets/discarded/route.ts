import { type NextRequest } from 'next/server';

import { respondWithDbError, withAuth } from '@/apps/route';

import { apiResponse } from '@/commons/lib/http/apiResponse';

import { type DiscardedFoodExpenseSummary } from '@/entities/budget';

const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * GET /api/budgets/discarded?householdId=&yearMonth=
 * 그 달(버린 날 기준)의 버린 식비. 금액을 아는 것의 합과 금액 모름 건수를 나눠 준다.
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

  const { data, error } = await supabase.rpc('get_discarded_food_expense_summary', {
    p_household_id: householdId,
    p_year_month: yearMonth,
  });

  if (error) return respondWithDbError(error, 'GET /api/budgets/discarded', 'badRequest');

  const row = data?.[0];
  const summary: DiscardedFoodExpenseSummary = {
    knownAmount: Number(row?.known_amount ?? 0),
    unknownCount: Number(row?.unknown_count ?? 0),
  };

  return apiResponse.OK(summary);
});
