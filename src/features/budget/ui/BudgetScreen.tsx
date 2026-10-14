'use client';

import { useState } from 'react';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AppScreen } from '@stackflow/plugin-basic-ui';

import { Button, EmptyState } from '@/commons/ui';

import {
  BUDGET_ITEM_SCOPES,
  hasAnyBudget,
  toBudgetAmountMap,
  type BudgetAmountMap,
} from '@/entities/budget';

import { useBudgetDailySeriesQuery, useBudgetsQuery } from '../api/queries';
import {
  formatMonthLabel,
  getNextYearMonth,
  getPreviousYearMonth,
  resolveMonthPosition,
  resolveSeriesDayLimit,
} from '../lib/budgetMonth';
import { buildCumulativeSeries, getDayCount, sumSpentByScope } from '../lib/budgetSeries';

import { BudgetCumulativeChart } from './BudgetCumulativeChart';
import { BudgetScopeRow } from './BudgetScopeRow';
import { BudgetUnsetRow } from './BudgetUnsetRow';
import { DiscardedExpenseCards } from './DiscardedExpenseCards';
import { MonthCloseCard } from './MonthCloseCard';
import { MonthReportSections } from './MonthReportSections';
import { WeeklyStats } from './WeeklyStats';

interface BudgetScreenProps {
  onClose: () => void;
  /** 그 달 예산 편집으로 이동 */
  onOpenEdit: (yearMonth: string) => void;
  householdId: string;
  /** 'YYYY-MM' — 처음 보여 줄 달. 식비 페이지가 보던 달이나 마감 알림의 달이다 */
  yearMonth: string;
}

/** 월 화면형: 예산 현황을 가구 월 화면으로 키운다. 화면 안에서 달을 넘기고, 지난달은 마감 카드로 시작한다. */
export function BudgetScreen({
  onOpenEdit,
  householdId,
  yearMonth: initialYearMonth,
}: BudgetScreenProps) {
  const [yearMonth, setYearMonth] = useState(initialYearMonth);
  const isPastMonth = resolveMonthPosition(yearMonth) === 'past';

  function showPreviousMonth() {
    setYearMonth(getPreviousYearMonth(yearMonth));
  }

  function showNextMonth() {
    setYearMonth(getNextYearMonth(yearMonth));
  }

  function openEditForMonth() {
    onOpenEdit(yearMonth);
  }

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
        <section className="flex items-center justify-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={showPreviousMonth} aria-label="이전 달">
            <ChevronLeft className="size-4" />
          </Button>
          <h2 className="text-base font-bold">
            {yearMonth.slice(0, 4)}년 {monthLabel}
          </h2>
          <Button variant="ghost" size="icon-sm" onClick={showNextMonth} aria-label="다음 달">
            <ChevronRight className="size-4" />
          </Button>
        </section>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <span className="text-sm text-gray-400">불러오는 중...</span>
          </div>
        ) : (
          <>
            {isPastMonth ? (
              <MonthCloseCard
                householdId={householdId}
                yearMonth={yearMonth}
                totalBudget={amounts.total}
                spent={spent.total}
                onOpenNextBudget={onOpenEdit}
              />
            ) : null}

            {!isPastMonth && totalRemaining !== null && (
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

            <DiscardedExpenseCards householdId={householdId} yearMonth={yearMonth} />

            <MonthReportSections householdId={householdId} yearMonth={yearMonth} />

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
                  <Button className="mt-3" onClick={openEditForMonth}>
                    예산 설정하기
                  </Button>
                </EmptyState.Content>
              </EmptyState.Root>
            )}

            {hasBudget && (
              <Button variant="outline" color="mono" className="w-full" onClick={openEditForMonth}>
                예산 수정하기
              </Button>
            )}
          </>
        )}
      </div>
    </AppScreen>
  );
}
