'use client';

import { cn } from '@/commons/lib';
import { HighlightedText } from '@/commons/ui';

import { DINING_EXPENSE_KIND_LABEL, isDiningExpenseKind } from '@/entities/dining-expense';
import { getDiningKindEmoji, type FoodExpense } from '@/entities/food-expense';
import { formatIngredientAmount } from '@/entities/ingredient';

import { buildStockTags, type StockTagTone } from '../lib/stockTag';

const STOCK_TAG_CLASS: Record<StockTagTone, string> = {
  left: 'bg-emerald-50 text-emerald-700',
  done: 'bg-gray-100 text-gray-500',
  discarded: 'bg-red-50 text-red-600',
};

interface FoodExpenseItemProps {
  expense: FoodExpense;
  /** 장보기 행의 카테고리 라벨 — 외식비는 kind 라벨(식당/포장·배달)이 이 자리를 대신한다 */
  categoryLabel?: string;
  categoryEmoji?: string;
  size?: 'sm' | 'md';
  /** 검색어(유사어 확장 포함). 품목명과 가게명에서 일치하는 구간을 굵게 칠한다 */
  highlightTerms?: string[];
}

/**
 * 장보기·외식비를 분기 없이 렌더링하는 식비 카드 본문.
 * 두 테이블이 name(먹은 것) / brand(만든·파는 주체) / store(결제 채널)로 필드명을 맞췄기에
 * 종류별 컴포넌트를 나누지 않고 하나로 그린다.
 */
export function FoodExpenseItem({
  expense,
  categoryLabel = '',
  categoryEmoji,
  size = 'md',
  highlightTerms,
}: FoodExpenseItemProps) {
  // 외식비는 메뉴를 기억 못 해 비워둘 수 있다. 그때는 가게명이 제목 자리로 올라온다.
  const title = expense.name || expense.brand || '';
  const subtitle = expense.name ? expense.brand : null;

  // 카테고리 슬롯은 장보기면 재료 카테고리, 외식비면 식당/포장·배달이 차지한다.
  const slotLabel = isDiningExpenseKind(expense.kind)
    ? DINING_EXPENSE_KIND_LABEL[expense.kind]
    : categoryLabel;
  const slotEmoji = getDiningKindEmoji(expense.kind) ?? categoryEmoji;

  const amountLabel =
    expense.count !== null && expense.unit
      ? formatIngredientAmount(expense.count, expense.unit, true)
      : null;
  const metaItems = [amountLabel, expense.store].filter(Boolean) as string[];
  // 영수증에서 가격을 못 읽은 장보기 줄은 0원으로 저장된다. 합계에는 0원으로 들어가지만 행에서는 '금액 모름'으로 보인다.
  const isPriceUnknown = expense.kind === 'grocery' && expense.price === 0;
  // 꼬리표형: 이 장보기로 산 재료가 냉장고에서 어떻게 됐는지 메타 줄 끝에 붙인다.
  const stockTags = buildStockTags(expense);

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          {subtitle ? (
            <HighlightedText
              text={subtitle}
              terms={highlightTerms}
              className="truncate text-xs text-gray-400"
            />
          ) : null}
          <HighlightedText
            text={title}
            terms={highlightTerms}
            className={cn(
              'truncate font-normal text-gray-900',
              size === 'sm' ? 'text-sm' : 'text-base',
            )}
          />
        </div>
        <span
          className={cn(
            'ml-auto shrink-0 font-semibold',
            isPriceUnknown ? 'text-orange-500' : 'text-gray-900',
            size === 'sm' ? 'text-sm' : 'text-base',
          )}
        >
          {isPriceUnknown ? '금액 모름' : `${expense.price.toLocaleString()}원`}
        </span>
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className="truncate">
          {slotEmoji ? (
            <span className="font-tossface mr-1" aria-hidden>
              {slotEmoji}
            </span>
          ) : null}
          <span>{slotLabel}</span>
          {metaItems.length > 0 ? <span className="ml-2 text-gray-300">|</span> : null}
        </span>
        {metaItems.map((meta, index) => (
          <span key={`${expense.id}-meta-${index}`} className="truncate">
            {meta}
            {index < metaItems.length - 1 ? <span className="ml-2 text-gray-300">|</span> : null}
          </span>
        ))}
        {stockTags.map((tag) => (
          <span
            key={`${expense.id}-stock-${tag.tone}`}
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
              STOCK_TAG_CLASS[tag.tone],
            )}
          >
            {tag.label}
          </span>
        ))}
      </div>
    </>
  );
}
