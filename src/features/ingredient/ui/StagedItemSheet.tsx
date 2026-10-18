'use client';

import { useEffect, useRef, useState } from 'react';

import { Plus, X } from 'lucide-react';

import { cn } from '@/commons/lib';
import {
  BottomSheet,
  Chip,
  ChipRow,
  Counter,
  CTAPrimitive,
  Input,
  PriceInput,
  Select,
} from '@/commons/ui';
import { Form } from '@/commons/ui/Form';

import {
  normalizeAmountByUnit,
  resolveAmountMin,
  resolveAmountStep,
  type IngredientUnit,
} from '@/entities/ingredient';
import { CategoryFormField, type IngredientCategoryOption } from '@/entities/ingredient-category';

import { type StagedItem } from '../lib/parseAiResponse';

import { fieldClass, PriceField, SuggestionRow, tone, useNameSuggestions } from './StagingParts';

export type ItemDraft = Pick<
  StagedItem,
  'name' | 'price' | 'count' | 'unit' | 'category_id' | 'brand'
>;

/**
 * 시안 v7 품목 시트 안(송이사님 10/19 07:40 "품목 담기는 뭔가 이상해. 고치기랑").
 * - a: 장보기 수정 폼 그대로(라벨·테두리 칸, 모두 펼침). 담으면 닫힌다.
 * - b: 자주 쓰는 칸만 펼침(브랜드만 접음), 담은 뒤 "방금 담은 품목" 행이 남는다. 삭제는 버튼 아래 글자.
 * - c: 담기는 b와 같고, 고치기는 시트가 아니라 품목 고치기 화면으로 간다(담기 화면이 가른다).
 * 고르는 곳: localStorage `mock.sheetVariant`, 없으면 b.
 */
export type SheetVariant = 'a' | 'b' | 'c';

export function readSheetVariant(): SheetVariant {
  if (typeof window === 'undefined') return 'b';
  const value = window.localStorage.getItem('mock.sheetVariant');
  return value === 'a' || value === 'c' ? value : 'b';
}

