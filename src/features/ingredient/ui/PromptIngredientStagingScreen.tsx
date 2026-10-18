'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { format } from 'date-fns';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  Loader2,
  Plus,
  ScanText,
  Trash2,
  X,
} from 'lucide-react';
import { AppScreen } from '@stackflow/plugin-basic-ui';
import { useQueryClient } from '@tanstack/react-query';

import { cn } from '@/commons/lib';
import {
  Button,
  Chip,
  ChipRow,
  Counter,
  CTAPrimitive,
  DatePicker,
  Input,
  Select,
  Toast,
} from '@/commons/ui';

import {
  formatIngredientAmount,
  normalizeAmountByUnit,
  resolveAmountMin,
  resolveAmountStep,
  type IngredientUnit,
} from '@/entities/ingredient';
import {
  resolveDefaultCategoryId,
  useIngredientCategoriesQuery,
  type IngredientCategoryOption,
} from '@/entities/ingredient-category';
import { useSearchFilter } from '@/entities/search-synonym';

import {
  invalidateAfterIngredientAdd,
  useDispatchHouseholdActivityMutation,
} from '../api/mutations';
import { useIngredientBrandNamesQuery, useStoreNamesQuery } from '../api/queries';
import { type StagedItem } from '../lib/parseAiResponse';
import { type SaveState, usePromptIngredientStore } from '../model/promptIngredientStore';

import { createIngredientFormSchema } from './IngredientForm';

interface PromptIngredientStagingScreenProps {
  onClose: () => void;
  onComplete: () => void;
  householdId: string;
  userId: string;
  /** 품목명 제안(검색 화면과 같은 목록) */
  suggestions?: string[];
  /** 영수증 화면 열기. 인식이 끝나면 이 화면으로 돌아와 같은 목록에 품목이 붙는다 */
  onOpenReceipt: () => void;
}

const rowBg: Record<SaveState, string> = {
  idle: 'bg-white',
  saving: 'bg-blue-50',
  success: 'bg-[oklch(0.96_0.05_145)]',
  error: 'border-red-200 bg-[oklch(0.97_0.03_25)]',
  unknown: 'bg-amber-50',
};

type LineResult = { kind: 'success' } | { kind: 'error'; message: string } | { kind: 'unknown' };

interface LineDefaults {
  date: string;
  store: string;
}

/**
 * 한 줄 저장. 서버가 사유를 주고 거절하면(4xx) 실패 줄, 응답이 끊기거나 5xx면 저장 여부를 모르는 줄로 가른다.
 * 알림은 줄마다 보내지 않고 끝에 묶어서 한 번 보낸다.
 */
async function saveLine(
  item: StagedItem,
  householdId: string,
  userId: string,
): Promise<LineResult> {
  try {
    const res = await fetch('/api/ingredients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        household_id: householdId,
        user_id: userId,
        date: item.date,
        category_id: item.category_id,
        name: item.name.trim(),
        brand: item.brand || null,
        count: item.count,
        unit: item.unit,
        store: item.store || null,
        price: item.price,
        skipNotification: true,
      }),
    });
    if (res.ok) return { kind: 'success' };
    if (res.status >= 500) return { kind: 'unknown' };
    const json = await res.json().catch(() => null);
    return { kind: 'error', message: json?.message ?? '저장하지 못했어요.' };
  } catch {
    return { kind: 'unknown' };
  }
}

function newLine(defaults: LineDefaults, categoryId: string): StagedItem {
  return {
    id: crypto.randomUUID(),
    name: '',
    brand: '',
    price: 0,
    count: 1,
    unit: 'count',
    store: defaults.store,
    date: defaults.date,
    category_code: '',
    category_id: categoryId,
    source: 'direct',
  };
}

const isBlank = (item: StagedItem) => item.source === 'direct' && !item.name.trim();

function longDate(date: string) {
  const [, m, d] = date.split('-');
  return `${Number(m)}월 ${Number(d)}일`;
}

