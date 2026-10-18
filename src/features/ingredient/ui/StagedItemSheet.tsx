'use client';

import { useEffect, useRef, useState } from 'react';

import { ChevronDown, X } from 'lucide-react';

import { cn } from '@/commons/lib';
import { BottomSheet, Chip, ChipRow, CTAPrimitive, Input, Select } from '@/commons/ui';

import {
  normalizeAmountByUnit,
  resolveAmountMin,
  resolveAmountStep,
  type IngredientUnit,
} from '@/entities/ingredient';
import { type IngredientCategoryOption } from '@/entities/ingredient-category';

import { type StagedItem } from '../lib/parseAiResponse';

import { fieldClass, PriceField, SuggestionRow, tone, useNameSuggestions } from './StagingParts';

export type ItemDraft = Pick<
  StagedItem,
  'name' | 'price' | 'count' | 'unit' | 'category_id' | 'brand'
>;

interface StagedItemSheetProps {
  open: boolean;
  /** add: 새 품목 담기, edit: 담은 품목 고치기 */
  mode: 'add' | 'edit';
  /** 고칠 품목(mode=edit) */
  item?: StagedItem | null;
  /** 열 때 커서를 둘 칸. 가격 없는 품목을 누르면 가격 칸이다 */
  focus?: 'name' | 'price' | null;
  categories: IngredientCategoryOption[];
  defaultCategoryId: string;
  nameOptions: string[];
  brandOptions: string[];
  /** 담기 화면에 담긴 품목 수("계란 담음 · 3개") */
  basketCount: number;
  /** 저장에 실패한 품목이면 그 사유 */
  error?: string;
  onAdd: (draft: ItemDraft) => void;
  onSave: (id: string, draft: ItemDraft) => void;
  onRemove: (item: StagedItem) => void;
  onClose: () => void;
}

function emptyDraft(categoryId: string): ItemDraft {
  return { name: '', price: 0, count: 1, unit: 'count', category_id: categoryId, brand: '' };
}

function draftOf(item: StagedItem): ItemDraft {
  const { name, price, count, unit, category_id, brand } = item;
  return { name, price, count, unit, category_id, brand };
}

/**
 * 품목 시트(시안 v6). 넣기와 고치기가 같은 시트를 쓴다. 이 시트가 정하는 것은 "품목 하나"뿐이다.
 * - 보이는 칸은 품목명과 가격 두 개. 수량·단위, 분류, 브랜드는 "더 적기"를 눌러야 펼쳐진다.
 * - 넣기: "담기"를 누르면 시트는 비워진 채 남고 위에 "계란 담음 · 3개"가 잠깐 보인다. 이어서 다음 품목을 쓴다.
 * - 고치기: "고치기"를 누르면 닫힌다. 오른쪽 위 빨간 "삭제"는 고칠 때만 있고, 지우면 담기 화면에 되돌리기가 뜬다.
 * - 닫기는 위 X 또는 시트 바깥 누름.
 */
