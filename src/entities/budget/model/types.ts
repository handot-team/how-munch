/** 예산 적용 범위 — 전체 예산과 항목별 예산 */
export type BudgetScope = 'total' | 'grocery' | 'restaurant' | 'delivery';

/** 월 단위 식비 예산 1행 */
export interface Budget {
  id: string;
  household_id: string;
  /** 'YYYY-MM' */
  year_month: string;
  scope: BudgetScope;
  amount: number;
  created_at: string;
  updated_at: string;
}

/**
 * scope별 예산 금액 표. null은 "미설정"이고 0은 "0원으로 산다"는 명시적 목표다.
 * 두 상태를 구분해야 진행바를 숨길지 보여줄지가 갈린다.
 */
export type BudgetAmountMap = Record<BudgetScope, number | null>;

/**
 * 일자 × 종류별 식비 합계 1점.
 * 누적 그래프와 scope별 지출 합계를 모두 이 시리즈에서 파생시킨다.
 */
export interface BudgetDailyPoint {
  /** 'YYYY-MM' */
  year_month: string;
  /** 'YYYY-MM-DD' */
  expense_date: string;
  /** 'grocery' | 'restaurant' | 'delivery' */
  kind: string;
  total: number;
}

/**
 * 한 달의 버린 식비. 끝 기록에서 '버림'으로 남긴 것만 센다.
 * 금액은 버린 시점의 장보기 금액 ÷ 산 수량이고, 가격을 모르는 줄은 금액 대신 건수로 따로 센다.
 */
export interface DiscardedFoodExpenseSummary {
  knownAmount: number;
  unknownCount: number;
}

/**
 * 월 화면형 예산 현황의 가게별 합계와 가구원별 입력 건수.
 * 외식비는 '식당·배달' 한 줄로 묶고, 가구원별로는 금액이 아닌 입력 건수만 센다.
 */
export interface BudgetMonthReport {
  stores: { label: string; amount: number }[];
  members: { userId: string; nickname: string; count: number }[];
}
