'use client';

import { AppScreen } from '@stackflow/plugin-basic-ui';

import { Button, EmptyState } from '@/commons/ui';

import {
  BUDGET_ITEM_SCOPES,
  hasAnyBudget,
  toBudgetAmountMap,
  type BudgetAmountMap,
} from '@/entities/budget';

import { useBudgetDailySeriesQuery, useBudgetsQuery } from '../api/queries';
import { formatMonthLabel, getPreviousYearMonth, resolveSeriesDayLimit } from '../lib/budgetMonth';
import { buildCumulativeSeries, getDayCount, sumSpentByScope } from '../lib/budgetSeries';

import { BudgetCumulativeChart } from './BudgetCumulativeChart';
import { BudgetScopeRow } from './BudgetScopeRow';
import { BudgetUnsetRow } from './BudgetUnsetRow';
import { DiscardedExpenseRow } from './DiscardedExpenseRow';
import { WeeklyStats } from './WeeklyStats';

interface BudgetScreenProps {
  onClose: () => void;
  onOpenEdit: () => void;
  householdId: string;
  /** 'YYYY-MM' — 식비 페이지가 보고 있던 달을 그대로 이어받는다 */
  yearMonth: string;
}

export function BudgetScreen({ onOpenEdit, householdId, yearMonth }: BudgetScreenProps) {
  const previousYearMonth = getPreviousYearMonth(yearMonth);
  const { data: budgets = [] } = useBudgetsQuery(householdId, yearMonth);
  const { data: series = [], isLoading } = useBudgetDailySeriesQuery(householdId, yearMonth);

  const amounts: BudgetAmountMap = toBudgetAmountMap(budgets);
  const spent = sumSpentByScope(series, yearMonth);
  const dayCount = getDayCount(yearMonth);
  const currentSeries = buildCumulativeSeries(
    series,
    yearMonth,
    resolveSeriesDayLimit(yearMonth, dayCount),
  );
  const previousSeries = buildCumulativeSeries(series, previousYearMonth);
  const monthLabel = formatMonthLabel(yearMonth);
  // 전체 예산은 나머지 세 항목의 기준이라 목록에 섞지 않고 맨 위에서 단독으로 보여준다.
  const totalRemaining = amounts.total === null ? null : amounts.total - spent.total;
  // 예산을 정한 항목만 진행바로 보여주고, 나머지는 맨 아래 한 줄로 묶는다.
  const setScopes = BUDGET_ITEM_SCOPES.filter((scope) => amounts[scope] !== null);
  const unsetScopes = BUDGET_ITEM_SCOPES.filter((scope) => amounts[scope] === null);
  const unsetSpent = unsetScopes.reduce((sum, scope) => sum + spent[scope], 0);
  const hasBudget = hasAnyBudget(amounts);

  return (
    <AppScreen
      className="pointer-events-auto"
      appBar={{
        title: `${monthLabel} 예산 현황`,
      }}
    >
      <div className="flex flex-col gap-4 px-4 pt-4 pb-8">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <span className="text-sm text-gray-400">불러오는 중...</span>
          </div>
        ) : (
          <>
            {totalRemaining !== null && (
              <section className="flex flex-col gap-0.5 px-1">
                <span className="text-sm text-gray-500">{monthLabel} 예산</span>
                <span
                  className={`text-2xl font-bold ${
                    totalRemaining < 0 ? 'text-red-500' : 'text-gray-900'
                  }`}
                >
                  {totalRemaining < 0
                    ? `${Math.abs(totalRemaining).toLocaleString()}원 초과했어요`
                    : `${totalRemaining.toLocaleString()}원 남았어요`}
                </span>
              </section>
            )}

            <section className="rounded-xl border bg-white px-3 py-4">
              <BudgetCumulativeChart
                currentSeries={currentSeries}
                previousSeries={previousSeries}
                dayCount={dayCount}
                previousDayCount={getDayCount(previousYearMonth)}
                budgetAmount={amounts.total}
                currentLabel={monthLabel}
                previousLabel={formatMonthLabel(previousYearMonth)}
              />
            </section>

            <WeeklyStats series={series} yearMonth={yearMonth} />

            <DiscardedExpenseRow householdId={householdId} yearMonth={yearMonth} />

            {hasBudget ? (
              <section className="divide-y rounded-xl border bg-white px-4 py-2">
                {setScopes.map((scope) => (
                  <BudgetScopeRow
                    key={scope}
                    scope={scope}
                    spent={spent[scope]}
                    amount={amounts[scope]!}
                  />
                ))}
                {unsetScopes.length > 0 && (
                  <BudgetUnsetRow scopes={unsetScopes} spent={unsetSpent} />
                )}
              </section>
            ) : (
              <EmptyState.Root>
                <EmptyState.Content>
                  <EmptyState.Title>{monthLabel} 예산이 없어요</EmptyState.Title>
                  <EmptyState.Description>
                    예산을 설정하면 이번 달 지출을 목표와 비교할 수 있어요
                  </EmptyState.Description>
                  <Button className="mt-3" onClick={onOpenEdit}>
                    예산 설정하기
                  </Button>
                </EmptyState.Content>
              </EmptyState.Root>
            )}

            {hasBudget && (
              <Button variant="outline" color="mono" className="w-full" onClick={onOpenEdit}>
                예산 수정하기
              </Button>
            )}
          </>
        )}
      </div>
    </AppScreen>
  );
}