export function StagedItemSheet({
  open,
  mode,
  item,
  focus,
  categories,
  defaultCategoryId,
  nameOptions,
  brandOptions,
  basketCount,
  error,
  onAdd,
  onSave,
  onRemove,
  onClose,
}: StagedItemSheetProps) {
  const [draft, setDraft] = useState<ItemDraft>(() => emptyDraft(defaultCategoryId));
  const [more, setMore] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);

  const nameChips = useNameSuggestions(nameOptions, draft.name);
  const brandChips = useNameSuggestions(brandOptions, draft.brand, 4);

  // 열 때마다 칸을 새로 채운다. 넣기는 빈칸, 고치기는 그 품목 값이다.
  useEffect(
    function resetOnOpen() {
      if (!open) return;
      setDraft(mode === 'edit' && item ? draftOf(item) : emptyDraft(defaultCategoryId));
      setMore(false);
      setAdded(null);
      if (!focus) return;
      const target = focus === 'price' ? priceRef : nameRef;
      const timer = window.setTimeout(() => target.current?.focus(), 350);
      return () => window.clearTimeout(timer);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, mode, item?.id, focus],
  );

  // "담음" 한 줄은 2초 뒤 사라진다.
  useEffect(
    function hideAddedLater() {
      if (!added) return;
      const timer = window.setTimeout(() => setAdded(null), 2000);
      return () => window.clearTimeout(timer);
    },
    [added],
  );

  // 고른 분류가 칩 줄 밖에 있으면 보이는 자리로 옮긴다.
  useEffect(
    function showSelectedCategory() {
      if (!more) return;
      const row = chipsRef.current?.querySelector<HTMLElement>('[data-slot=chip-row]');
      const chip = row?.querySelector<HTMLElement>('[aria-checked=true]');
      if (!row || !chip) return;
      const left = chip.offsetLeft - row.offsetLeft;
      if (left + chip.offsetWidth > row.scrollLeft + row.clientWidth || left < row.scrollLeft) {
        row.scrollLeft = Math.max(0, left - 8);
      }
    },
    [more, draft.category_id, categories.length],
  );

  const change = (updates: Partial<ItemDraft>) => setDraft((d) => ({ ...d, ...updates }));
  const step = resolveAmountStep(draft.unit);
  const min = resolveAmountMin(draft.unit);
  const setCount = (n: number) =>
    change({ count: normalizeAmountByUnit(Math.max(min, n), draft.unit) });

  function submit() {
    if (!draft.name.trim()) {
      nameRef.current?.focus();
      return;
    }
    const clean = { ...draft, name: draft.name.trim(), brand: draft.brand.trim() };
    if (mode === 'edit' && item) {
      onSave(item.id, clean);
      return;
    }
    onAdd(clean);
    setAdded(clean.name);
    setDraft(emptyDraft(defaultCategoryId));
    setMore(false);
    nameRef.current?.focus();
  }

  return (
    <BottomSheet.Root open={open} onClose={onClose}>
      <div data-item-sheet className="flex h-12 shrink-0 items-center justify-between px-2">
        <button
          type="button"
          aria-label="닫기"
          onClick={onClose}
          className={cn('flex size-11 items-center justify-center', tone.sub)}
        >
          <X className="size-6" />
        </button>
        <span className={cn('text-[17px] font-semibold', tone.text)}>
          {mode === 'edit' ? '품목 고치기' : '품목 담기'}
        </span>
        {mode === 'edit' && item ? (
          <button
            type="button"
            onClick={() => onRemove(item)}
            className={cn('h-11 px-3 text-[15px] font-semibold', tone.red)}
          >
            삭제
          </button>
        ) : (
          <span aria-hidden className="w-11" />
        )}
      </div>

      <BottomSheet.Content className="flex flex-col gap-3 pt-1 pb-2">
        {added ? (
          <p
            role="status"
            className={cn('animate-in fade-in text-[15px] font-semibold', 'text-emerald-700')}
          >
            {added} 담음 · {basketCount}개
          </p>
        ) : null}
        {error ? (
          <p className={cn('text-sm font-medium', tone.red)}>저장하지 못했어요. {error}</p>
        ) : null}

        <Input
          ref={nameRef}
          value={draft.name}
          placeholder="품목 이름"
          aria-label="품목 이름"
          className={fieldClass}
          onChange={(e) => change({ name: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (draft.name.trim()) priceRef.current?.focus();
            }
          }}
          enterKeyHint="next"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <SuggestionRow
          names={nameChips}
          onPick={(name) => {
            change({ name });
            priceRef.current?.focus();
          }}
        />
        <PriceField
          value={draft.price}
          onChange={(price) => change({ price })}
          inputRef={priceRef}
          onEnter={submit}
        />

        <button
          type="button"
          aria-expanded={more}
          onClick={() => setMore((v) => !v)}
          className={cn(
            'flex h-11 items-center gap-1 self-start text-[15px] font-medium',
            tone.sub,
          )}
        >
          더 적기
          <ChevronDown className={cn('size-4 transition-transform', more && 'rotate-180')} />
        </button>

        {more ? (
          <div className="flex flex-col gap-3">
            <div className="flex h-11 items-center justify-between">
              <span className={cn('text-[15px]', tone.label)}>수량</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="수량 감소"
                  onClick={() => setCount(draft.count - step)}
                  disabled={draft.count <= min}
                  className={cn(
                    'flex size-11 items-center justify-center rounded-full text-xl disabled:opacity-40',
                    tone.fill,
                    tone.text,
                  )}
                >
                  −
                </button>
                <span
                  className={cn('w-8 text-center text-base font-semibold tabular-nums', tone.text)}
                >
                  {draft.count}
                </span>
                <button
                  type="button"
                  aria-label="수량 증가"
                  onClick={() => setCount(draft.count + step)}
                  className={cn(
                    'flex size-11 items-center justify-center rounded-full text-xl',
                    tone.fill,
                    tone.text,
                  )}
                >
                  +
                </button>
                <Select
                  value={draft.unit}
                  onValueChange={(u) =>
                    change({
                      unit: u as IngredientUnit,
                      count: resolveAmountMin(u as IngredientUnit),
                    })
                  }
                >
                  <Select.Trigger className="h-11 w-16 rounded-xl border-0 bg-[#F2F4F6] shadow-none">
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="count">개</Select.Item>
                    <Select.Item value="g">g</Select.Item>
                    <Select.Item value="kg">kg</Select.Item>
                    <Select.Item value="ml">ml</Select.Item>
                    <Select.Item value="l">L</Select.Item>
                  </Select.Content>
                </Select>
              </div>
            </div>

            <div ref={chipsRef} className="flex flex-col gap-2">
              <span className={cn('text-[15px]', tone.label)}>분류</span>
              <ChipRow className="pb-0">
                {categories.map((c) => (
                  <Chip
                    key={c.id}
                    selected={c.id === draft.category_id}
                    onClick={() => change({ category_id: c.id })}
                    className={cn(
                      'h-10 border-0 px-3.5 py-0 text-sm',
                      c.id === draft.category_id
                        ? 'bg-[#191F28] text-white'
                        : cn('bg-[#F2F4F6] hover:bg-[#F2F4F6]', tone.sub),
                    )}
                  >
                    {c.label}
                  </Chip>
                ))}
              </ChipRow>
            </div>

            <div className="flex flex-col gap-2">
              <span className={cn('text-[15px]', tone.label)}>브랜드</span>
              <Input
                value={draft.brand}
                placeholder="없으면 비워 두세요"
                aria-label="브랜드"
                className={fieldClass}
                onChange={(e) => change({ brand: e.target.value })}
                autoComplete="off"
              />
              <SuggestionRow names={brandChips} onPick={(brand) => change({ brand })} />
            </div>
          </div>
        ) : null}
      </BottomSheet.Content>

      <BottomSheet.Footer className="pb-5">
        <CTAPrimitive type="button" color="confirm" variant="filled" onClick={submit}>
          {mode === 'edit' ? '고치기' : '담기'}
        </CTAPrimitive>
      </BottomSheet.Footer>
    </BottomSheet.Root>
  );
}
