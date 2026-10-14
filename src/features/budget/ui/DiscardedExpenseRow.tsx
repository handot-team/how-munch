'use client';

import { Trash2 } from 'lucide-react';

import { useDiscardedFoodExpenseQuery } from '../api/queries';

interface DiscardedExpenseRowProps {
  householdId: string;
  /** 'YYYY-MM' */
  yearMonth: string;
}

/**
 * 꼬리표형 예산 현황의 버린 식비 한 줄.
 * 금액을 아는 것만 더하고, 가격을 못 읽은 줄은 0원으로 섞지 않고 '모름 N건'으로 따로 센다.
 */
export function DiscardedExpenseRow({ householdId, yearMonth }: DiscardedExpenseRowProps) {
  const { data } = useDiscardedFoodExpenseQuery(householdId, yearMonth);

  if (!data) return null;

  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between rounded-xl border border-red-100 bg-red-50/60 px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Trash2 className="size-4 text-gray-500" aria-hidden />
          버린 식비
        </span>
        <span className="text-sm font-semibold text-gray-900">
          아는 것 {data.knownAmount.toLocaleString()}원
          {data.unknownCount > 0 ? (
            <>
              {' / '}
              <span className="text-orange-500">모름 {data.unknownCount}건</span>
            </>
          ) : null}
        </span>
      </div>
      <p className="px-1 text-xs text-gray-400">
        끝 기록에서 &apos;버림&apos;으로 남긴 것만 셉니다. 금액은 장보기 금액 ÷ 산 수량이고, 가격을
        못 읽은 줄은 &apos;모름&apos;으로 따로 셉니다.
      </p>
    </section>
  );
}
