import { type FoodExpense } from '@/entities/food-expense';
import { formatIngredientAmount, type IngredientUnit } from '@/entities/ingredient';

export type StockTagTone = 'left' | 'done' | 'discarded';

export interface StockTag {
  label: string;
  tone: StockTagTone;
}

/**
 * @description 장보기 행의 재고 꼬리표를 만든다("2개 남음", "다 먹음", "버림 1개").
 * 개 단위만 수량을 붙이고, 무게·부피 품목은 식단에서 써도 구매분 수량이 줄지 않아
 * "남음/다 씀" 두 상태만 쓴다. 원 단위 금액은 붙이지 않는다.
 */
export function buildStockTags(expense: FoodExpense): StockTag[] {
  const { stock } = expense;
  if (expense.kind !== 'grocery' || !stock) return [];

  const unit = (expense.unit ?? 'count') as IngredientUnit;
  const isCountUnit = unit === 'count';
  const bought = Number(expense.count ?? 0);
  const tags: StockTag[] = [];

  if (stock.remaining > 0) {
    tags.push({
      label: isCountUnit ? `${formatIngredientAmount(stock.remaining, unit, true)} 남음` : '남음',
      tone: 'left',
    });
  } else if (bought - stock.discarded > 0) {
    tags.push({ label: isCountUnit ? '다 먹음' : '다 씀', tone: 'done' });
  }

  if (stock.discarded > 0) {
    tags.push({
      label: isCountUnit ? `버림 ${formatIngredientAmount(stock.discarded, unit, true)}` : '버림',
      tone: 'discarded',
    });
  }

  return tags;
}