interface StagedItemSheetProps {
  open: boolean;
  variant: SheetVariant;
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
  /** 담기 화면에 담긴 품목 수("3개째") */
  basketCount: number;
  /** 방금 담은 품목을 담기 화면 행 모양으로 그린다(b·c) */
  renderAdded?: (draft: ItemDraft) => React.ReactNode;
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

/** b·c 칸 위 작은 라벨 */
function SmallLabel({ children }: { children: React.ReactNode }) {
  return <span className={cn('text-[13px] font-medium', tone.label)}>{children}</span>;
}

/**
 * 품목 시트(시안 v7). 넣기와 고치기가 같은 시트를 쓰고, 안(a·b·c)마다 칸 모양과 담은 뒤 모양이 다르다.
 * 닫기는 위 X 또는 시트 바깥 누름.
 */
export function StagedItemSheet({
  open,
  variant,
  mode,
  item,
  focus,
  categories,
  defaultCategoryId,
  nameOptions,
  brandOptions,
  basketCount,
  renderAdded,
  error,
  onAdd,
  onSave,
  onRemove,
  onClose,
}: StagedItemSheetProps) {
  const [draft, setDraft] = useState<ItemDraft>(() => emptyDraft(defaultCategoryId));
  const [brandOpen, setBrandOpen] = useState(false);
  const [added, setAdded] = useState<ItemDraft | null>(null);
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
      setBrandOpen(mode === 'edit' && Boolean(item?.brand));
      setAdded(null);
      if (!focus) return;
      const target = focus === 'price' ? priceRef : nameRef;
      const timer = window.setTimeout(() => {
        target.current?.focus();
        target.current?.scrollIntoView({ block: 'nearest' });
      }, 350);
      return () => window.clearTimeout(timer);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, mode, item?.id, focus],
  );

  // 고른 분류가 칩 줄 밖에 있으면 보이는 자리로 옮긴다.
  useEffect(
    function showSelectedCategory() {
      if (!open || variant === 'a') return;
      const timer = window.setTimeout(() => {
        const row = chipsRef.current?.querySelector<HTMLElement>('[data-slot=chip-row]');
        const chip = row?.querySelector<HTMLElement>('[aria-checked=true]');
        if (!row || !chip) return;
        const left = chip.offsetLeft - row.offsetLeft;
        if (left + chip.offsetWidth > row.scrollLeft + row.clientWidth || left < row.scrollLeft) {
          row.scrollLeft = Math.max(0, left - 8);
        }
      }, 50);
      return () => window.clearTimeout(timer);
    },
    [open, variant, item?.id, draft.category_id, categories.length],
  );

  const change = (updates: Partial<ItemDraft>) => setDraft((d) => ({ ...d, ...updates }));
  const step = resolveAmountStep(draft.unit);
  const min = resolveAmountMin(draft.unit);
  const setCount = (n: number) =>
    change({ count: normalizeAmountByUnit(Math.max(min, n), draft.unit) });
  const changeUnit = (u: string) =>
    change({ unit: u as IngredientUnit, count: resolveAmountMin(u as IngredientUnit) });

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
    // a: 담으면 닫혀 담기 화면으로 돌아간다. b·c: 비운 채 남고 위에 방금 담은 품목이 남는다.
    if (variant === 'a') {
      onClose();
      return;
    }
    setAdded(clean);
    setDraft(emptyDraft(defaultCategoryId));
    setBrandOpen(false);
    nameRef.current?.focus();
  }

  const nameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (draft.name.trim()) priceRef.current?.focus();
    }
  };
  const pickName = (name: string) => {
    change({ name });
    priceRef.current?.focus();
  };

  // a는 장보기 수정 폼의 Form.Field·CategoryFormField를 그대로 쓰려고 칸마다 폼 필드 모양을 흉내 낸다.
  const fieldOf = <K extends keyof ItemDraft>(name: K) => ({
    name,
    state: { value: draft[name], meta: { errors: [] as unknown[] } },
    handleChange: (value: ItemDraft[K]) => change({ [name]: value } as Partial<ItemDraft>),
  });

  /* a: 장보기 수정 폼과 같은 라벨·테두리 칸. 순서 분류 → 품목명 → 브랜드 → 수량·단위 → 가격 */
  const formA = (
    <div className="flex flex-col gap-4">
      <CategoryFormField field={fieldOf('category_id')} options={categories} />
      <Form.Field field={fieldOf('name')}>
        <Form.Label required>품목명</Form.Label>
        <Form.Control>
          <Input
            ref={nameRef}
            value={draft.name}
            placeholder="예: 삼겹살"
            aria-label="품목 이름"
            onChange={(e) => change({ name: e.target.value })}
            onKeyDown={nameKeyDown}
            enterKeyHint="next"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </Form.Control>
        <SuggestionRow names={nameChips} onPick={pickName} />
      </Form.Field>
      <Form.Field field={fieldOf('brand')}>
        <Form.Label>브랜드</Form.Label>
        <Form.Control>
          <Input
            value={draft.brand}
            placeholder="예: 풀무원"
            aria-label="브랜드"
            onChange={(e) => change({ brand: e.target.value })}
            autoComplete="off"
          />
        </Form.Control>
        <SuggestionRow names={brandChips} onPick={(brand) => change({ brand })} />
      </Form.Field>
      <div className="flex gap-2">
        <Form.Field field={fieldOf('count')} className="flex-1">
          <Form.Label required>수량</Form.Label>
          <Form.Control>
            <Counter
              key={`staged-count-${draft.unit}`}
              value={draft.count}
              min={min}
              step={step}
              onValueChange={(n) => change({ count: normalizeAmountByUnit(n, draft.unit) })}
            />
          </Form.Control>
        </Form.Field>
        <Form.Field field={fieldOf('unit')} className="w-24">
          <Form.Label required>단위</Form.Label>
          <Select value={draft.unit} onValueChange={changeUnit}>
            <Form.Control>
              <Select.Trigger>
                <Select.Value placeholder="단위" />
              </Select.Trigger>
            </Form.Control>
            <Select.Content>
              <Select.Item value="count">개</Select.Item>
              <Select.Item value="g">g</Select.Item>
              <Select.Item value="kg">kg</Select.Item>
              <Select.Item value="ml">ml</Select.Item>
              <Select.Item value="l">L</Select.Item>
            </Select.Content>
          </Select>
        </Form.Field>
      </div>
      <Form.Field field={fieldOf('price')}>
        <Form.Label required>가격</Form.Label>
        <Form.Control>
          <PriceInput
            ref={priceRef}
            value={draft.price}
            onChange={(price) => change({ price })}
            blankWhenZero
            placeholder="가격"
            aria-label="가격"
            enterKeyHint="done"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
          />
        </Form.Control>
      </Form.Field>
    </div>
  );

  /* b·c: 작은 라벨, 품목명 → 가격 → 수량 → 분류 칩, 브랜드만 접음 */
  const formB = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <SmallLabel>품목명</SmallLabel>
        <Input
          ref={nameRef}
          value={draft.name}
          placeholder="예: 우유"
          aria-label="품목 이름"
          className={fieldClass}
          onChange={(e) => change({ name: e.target.value })}
          onKeyDown={nameKeyDown}
          enterKeyHint="next"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <SuggestionRow names={nameChips} onPick={pickName} />
      </div>
      <div className="flex flex-col gap-1.5">
        <SmallLabel>가격</SmallLabel>
        <PriceField
          value={draft.price}
          onChange={(price) => change({ price })}
          inputRef={priceRef}
          onEnter={submit}
        />
      </div>
      <div className="flex h-11 items-center justify-between">
        <SmallLabel>수량</SmallLabel>
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
          <span className={cn('w-8 text-center text-base font-semibold tabular-nums', tone.text)}>
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
          <Select value={draft.unit} onValueChange={changeUnit}>
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
      <div ref={chipsRef} className="flex flex-col gap-1.5">
        <SmallLabel>분류</SmallLabel>
        <ChipRow className="pb-0">
          {categories.map((c) => {
            const selected = c.id === draft.category_id;
            return (
              <Chip
                key={c.id}
                selected={selected}
                onClick={() => change({ category_id: c.id })}
                className={cn(
                  'h-10 bg-white px-3.5 py-0 text-sm hover:bg-white',
                  selected
                    ? 'border-emerald-600 text-emerald-700'
                    : cn('border-[#E5E8EB] hover:border-[#E5E8EB]', tone.label),
                )}
              >
                {c.label}
              </Chip>
            );
          })}
        </ChipRow>
      </div>
      {brandOpen ? (
        <div className="flex flex-col gap-1.5">
          <SmallLabel>브랜드</SmallLabel>
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
      ) : (
        <button
          type="button"
          onClick={() => setBrandOpen(true)}
          className={cn(
            'flex h-11 items-center gap-1 self-start text-[15px] font-medium',
            tone.sub,
          )}
        >
          브랜드 적기
          <Plus className="size-4" />
        </button>
      )}
    </div>
  );

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
        {variant === 'a' && mode === 'edit' && item ? (
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
        {variant !== 'a' && added ? (
          <div role="status" data-just-added className="flex flex-col gap-1.5 pb-1">
            <div className="flex items-center justify-between px-1">
              <span className="text-[13px] font-semibold text-emerald-700">방금 담은 품목</span>
              <span className={cn('text-[13px] font-semibold tabular-nums', tone.label)}>
                {basketCount}개째
              </span>
            </div>
            {renderAdded ? (
              renderAdded(added)
            ) : (
              <div className="rounded-lg border bg-white px-3 py-2.5">{added.name}</div>
            )}
          </div>
        ) : null}
        {error ? (
          <p className={cn('text-sm font-medium', tone.red)}>저장하지 못했어요. {error}</p>
        ) : null}
        {variant === 'a' ? formA : formB}
      </BottomSheet.Content>

      <BottomSheet.Footer className="pb-5">
        <CTAPrimitive type="button" color="confirm" variant="filled" onClick={submit}>
          {mode === 'edit' ? '저장' : '담기'}
        </CTAPrimitive>
        {variant !== 'a' && mode === 'edit' && item ? (
          <button
            type="button"
            onClick={() => onRemove(item)}
            className={cn('h-11 text-[15px] font-medium', tone.sub)}
          >
            이 품목 지우기
          </button>
        ) : null}
      </BottomSheet.Footer>
    </BottomSheet.Root>
  );
}