function SaveStateIcon({ state }: { state: SaveState }) {
  if (state === 'saving') {
    return <Loader2 className="size-4 shrink-0 animate-spin text-blue-400" />;
  }
  if (state === 'success') {
    return (
      <span className="animate-in zoom-in-50 flex size-4 shrink-0 items-center justify-center rounded-full bg-green-500 duration-300">
        <Check className="size-2.5 text-white" strokeWidth={3} />
      </span>
    );
  }
  if (state === 'error') {
    return (
      <span className="animate-in zoom-in-50 flex size-4 shrink-0 items-center justify-center rounded-full bg-red-400 duration-300">
        <X className="size-2.5 text-white" strokeWidth={3} />
      </span>
    );
  }
  return null;
}

const getNameTexts = (name: string) => [name];

/**
 * 줄 안 입력칸 + 그 아래 제안. 검색 화면을 띄우지 않고 같은 이름·유사어 목록(useSearchFilter)에서 고른다.
 */
function SuggestInput({
  value,
  onChange,
  options,
  placeholder,
  inputRef,
  onEnter,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder: string;
  inputRef?: React.Ref<HTMLInputElement>;
  onEnter?: () => void;
  className?: string;
}) {
  const [focused, setFocused] = useState(false);
  const unique = useMemo(() => [...new Set(options)], [options]);
  const { exact, similar } = useSearchFilter(unique, value, getNameTexts);
  const query = value.trim();
  const shown = query
    ? [
        ...exact.filter((n) => n !== query).map((n) => ({ name: n, similar: false })),
        ...similar.map((n) => ({ name: n, similar: true })),
      ].slice(0, 5)
    : [];

  return (
    <div className={cn('min-w-0', className)}>
      <Input
        ref={inputRef}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onEnter?.();
          }
        }}
        enterKeyHint="next"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      {focused && shown.length > 0 ? (
        <ul className="mt-1 overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm">
          {shown.map((s) => (
            <li key={s.name}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(s.name);
                  setFocused(false);
                  onEnter?.();
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm active:bg-gray-100"
              >
                <span>{s.name}</span>
                {s.similar ? <span className="text-[11px] text-gray-400">유사어</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function PriceField({
  value,
  onChange,
  inputRef,
  onEnter,
}: {
  value: number;
  onChange: (value: number) => void;
  inputRef?: React.Ref<HTMLInputElement>;
  onEnter?: () => void;
}) {
  return (
    <div className="relative w-[7.5rem] shrink-0">
      <Input
        ref={inputRef}
        inputMode="numeric"
        enterKeyHint="next"
        placeholder="가격"
        className={cn('text-right', value > 0 && 'pr-7')}
        value={value > 0 ? value.toLocaleString('ko-KR') : ''}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '');
          onChange(digits ? Math.min(Number.parseInt(digits, 10), 100_000_000) : 0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onEnter?.();
          }
        }}
      />
      {value > 0 ? (
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-gray-500">
          원
        </span>
      ) : null}
    </div>
  );
}

/** 받침이 있으면 '을', 없으면 '를' */
function objectParticle(word: string) {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return '를';
  return (code - 0xac00) % 28 === 0 ? '를' : '을';
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="w-10 shrink-0 text-xs font-medium text-gray-500">{children}</span>;
}

/**
 * 펼친 품목. 두 단계로 펼친다.
 * - 새 품목: 품목명 | 가격과 요약 한 줄("기타 · 1개 · 브랜드 없음 ⌄")만. 요약 줄을 누르면 다 펼친다.
 * - 이미 넣은 품목(접힌 카드를 누름)·실패 품목: 품목명 | 가격, 수량, 분류, 브랜드, 구매처·날짜, 삭제까지 모두.
 */
function ExpandedItem({
  item,
  categories,
  nameOptions,
  brandOptions,
  storeOptions,
  state,
  error,
  autoFocusName,
  detailOpen,
  onOpenDetail,
  onChange,
  onRemove,
  onNext,
}: {
  item: StagedItem;
  categories: IngredientCategoryOption[];
  nameOptions: string[];
  brandOptions: string[];
  storeOptions: string[];
  state: SaveState;
  error?: string;
  autoFocusName: boolean;
  /** 새 품목은 품목명 | 가격과 요약 한 줄만 보인다(자판이 올라와도 카드가 화면에 들어가게). */
  detailOpen: boolean;
  onOpenDetail: () => void;
  onChange: (updates: Partial<StagedItem>) => void;
  onRemove: () => void;
  onNext: () => void;
}) {
  const [placeOpen, setPlaceOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);

  // 고른 분류가 칩 줄 밖에 있으면 보이는 자리로 옮긴다(페이지는 움직이지 않는다).
  useEffect(
    function showSelectedCategory() {
      const row = chipsRef.current?.querySelector<HTMLElement>('[data-slot=chip-row]');
      const chip = row?.querySelector<HTMLElement>('[aria-checked=true]');
      if (!row || !chip) return;
      const left = chip.offsetLeft - row.offsetLeft;
      if (left + chip.offsetWidth > row.scrollLeft + row.clientWidth || left < row.scrollLeft) {
        row.scrollLeft = Math.max(0, left - 8);
      }
    },
    [item.id, item.category_id, categories.length],
  );

  useEffect(
    function focusNameOnOpen() {
      if (!autoFocusName) return;
      const timer = window.setTimeout(() => nameRef.current?.focus(), 80);
      return () => window.clearTimeout(timer);
    },
    [autoFocusName, item.id],
  );

  return (
    <div
      data-expanded-item
      className={cn(
        'flex flex-col gap-3 rounded-xl border-2 border-emerald-500 p-3',
        state === 'error' ? 'bg-[oklch(0.97_0.03_25)]' : 'bg-white',
      )}
    >
      <div className="flex items-start gap-2">
        <SuggestInput
          className="flex-1"
          value={item.name}
          onChange={(name) => onChange({ name })}
          options={nameOptions}
          placeholder="품목명"
          inputRef={nameRef}
          onEnter={() => priceRef.current?.focus()}
        />
        <PriceField
          value={item.price}
          onChange={(price) => onChange({ price })}
          inputRef={priceRef}
          onEnter={onNext}
        />
      </div>

      {state === 'error' ? (
        <span className="text-xs font-medium text-red-600">
          저장하지 못했어요. {error || '다시 저장해 주세요'}
        </span>
      ) : null}

      {detailOpen ? null : (
        <button
          type="button"
          onClick={onOpenDetail}
          className="flex items-center gap-1 self-start rounded px-1 py-0.5 text-xs text-gray-500 active:bg-gray-100"
        >
          {[
            categories.find((c) => c.id === item.category_id)?.label ?? '기타',
            formatIngredientAmount(item.count, item.unit, true),
            item.brand || '브랜드 없음',
          ].join(' · ')}
          <ChevronDown className="size-3.5" />
        </button>
      )}

      {detailOpen ? (
        <>
          <div className="flex items-center gap-2">
            <FieldLabel>수량</FieldLabel>
            <Counter
              key={`count-${item.unit}`}
              className="w-36"
              value={item.count}
              min={resolveAmountMin(item.unit)}
              step={resolveAmountStep(item.unit)}
              onValueChange={(n) => onChange({ count: normalizeAmountByUnit(n, item.unit) })}
            />
            <Select
              value={item.unit}
              onValueChange={(u) =>
                onChange({
                  unit: u as IngredientUnit,
                  count: resolveAmountMin(u as IngredientUnit),
                })
              }
            >
              <Select.Trigger className="w-16">
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

          <div ref={chipsRef} className="flex items-center gap-2">
            <FieldLabel>분류</FieldLabel>
            <ChipRow className="pb-0">
              {categories.map((c) => (
                <Chip
                  key={c.id}
                  selected={c.id === item.category_id}
                  onClick={() => onChange({ category_id: c.id })}
                  className="px-2.5 py-1 text-[13px]"
                >
                  {c.emoji ? (
                    <span className="font-tossface" aria-hidden>
                      {c.emoji}
                    </span>
                  ) : null}
                  {c.label}
                </Chip>
              ))}
            </ChipRow>
          </div>

          <SuggestInput
            value={item.brand}
            onChange={(brand) => onChange({ brand })}
            options={brandOptions}
            placeholder="브랜드 (선택)"
          />

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm text-gray-700">
              <span className="truncate">
                {item.store || <span className="text-gray-400">구매처 선택</span>} ·{' '}
                {longDate(item.date)}
              </span>
              <button
                type="button"
                onClick={() => setPlaceOpen((v) => !v)}
                className="shrink-0 px-1 py-0.5 text-xs font-medium text-gray-500"
              >
                {placeOpen ? '닫기' : '변경'}
              </button>
            </div>
            {placeOpen ? (
              <div className="flex gap-2">
                <SuggestInput
                  className="flex-1"
                  value={item.store}
                  onChange={(store) => onChange({ store })}
                  options={storeOptions}
                  placeholder="구매처"
                />
                <DatePicker
                  className="flex-1"
                  value={new Date(item.date)}
                  maxDate={new Date()}
                  onChange={(d) => d && onChange({ date: format(d, 'yyyy-MM-dd') })}
                />
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-2">
            <button
              type="button"
              onClick={onRemove}
              className="flex shrink-0 items-center gap-1 px-1 py-0.5 text-xs font-medium text-gray-400"
            >
              <Trash2 className="size-3.5" />
              삭제
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

interface Removed {
  item: StagedItem;
  index: number;
  state: SaveState;
  error?: string;
}

/**
 * 장보기 추가. 입구는 하나이고, 이 화면이 곧 품목 목록이다.
 * 펼친 품목은 늘 하나, 나머지는 접힌 카드이며 "+ 품목 추가"로 품목을 늘리고 영수증으로 읽은 품목도 같은 목록에 붙는다.
 * 하단 버튼 숫자는 지금 누르면 저장되는 품목 수다. 실패한 품목은 사유와 함께 남아 그것만 다시 저장하고,
 * 응답이 끊긴 품목은 "저장됐는지 확인이 필요해요"로 따로 둔다.
 */
export function PromptIngredientStagingScreen({
  onClose,
  onComplete,
  householdId,
  userId,
  suggestions = [],
  onOpenReceipt,
}: PromptIngredientStagingScreenProps) {
  const {
    items,
    saveStates,
    errors,
    lastSavedCount,
    addItems,
    updateItem,
    setSaveState,
    removeItems,
    addSavedCount,
    reset,
  } = usePromptIngredientStore();
  const queryClient = useQueryClient();
  const dispatchActivityMutation = useDispatchHouseholdActivityMutation();
  const { data: categories = [] } = useIngredientCategoriesQuery(householdId);
  const { data: brandNames = [] } = useIngredientBrandNamesQuery(householdId);
  const { data: storeNames = [] } = useStoreNamesQuery(householdId);
  const schema = useMemo(
    () => createIngredientFormSchema(categories.map((c) => c.id)),
    [categories],
  );
  const defaultCategoryId = resolveDefaultCategoryId(categories);

  const [defaults, setDefaults] = useState<LineDefaults>({
    date: format(new Date(), 'yyyy-MM-dd'),
    store: '',
  });
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  /** 펼친 품목이 새 품목이라 요약 한 줄만 보이는지 */
  const [compact, setCompact] = useState(true);
  const [removed, setRemoved] = useState<Removed | null>(null);

  // 처음 열면 빈 품목 하나를 펴 두고 품목명에 커서를 둔다. 지난번에 비워 둔 품목은 치운다.
  useEffect(
    function openFirstLine() {
      if (categories.length === 0 || expandedId) return;
      const store = usePromptIngredientStore.getState();
      const blanks = store.items.filter(isBlank).map((i) => i.id);
      if (blanks.length > 0) store.removeItems(blanks);
      const line = newLine(defaults, defaultCategoryId);
      store.addItems([line]);
      setExpandedId(line.id);
      setCompact(true);
      setFocusId(line.id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categories.length],
  );

  // 되돌리기 안내는 5초 뒤 사라진다.
  useEffect(
    function hideUndoLater() {
      if (!removed) return;
      const timer = window.setTimeout(() => setRemoved(null), 5000);
      return () => window.clearTimeout(timer);
    },
    [removed],
  );

  const stateOf = (item: StagedItem) => saveStates[item.id] ?? 'idle';
  const isSaving = items.some((i) => stateOf(i) === 'saving');
  const listItems = items.filter((i) => stateOf(i) !== 'unknown');
  const unknownItems = items.filter((i) => stateOf(i) === 'unknown');
  const failedItems = listItems.filter((i) => stateOf(i) === 'error');
  const expanded = listItems.find((i) => i.id === expandedId) ?? null;

  /** 단건 폼과 같은 규칙으로 검사한다. 걸린 품목은 저장에서 빠진다. */
  function invalidReason(item: StagedItem): string | null {
    if (categories.length === 0) return null;
    const result = schema.safeParse(item);
    if (result.success) return null;
    const issue = result.error.issues[0];
    if (issue.path[0] === 'price' && item.price === 0) {
      return item.source === 'receipt'
        ? '가격을 못 읽었어요. 눌러서 입력해 주세요'
        : '가격이 없어요. 눌러서 입력해 주세요';
    }
    return issue.message;
  }

  // 품목명이 빈 품목은 사유 없이 빠진다(아직 쓰는 중인 새 품목).
  const targets = listItems.filter(
    (i) => !isBlank(i) && stateOf(i) !== 'success' && !invalidReason(i),
  );
  const skipped = listItems.filter(
    (i) => !isBlank(i) && stateOf(i) !== 'success' && invalidReason(i),
  );
  const priceless = skipped.filter((i) => i.price === 0);
  const isRetry = targets.length > 0 && targets.every((i) => stateOf(i) === 'error');
  const doneCount = targets.filter((i) => ['success', 'error'].includes(stateOf(i))).length;
  const total = targets.reduce((sum, i) => sum + i.price, 0);

  function resolveCategory(item: StagedItem) {
    const cat = categories.find((c) => c.id === item.category_id);
    return { label: cat?.label ?? '기타', emoji: cat?.emoji };
  }

  function differsFromDefaults(item: StagedItem) {
    return item.store !== defaults.store || item.date !== defaults.date;
  }

  /** 펼친 품목을 접는다. 아무것도 안 쓴 품목은 접지 않고 치운다. */
  function collapseCurrent() {
    if (expanded && isBlank(expanded)) removeItems([expanded.id]);
    setExpandedId(null);
  }

  function expandLine(item: StagedItem) {
    if (isSaving || item.id === expandedId) return;
    collapseCurrent();
    setExpandedId(item.id);
    setCompact(false);
    setFocusId(null);
  }

  function addLine() {
    if (isSaving) return;
    // 품목명이 빈 품목이 펼쳐져 있으면 새로 만들지 않고 그 칸으로 돌려보낸다.
    if (expanded && isBlank(expanded)) {
      setFocusId(null);
      window.setTimeout(() => setFocusId(expanded.id), 0);
      return;
    }
    // 날짜·구매처·분류는 앞 품목 값을 이어받는다. 맨 위 기본값도 그 값으로 따라간다.
    const next = expanded ? { date: expanded.date, store: expanded.store } : defaults;
    setDefaults(next);
    const line = newLine(next, expanded?.category_id ?? defaultCategoryId);
    addItems([line]);
    setExpandedId(line.id);
    setCompact(true);
    setFocusId(line.id);
  }

  function removeLine(item: StagedItem) {
    const index = usePromptIngredientStore.getState().items.findIndex((i) => i.id === item.id);
    setRemoved({ item, index, state: stateOf(item), error: errors[item.id] });
    removeItems([item.id]);
    if (item.id === expandedId) setExpandedId(null);
  }

  /** 지운 품목을 원래 자리로 되돌린다. */
  function undoRemove() {
    if (!removed) return;
    const { item, index, state, error } = removed;
    usePromptIngredientStore.setState((prev) => {
      const nextItems = [...prev.items];
      nextItems.splice(Math.min(index, nextItems.length), 0, item);
      return {
        items: nextItems,
        checkedIds: [...prev.checkedIds, item.id],
        saveStates: { ...prev.saveStates, [item.id]: state },
        errors: error ? { ...prev.errors, [item.id]: error } : prev.errors,
      };
    });
    setRemoved(null);
  }

  function openReceipt() {
    if (isSaving) return;
    collapseCurrent();
    onOpenReceipt();
  }

  function changeDefaults(updates: Partial<LineDefaults>) {
    // 펼친 새 품목이 기본값을 쓰고 있으면 같이 바꾼다.
    if (expanded && expanded.source === 'direct' && !differsFromDefaults(expanded)) {
      updateItem(expanded.id, updates);
    }
    setDefaults({ ...defaults, ...updates });
  }

  async function saveAll() {
    if (isSaving || targets.length === 0) return;
    setRemoved(null);
    const batch = [...targets];
    const successNames: string[] = [];
    const successIds: string[] = [];
    let problemCount = 0;

    for (const item of batch) {
      setSaveState(item.id, 'saving');
      const result = await saveLine(item, householdId, userId);
      if (result.kind === 'success') {
        successNames.push(item.name.trim());
        successIds.push(item.id);
        setSaveState(item.id, 'success');
      } else if (result.kind === 'error') {
        problemCount += 1;
        setSaveState(item.id, 'error', result.message);
      } else {
        problemCount += 1;
        setSaveState(item.id, 'unknown');
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }

    // 알림과 화면 다시 읽기는 저장 끝에 한 번만 한다.
    if (successNames.length > 0) {
      dispatchActivityMutation.mutate({
        householdId,
        itemNames: successNames,
        triggeredBy: userId,
      });
      invalidateAfterIngredientAdd(queryClient);
    }

    const current = usePromptIngredientStore.getState().items;
    const blankIds = current.filter(isBlank).map((i) => i.id);
    const leftover = current.filter((i) => !successIds.includes(i.id) && !isBlank(i));
    if (problemCount === 0 && leftover.length === 0) {
      const savedTotal = usePromptIngredientStore.getState().lastSavedCount + successNames.length;
      reset();
      Toast.success(`품목 ${savedTotal}개를 저장했어요`);
      onComplete();
      return;
    }
    // 저장된 품목과 빈 품목은 목록에서 빼고, 남은 품목(실패, 확인 필요, 아직 안 고친 품목)만 접어서 둔다.
    removeItems([...successIds, ...blankIds]);
    addSavedCount(successNames.length);
    // 실패한 품목은 펼쳐서 사유와 고칠 칸을 바로 보인다.
    const firstFailed = usePromptIngredientStore
      .getState()
      .items.find((i) => usePromptIngredientStore.getState().saveStates[i.id] === 'error');
    setExpandedId(firstFailed?.id ?? null);
    setCompact(false);
    setFocusId(null);
  }

  let ctaLabel = targets.length > 0 ? `품목 ${targets.length}개 저장하기` : '저장';
  if (isSaving) ctaLabel = `저장 중... (${doneCount}/${targets.length})`;
  else if (isRetry) ctaLabel = `실패한 ${targets.length}개 다시 저장하기`;

  return (
    <AppScreen
      className="pointer-events-auto"
      appBar={{
        title: '장보기 추가',
        backButton: {
          render: () => (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              aria-label="뒤로가기"
              disabled={isSaving}
            >
              <ChevronLeft className="size-5" />
            </Button>
          ),
        },
      }}
    >
      <div className="flex flex-col gap-2 px-4 pt-3 pb-40">
        {/* 새 품목 기본값. 값은 품목마다 두고, 여기서는 새 품목에 들어갈 값을 보여 주고 고친다. */}
        <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5">
          <span className="text-sm font-medium text-gray-800">
            {longDate(defaults.date)} ·{' '}
            {defaults.store || <span className="text-gray-400">구매처 선택</span>}
          </span>
          <button
            type="button"
            onClick={() => setDefaultsOpen((v) => !v)}
            className="shrink-0 px-1 py-0.5 text-xs font-medium text-gray-500"
          >
            {defaultsOpen ? '닫기' : '변경'}
          </button>
        </div>
        {defaultsOpen ? (
          <div className="flex gap-2 rounded-lg border border-gray-100 p-2">
            <DatePicker
              className="flex-1"
              value={new Date(defaults.date)}
              maxDate={new Date()}
              onChange={(d) => d && changeDefaults({ date: format(d, 'yyyy-MM-dd') })}
            />
            <SuggestInput
              className="flex-1"
              value={defaults.store}
              onChange={(store) => changeDefaults({ store })}
              options={storeNames}
              placeholder="구매처"
            />
          </div>
        ) : null}

        {lastSavedCount > 0 && !isSaving ? (
          <div className="flex items-center gap-2 rounded-lg bg-[oklch(0.96_0.05_145)] px-3 py-2.5 text-sm font-medium text-green-800">
            <Check className="size-4" strokeWidth={3} />
            {failedItems.length > 0
              ? `${lastSavedCount}개를 저장했어요. 저장하지 못한 ${failedItems.length}개는 아래에 있어요`
              : `${lastSavedCount}개를 저장했어요`}
          </div>
        ) : null}

        {unknownItems.length > 0 ? (
          <div className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-800">
              <AlertTriangle className="size-4" />
              저장됐는지 확인해 주세요 · {unknownItems.length}개
            </div>
            <p className="text-xs leading-relaxed text-amber-800">
              연결이 끊겨 저장됐는지 몰라요. 두 번 저장되지 않게 다시 저장에서 뺐어요.
            </p>
            {unknownItems.map((item) => (
              <div key={item.id} className="flex flex-col gap-1.5 rounded-lg bg-white px-3 py-2.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{item.name}</span>
                  <span className="font-semibold">{item.price.toLocaleString()}원</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      removeItems([item.id]);
                      onComplete();
                    }}
                  >
                    내역 보기
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => removeItems([item.id])}
                  >
                    확인했어요
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {listItems.map((item) => {
          const state = stateOf(item);
          if (item.id === expandedId) {
            return (
              <ExpandedItem
                key={item.id}
                item={item}
                categories={categories}
                nameOptions={suggestions}
                brandOptions={brandNames}
                storeOptions={storeNames}
                state={state}
                error={errors[item.id]}
                autoFocusName={focusId === item.id}
                detailOpen={!compact || state === 'error'}
                onOpenDetail={() => setCompact(false)}
                onChange={(updates) => updateItem(item.id, updates)}
                onRemove={() => removeLine(item)}
                onNext={addLine}
              />
            );
          }

          const reason = invalidReason(item);
          const cat = resolveCategory(item);
          const showIcon = state === 'saving' || state === 'success';
          const isPriceUnknown = item.price === 0;
          const meta = [cat.label, formatIngredientAmount(item.count, item.unit, true)];
          if (item.brand) meta.push(item.brand);
          if (differsFromDefaults(item)) {
            meta.push(`${item.store || '구매처 없음'} · ${longDate(item.date)}`);
          }

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => expandLine(item)}
              disabled={isSaving}
              className={cn(
                'flex flex-col gap-1 rounded-xl border px-3 py-2.5 text-left',
                'transition-[background-color] duration-500 ease-out',
                rowBg[state],
              )}
            >
              <div className="flex items-center gap-2">
                {showIcon ? <SaveStateIcon state={state} /> : null}
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-gray-900">
                  {item.name}
                </span>
                <span
                  className={cn(
                    'shrink-0 text-sm',
                    isPriceUnknown ? 'font-medium text-orange-500' : 'font-semibold text-gray-900',
                  )}
                >
                  {isPriceUnknown ? '가격 없음' : `${item.price.toLocaleString()}원`}
                </span>
              </div>
              <div className="flex min-w-0 items-center gap-1.5 text-xs text-gray-500">
                <span className="min-w-0 truncate">{meta.join(' · ')}</span>
                {item.source === 'receipt' ? (
                  <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">
                    영수증
                  </span>
                ) : null}
              </div>
              {state === 'error' ? (
                <span className="text-xs font-medium text-red-600">
                  저장하지 못했어요. {errors[item.id] || '다시 저장해 주세요'}
                </span>
              ) : null}
              {state !== 'error' && reason ? (
                <span className="text-xs font-medium text-orange-500">{reason}</span>
              ) : null}
            </button>
          );
        })}

        <button
          type="button"
          onClick={addLine}
          disabled={isSaving}
          className="flex h-12 items-center justify-center gap-1 rounded-xl border border-dashed border-gray-300 text-sm font-semibold text-emerald-600 active:bg-gray-50"
        >
          <Plus className="size-4" />
          품목 추가
        </button>
        <button
          type="button"
          onClick={openReceipt}
          disabled={isSaving}
          className="flex items-center justify-center gap-1.5 self-center px-2 py-2 text-sm text-gray-500"
        >
          <ScanText className="size-4" />
          영수증으로 추가
        </button>
      </div>

      <div className="safe-area-padding-bottom fixed right-0 bottom-0 left-0 z-[var(--z-cta)] bg-white px-4 pt-2 pb-3 shadow-[0_-8px_16px_-8px_rgba(0,0,0,0.06)]">
        <div className="mx-auto flex w-full max-w-[480px] flex-col gap-2">
          {removed ? (
            <div className="animate-in fade-in slide-in-from-bottom-2 flex items-center justify-between rounded-xl bg-gray-800 px-4 py-3 text-sm text-white shadow-lg">
              <span className="min-w-0 truncate">
                {removed.item.name.trim() || '빈 품목'}
                {removed.item.name.trim() ? objectParticle(removed.item.name) : '을'} 삭제했어요
              </span>
              <button
                type="button"
                onClick={undoRemove}
                className="shrink-0 pl-3 font-semibold text-emerald-300"
              >
                되돌리기
              </button>
            </div>
          ) : null}
          {(targets.length > 0 || skipped.length > 0) && !isSaving ? (
            <div className="flex items-center justify-between gap-2 px-1 text-xs">
              <span className="text-gray-500">
                {targets.length > 0 ? `합계 ${total.toLocaleString()}원` : null}
              </span>
              {skipped.length > 0 ? (
                <span className="font-medium text-orange-500">
                  {priceless.length === skipped.length
                    ? `가격 없는 ${priceless.length}개는 저장에서 빠져요`
                    : `${skipped.length}개는 저장에서 빠져요`}
                </span>
              ) : null}
            </div>
          ) : null}
          <CTAPrimitive
            type="button"
            color="confirm"
            variant="filled"
            onClick={saveAll}
            disabled={isSaving || targets.length === 0}
          >
            {ctaLabel}
          </CTAPrimitive>
        </div>
      </div>
    </AppScreen>
  );
}
