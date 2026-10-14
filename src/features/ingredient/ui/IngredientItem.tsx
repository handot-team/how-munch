'use client';

import { cn } from '@/commons/lib';

import { formatIngredientAmount, type IngredientUnit } from '@/entities/ingredient';

export interface IngredientItemProps {
  name: string;
  brand?: string | null;
  price: number;
  count: number;
  unit: IngredientUnit;
  store?: string | null;
  categoryLabel: string;
  categoryEmoji?: string;
  size?: 'sm' | 'md';
}

export function IngredientItem({
  name,
  brand,
  price,
  count,
  unit,
  store,
  categoryLabel,
  categoryEmoji,
  size = 'md',
}: IngredientItemProps) {
  const amountLabel = formatIngredientAmount(count, unit, true);
  const metaItems = [amountLabel, store].filter(Boolean) as string[];
  // 영수증에서 가격을 못 읽은 줄은 0원으로 저장된다. 0원과 구분되게 '금액 모름'으로 보인다.
  const isPriceUnknown = price === 0;

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          {brand ? <span className="truncate text-xs text-gray-400">{brand}</span> : null}
          <span
            className={cn(
              'truncate font-normal text-gray-900',
              size === 'sm' ? 'text-sm' : 'text-base',
            )}
          >
            {name}
          </span>
        </div>
        <span
          className={cn(
            'ml-auto shrink-0 font-semibold',
            isPriceUnknown ? 'text-orange-500' : 'text-gray-900',
            size === 'sm' ? 'text-sm' : 'text-base',
          )}
        >
          {isPriceUnknown ? '금액 모름' : `${price.toLocaleString()}원`}
        </span>
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className="truncate">
          {categoryEmoji ? (
            <span className="font-tossface mr-1" aria-hidden>
              {categoryEmoji}
            </span>
          ) : null}
          <span>{categoryLabel}</span>
          {metaItems.length > 0 ? <span className="ml-2 text-gray-300">|</span> : null}
        </span>
        {metaItems.map((meta, index) => (
          <span key={`${name}-meta-${index}`} className="truncate">
            {meta}
            {index < metaItems.length - 1 ? <span className="ml-2 text-gray-300">|</span> : null}
          </span>
        ))}
      </div>
    </>
  );
}
