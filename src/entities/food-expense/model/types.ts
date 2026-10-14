import { type DiningExpenseKind } from '@/entities/dining-expense/@x/food-expense';
import { type IngredientUnit } from '@/entities/ingredient/@x/food-expense';

/** 식비 종류 — 장보기(재고로 들어감) + 외식비(재고로 들어가지 않음) */
export type FoodExpenseKind = 'grocery' | DiningExpenseKind;

/** 식비 세그먼트 필터 값 — 전체 포함 */
export type FoodExpenseFilterKind = 'all' | FoodExpenseKind;

/**
 * 식비 통합 내역 (v_food_expenses 뷰 1행).
 * 장보기와 외식비를 컬럼 별칭 없이 UNION한 결과라, 한쪽 전용 컬럼은 반대편에서 null이다.
 */
export interface FoodExpense {
  id: string;
  household_id: string;
  user_id: string | null;
  kind: FoodExpenseKind;
  /** 구매/결제 일자 (YYYY-MM-DD) */
  date: string;
  /** 먹은 것 (예: 삼겹살) */
  name: string | null;
  /** 만든/파는 주체 (예: 풀무원, 교촌치킨, ○○숯불갈비) */
  brand: string | null;
  /** 결제 채널 (예: 이마트, 배달의민족) */
  store: string | null;
  price: number;

  /** 장보기 전용 — 카테고리 UUID */
  category_id: string | null;
  /** 장보기 전용 — 구매 수량 */
  count: number | null;
  /** 장보기 전용 — 수량 단위 */
  unit: IngredientUnit | null;
  /** 장보기 전용 — 연결된 냉장고 아이템 ID */
  linked_fridge_item_id: string | null;
  /** 장보기 전용 — 연결된 냉장고 배치 ID */
  linked_fridge_batch_id: string | null;

  /** 외식비 전용 — 메모 */
  memo: string | null;

  created_at: string;
  updated_at: string;

  /** 연결된 냉장고 재료/배치의 식단 사용 이력 유무 — route에서 조립한다 (장보기 전용) */
  has_meal_usage?: boolean;

  /** 이 행이 만든 구매분의 재고 상태 — route에서 조립한다 (장보기 전용, 연결이 끊겼으면 null) */
  stock?: FoodExpenseStock | null;
}

/** 장보기 행 하나가 만든 구매분의 남은 양과 끝 기록 합 */
export interface FoodExpenseStock {
  remaining: number;
  eaten: number;
  discarded: number;
}
