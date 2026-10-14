'use client';

import { Button } from '@/commons/ui';

import { useDiscardedFoodExpenseQuery } from '../api/queries';
import { formatMonthLabel, getNextYearMonth } from '../lib/budgetMonth';

interface MonthCloseCardProps {
  householdId: string;
  /** 마감한 달 'YYYY-MM' */
  yearMonth: string;
  totalBudget: number | null;
  spent: number;
  /** 다음 달 예산 편집으로 이동 */
  onOpenNextBudget: (yearMonth: string) => void;
}

/**
 * 월 화면형: 지난달을 열면 맨 위에 마감 요약을 둔다.
 * 마감 알림이 데려오는 자리라, 쓴 돈·남은 돈·버린 식비와 다음 달 예산 정하기를 한 카드에 모은다.
 */
export function MonthCloseCard({
  householdId,
  yearMonth,
  totalBudget,
  spent,
  onOpenNextBudget,
}: MonthCloseCardProps) {
  const { data: discarded } = useDiscardedFoodExpenseQuery(householdId, yearMonth);
  const monthLabel = formatMonthLabel(yearMonth);
  const nextYearMonth = getNextYearMonth(yearMonth);
  const remaining = totalBudget === null ? null : totalBudget - spent;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-semibold text-emerald-700">{monthLabel} 마감</span>
        <span className="text-base font-bold text-gray-900">
          {totalBudget === null
            ? `${spent.toLocaleString()}원 썼어요`
            : `예산 ${totalBudget.toLocaleString()}원 중 ${spent.toLocaleString()}원 썼어요`}
        </span>
      </div>
      <dl className="flex flex-col gap-1.5 text-sm">
        {remaining !== null ? (
          <div className="flex justify-between">
            <dt className="text-gray-500">{remaining < 0 ? '넘은 돈' : '남은 돈'}</dt>
            <dd className="font-semibold text-gray-900">
              {Math.abs(remaining).toLocaleString()}원
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between">
          <dt className="text-gray-500">버린 식비</dt>
          <dd className="font-semibold text-gray-900">
            아는 것 {(discarded?.knownAmount ?? 0).toLocaleString()}원
            {discarded && discarded.unknownCount > 0 ? ` / 모름 ${discarded.unknownCount}건` : ''}
          </dd>
        </div>
      </dl>
      <Button color="mono" className="w-full" onClick={() => onOpenNextBudget(nextYearMonth)}>
        {formatMonthLabel(nextYearMonth)} 예산 정하기
      </Button>
    </section>
  );
}
