'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { format } from 'date-fns';
import { AlertTriangle, Camera, Check, ChevronLeft, Loader2, Trash2, X } from 'lucide-react';
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
  /** 외식 세그먼트. 기존 외식비 입력 화면을 연다 */
  onOpenDining: () => void;
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
 * 펼친 품목. 품목 줄을 누르면 그 자리에서 펼쳐지고, 고칠 칸이 모두 보인다.
 * 위에서부터 품목명 | 가격, 수량, 분류, 브랜드, 구매처·날짜, 삭제.
 */
function ExpandedItem({
  item,
  categories,
  nameOptions,
  brandOptions,
  storeOptions,
  state,
  error,
  autoFocusPrice,
  onChange,
  onRemove,
  onDone,
}: {
  item: StagedItem;
  categories: IngredientCategoryOption[];
  nameOptions: string[];
  brandOptions: string[];
  storeOptions: string[];
  state: SaveState;
  error?: string;
  /** 입력줄로 막 담은 품목이면 가격 칸에 커서를 두고 입력줄 바로 위로 스크롤한다 */
  autoFocusPrice: boolean;
  onChange: (updates: Partial<StagedItem>) => void;
  onRemove: () => void;
  /** 가격 칸 Enter: 접고 입력줄로 돌아간다 */
  onDone: () => void;
}) {
  const [placeOpen, setPlaceOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
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
    function focusPriceOnAdd() {
      if (!autoFocusPrice) return;
      const timer = window.setTimeout(() => {
        rootRef.current?.scrollIntoView({ block: 'end' });
        priceRef.current?.focus({ preventScroll: true });
      }, 60);
      return () => window.clearTimeout(timer);
    },
    [autoFocusPrice, item.id],
  );

  return (
    <div
      ref={rootRef}
      data-expanded-item
      className={cn(
        'flex scroll-mb-64 flex-col gap-3 rounded-xl border-2 border-emerald-500 p-3',
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
          onEnter={() => priceRef.current?.focus()}
        />
        <PriceField
          value={item.price}
          onChange={(price) => onChange({ price })}
          inputRef={priceRef}
          onEnter={onDone}
        />
      </div>

      {state === 'error' ? (
        <span className="text-xs font-medium text-red-600">
          저장하지 못했어요. {error || '다시 저장해 주세요'}
        </span>
      ) : null}

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
 * 장보기 기록. 식비 탭의 [직접 쓰기 | 영수증] 두 입구가 모두 이 화면으로 온다.
 * 품목은 하단 입력줄에서 이름을 치고 Enter(또는 추천 칩)로 목록 맨 아래에 쌓고, 영수증으로 읽은 품목도 같은 목록에 붙는다.
 * 품목 줄을 누르면 그 자리에서 펼쳐 고친다(펼친 줄은 하나). 하단 버튼 숫자는 지금 누르면 저장되는 품목 수다.
 * 실패한 품목은 사유와 함께 남아 그것만 다시 저장하고, 응답이 끊긴 품목은 따로 둔다.
 */
export function PromptIngredientStagingScreen({
  onClose,
  onComplete,
  householdId,
  userId,
  suggestions = [],
  onOpenReceipt,
  onOpenDining,
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
  const [removed, setRemoved] = useState<Removed | null>(null);
  const [draft, setDraft] = useState('');
  const barRef = useRef<HTMLInputElement>(null);

  const uniqueSuggestions = useMemo(() => [...new Set(suggestions)], [suggestions]);
  const { exact, similar } = useSearchFilter(uniqueSuggestions, draft, getNameTexts);
  const query = draft.trim();
  const chips = query
    ? [...new Set([...exact.filter((n) => n !== query), ...similar])].slice(0, 6)
    : [];

  // 지난번에 이름 없이 남은 품목은 치운다.
  useEffect(function dropBlankItems() {
    const store = usePromptIngredientStore.getState();
    const blanks = store.items.filter(isBlank).map((i) => i.id);
    if (blanks.length > 0) store.removeItems(blanks);
  }, []);

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

  /** 펼친 품목을 접는다. 이름을 지운 품목은 접지 않고 치운다. */
  function collapseCurrent() {
    if (expanded && isBlank(expanded)) removeItems([expanded.id]);
    setExpandedId(null);
  }

  function expandLine(item: StagedItem) {
    if (isSaving || item.id === expandedId) return;
    collapseCurrent();
    setExpandedId(item.id);
    setFocusId(null);
  }

  /** 입력줄의 이름으로 목록 맨 아래에 품목을 만들고 펼쳐 가격 칸에 커서를 둔다. 추천에 없는 이름도 담는다. */
  function addByName(name: string) {
    const trimmed = name.trim();
    if (isSaving || !trimmed) return;
    collapseCurrent();
    const line = { ...newLine(defaults, defaultCategoryId), name: trimmed };
    addItems([line]);
    setExpandedId(line.id);
    setFocusId(line.id);
    setDraft('');
  }

  /** 가격 칸 Enter: 접고 입력줄로 돌아간다. */
  function finishItem() {
    collapseCurrent();
    setFocusId(null);
    barRef.current?.focus();
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
      Toast.success(`${savedTotal}개 저장했어요 · 가구원에게 알렸어요`);
      onComplete();
      return;
    }
    // 저장된 품목과 빈 품목은 목록에서 빼고, 남은 품목(실패, 확인 필요, 아직 안 고친 품목)만 둔다.
    removeItems([...successIds, ...blankIds]);
    addSavedCount(successNames.length);
    // 실패한 품목은 펼쳐서 사유와 고칠 칸을 바로 보인다.
    const after = usePromptIngredientStore.getState();
    const firstFailed = after.items.find((i) => after.saveStates[i.id] === 'error');
    setExpandedId(firstFailed?.id ?? null);
    setFocusId(null);
  }

  const skippedNote =
    priceless.length === skipped.length
      ? `가격 없는 ${priceless.length}개는 빠져요`
      : `${skipped.length}개는 빠져요`;

  let ctaLabel = targets.length > 0 ? `${targets.length}개 저장` : '저장';
  if (isSaving) ctaLabel = `저장 중... (${doneCount}/${targets.length})`;
  else if (isRetry) ctaLabel = `실패한 ${targets.length}개 다시 저장`;

  return (
    <AppScreen
      className="pointer-events-auto"
      appBar={{
        title: '장보기 기록',
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
      <div className="flex flex-col gap-2 px-4 pt-3 pb-64">
        {/* 장보기 | 외식. 외식은 기존 외식비 입력 화면을 연다. */}
        <div className="grid grid-cols-2 rounded-lg bg-gray-100 p-1 text-sm font-semibold">
          <span className="rounded-md bg-white py-2 text-center text-gray-900 shadow-sm">
            장보기
          </span>
          <button type="button" onClick={onOpenDining} className="rounded-md py-2 text-gray-500">
            외식
          </button>
        </div>

        {/* 새 품목 기본값. 값은 품목마다 두고, 여기서는 새 품목에 들어갈 값을 보여 주고 고친다. */}
        <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5">
          <span className="text-sm font-medium text-gray-800">
            {defaults.store || <span className="text-gray-400">구매처 선택</span>} ·{' '}
            {longDate(defaults.date)}
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
            <SuggestInput
              className="flex-1"
              value={defaults.store}
              onChange={(store) => changeDefaults({ store })}
              options={storeNames}
              placeholder="구매처"
            />
            <DatePicker
              className="flex-1"
              value={new Date(defaults.date)}
              maxDate={new Date()}
              onChange={(d) => d && changeDefaults({ date: format(d, 'yyyy-MM-dd') })}
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

        {listItems.length === 0 && unknownItems.length === 0 ? (
          <p className="py-16 text-center text-sm text-gray-400">아직 담은 품목이 없어요</p>
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
                autoFocusPrice={focusId === item.id}
                onChange={(updates) => updateItem(item.id, updates)}
                onRemove={() => removeLine(item)}
                onDone={finishItem}
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
              data-item-row
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
      </div>

      {/* 하단 고정: 되돌리기 → 추천 칩 → 입력줄 → 합계 줄 → 저장 */}
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
          {chips.length > 0 ? (
            <ChipRow className="pb-0">
              {chips.map((name) => (
                <Chip
                  key={name}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addByName(name)}
                  className="px-3 py-1 text-[13px]"
                >
                  {name}
                </Chip>
              ))}
            </ChipRow>
          ) : null}
          <div className="flex items-center gap-2">
            <Input
              ref={barRef}
              value={draft}
              placeholder="품목 이름 (예: 우유)"
              onChange={(e) => setDraft(e.target.value)}
              onFocus={() => collapseCurrent()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  addByName(draft);
                }
              }}
              enterKeyHint="done"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              disabled={isSaving}
              className="flex-1"
            />
            <button
              type="button"
              onClick={openReceipt}
              disabled={isSaving}
              className="flex h-10 shrink-0 items-center gap-1 rounded-lg border border-gray-200 px-2.5 text-sm text-gray-600 active:bg-gray-50"
            >
              <Camera className="size-4" />
              영수증
            </button>
          </div>
          {!isSaving && (targets.length > 0 || skipped.length > 0) ? (
            <div className="flex items-center justify-between gap-2 px-1 text-xs">
              <span className="shrink-0 font-medium text-gray-700">
                {targets.length > 0 ? `합계 ${total.toLocaleString()}원` : null}
              </span>
              {skipped.length > 0 ? (
                <span className="truncate font-medium text-orange-500">{skippedNote}</span>
              ) : (
                <span className="truncate text-[11px] text-gray-400">
                  저장하면 가구원에게 알림이 한 번 가요
                </span>
              )}
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
