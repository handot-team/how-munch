'use client';

import { ProgressBar } from '@/commons/ui';

import { useBudgetMonthReportQuery } from '../api/queries';

interface MonthReportSectionsProps {
  householdId: string;
  /** 'YYYY-MM' */
  yearMonth: string;
}

/**
 * 월 화면형: 가게별 합계와 가구원별 입력 건수.
 * 가구원별로는 금액을 보이지 않는다. 결제자 칸이 없어 입력한 사람이 낸 사람이 아니다.
 */
export function MonthReportSections({ householdId, yearMonth }: MonthReportSectionsProps) {
  const { data } = useBudgetMonthReportQuery(householdId, yearMonth);

  if (!data || data.stores.length === 0) return null;

  const maxAmount = Math.max(...data.stores.map((store) => store.amount), 1);

  return (
    <>
      <section className="flex flex-col gap-2">
        <h3 className="px-1 text-sm font-semibold text-gray-900">가게별 합계</h3>
        <ul className="flex flex-col gap-3 rounded-xl border bg-white px-4 py-4">
          {data.stores.map((store) => (
            <li key={store.label} className="flex items-center gap-3">
              <span className="w-20 shrink-0 truncate text-sm text-gray-600">{store.label}</span>
              <ProgressBar value={store.amount} max={maxAmount} className="h-1.5 flex-1" />
              <span className="w-24 shrink-0 text-right text-sm font-semibold text-gray-900">
                {store.amount.toLocaleString()}원
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="flex items-baseline gap-2 px-1 text-sm font-semibold text-gray-900">
          가구원별 입력
          <span className="text-xs font-normal text-gray-400">금액이 아닌 입력 건수</span>
        </h3>
        <div className="rounded-xl border bg-white px-4 py-3 text-sm text-gray-800">
          {data.members.map((member) => `${member.nickname} ${member.count}건`).join(' · ')}
        </div>
        <p className="px-1 text-xs text-gray-400">
          입력한 사람이 낸 사람은 아니어서 가구원별 금액은 보이지 않아요.
        </p>
      </section>
    </>
  );
}
