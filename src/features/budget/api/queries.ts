import { skipToken, useQuery } from '@tanstack/react-query';

import { apiClient } from '@/commons/lib';

import {
  budgetKeys,
  type Budget,
  type BudgetDailyPoint,
  type BudgetMonthReport,
  type DiscardedFoodExpenseSummary,
} from '@/entities/budget';

/**
 * @description 해당 월 예산 조회. row가 없는 scope는 "미설정"이며 진행바를 숨긴다.
 * 직전 달 예산을 가져올 때도 같은 훅을 쓴다.
 */
export function useBudgetsQuery(householdId: string | null, yearMonth: string | null) {
  return useQuery({
    queryKey: budgetKeys.list(householdId ?? '', yearMonth ?? ''),
    queryFn:
      householdId && yearMonth
        ? () => apiClient.get<Budget[]>('/api/budgets', { householdId, yearMonth })
        : skipToken,
  });
}

/**
 * @description 대상 월 + 직전 월의 일자 × 종류별 식비 합계 조회.
 * 누적 그래프와 scope별 지출 합계를 모두 이 결과에서 파생시킨다.
 */
export function useBudgetDailySeriesQuery(householdId: string | null, yearMonth: string | null) {
  return useQuery({
    queryKey: budgetKeys.dailySeries(householdId ?? '', yearMonth ?? ''),
    queryFn:
      householdId && yearMonth
        ? () =>
            apiClient.get<BudgetDailyPoint[]>('/api/budgets/daily-series', {
              householdId,
              yearMonth,
            })
        : skipToken,
  });
}

/**
 * @description 그 달(버린 날 기준)의 버린 식비. 금액을 아는 것의 합과 금액 모름 건수를 따로 받는다.
 */
export function useDiscardedFoodExpenseQuery(householdId: string | null, yearMonth: string | null) {
  return useQuery({
    queryKey: budgetKeys.discarded(householdId ?? '', yearMonth ?? ''),
    queryFn:
      householdId && yearMonth
        ? () =>
            apiClient.get<DiscardedFoodExpenseSummary>('/api/budgets/discarded', {
              householdId,
              yearMonth,
            })
        : skipToken,
  });
}

/**
 * @description 월 화면형 예산 현황의 가게별 합계와 가구원별 입력 건수 조회.
 */
export function useBudgetMonthReportQuery(householdId: string | null, yearMonth: string | null) {
  return useQuery({
    queryKey: budgetKeys.monthReport(householdId ?? '', yearMonth ?? ''),
    queryFn:
      householdId && yearMonth
        ? () =>
            apiClient.get<BudgetMonthReport>('/api/budgets/month-report', {
              householdId,
              yearMonth,
            })
        : skipToken,
  });
}
