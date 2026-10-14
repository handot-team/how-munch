'use client';

import { useDiscardedFoodExpenseQuery } from '../api/queries';

interface DiscardedExpenseCardsProps {
  householdId: string;
  /** 'YYYY-MM' */
  yearMonth: string;
}

/**
 * 월 화면형: 버린 식비를 '금액 아는 것'과 '금액 모름' 두 칸으로 나눠 보인다.
 * 예산이 없어도 나오는 주차 통계 아래에 두어 예산 없는 가구도 닿게 한다.
 */
export function DiscardedExpenseCards({ householdId, yearMonth }: DiscardedExpenseCardsProps) {
  const { data } = useDiscardedFoodExpenseQuery(householdId, yearMonth);

  return (
    <section className="flex flex-col gap-2">
      <h3 className="px-1 text-sm font-semibold text-gray-900">버린 식비</h3>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1 rounded-xl border bg-white px-4 py-3">
          <span className="text-xs text-gray-500">금액 아는 것</span>
          <span className="text-lg font-bold text-gray-900">
            {(data?.knownAmount ?? 0).toLocaleString()}원
          </span>
        </div>
        <div className="flex flex-col gap-1 rounded-xl border bg-white px-4 py-3">
          <span className="text-xs text-gray-500">금액 모름</span>
          <span className="text-lg font-bold text-orange-500">{data?.unknownCount ?? 0}건</span>
        </div>
      </div>
      <p className="px-1 text-xs text-gray-400">
        끝 기록에서 &apos;버림&apos;으로 남긴 것만 버린 날의 달에 셉니다. 가격을 못 읽은 줄은
        &apos;모름&apos;으로 따로 셉니다.
      </p>
    </section>
  );
}
