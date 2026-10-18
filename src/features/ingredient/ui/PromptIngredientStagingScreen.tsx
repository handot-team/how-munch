'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { format } from 'date-fns';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  Loader2,
  Pencil,
  Plus,
  ScanText,
  Trash2,
  X,
} from 'lucide-react';
import { AppScreen } from '@stackflow/plugin-basic-ui';
import { useQueryClient } from '@tanstack/react-query';

import { cn } from '@/commons/lib';
import { Button, Counter, CTAButton, DatePicker, Input, Select, Toast } from '@/commons/ui';

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
  /** 영수증 화면 열기. 인식이 끝나면 이 화면으로 돌아와 같은 목록에 줄이 붙는다 */
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

function shortDate(date: string) {
  const [, m, d] = date.split('-');
  return `${Number(m)}/${Number(d)}`;
}

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

function SourceTag({ source }: { source?: StagedItem['source'] }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium',
        source === 'direct' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700',
      )}
    >
      {source === 'direct' ? '직접 입력' : '영수증'}
    </span>
  );
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

/**
 * 펼친 줄. 위 단은 품목명 | 가격, 아래 단은 나머지 칸 요약 한 줄이고 누르면 그 자리에서 펴진다.
 */
function ExpandedLine({
  item,
  categories,
  nameOptions,
  brandOptions,
  storeOptions,
  state,
  error,
  autoFocusName,
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
  onChange: (updates: Partial<StagedItem>) => void;
  onRemove: () => void;
  onNext: () => void;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const cat = categories.find((c) => c.id === item.category_id);

  useEffect(
    function focusNameOnOpen() {
      if (!autoFocusName) return;
      const timer = window.setTimeout(() => nameRef.current?.focus(), 80);
      return () => window.clearTimeout(timer);
    },
    [autoFocusName, item.id],
  );

  const summary = [
    cat?.label ?? '기타',
    formatIngredientAmount(item.count, item.unit, true),
    item.brand || '브랜드',
  ];

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-xl border-2 border-emerald-500 p-3',
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

      <button
        type="button"
        onClick={() => setDetailOpen((v) => !v)}
        className="flex items-center gap-1.5 self-start rounded px-1 py-0.5 text-xs text-gray-500 active:bg-gray-100"
      >
        <SourceTag source={item.source} />
        <span className="truncate">
          {cat?.emoji ? (
            <span className="font-tossface mr-0.5" aria-hidden>
              {cat.emoji}
            </span>
          ) : null}
          {summary.join(' · ')}
        </span>
        <Pencil className="size-3 shrink-0" />
      </button>

      {state === 'error' && error ? (
        <span className="text-xs font-medium text-red-600">저장 실패 · {error}</span>
      ) : null}

      {detailOpen ? (
        <div className="flex flex-col gap-3 border-t border-gray-100 pt-3">
          <div className="flex gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <span className="text-xs text-gray-500">분류</span>
              <Select
                value={item.category_id}
                onValueChange={(category_id) => onChange({ category_id })}
              >
                <Select.Trigger>
                  <Select.Value placeholder="분류" />
                </Select.Trigger>
                <Select.Content>
                  {categories.map((c) => (
                    <Select.Item key={c.id} value={c.id}>
                      {c.emoji} {c.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">수량</span>
              <div className="flex gap-1.5">
                <Counter
                  key={`count-${item.unit}`}
                  className="w-28"
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
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">브랜드</span>
            <SuggestInput
              value={item.brand}
              onChange={(brand) => onChange({ brand })}
              options={brandOptions}
              placeholder="예: 풀무원"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <span className="text-xs text-gray-500">날짜</span>
              <DatePicker
                value={new Date(item.date)}
                maxDate={new Date()}
                onChange={(d) => d && onChange({ date: format(d, 'yyyy-MM-dd') })}
              />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <span className="text-xs text-gray-500">구매처</span>
              <SuggestInput
                value={item.store}
                onChange={(store) => onChange({ store })}
                options={storeOptions}
                placeholder="구매처"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="flex items-center gap-1 self-end text-xs font-medium text-gray-400"
          >
            <Trash2 className="size-3.5" />이 줄 지우기
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * 장보기 추가. 입구는 하나이고, 이 화면이 곧 담은 목록이다.
 * 펼친 줄은 늘 하나, 나머지는 접힌 줄이며 "+ 한 줄 더"로 줄을 늘리고 "영수증으로 채우기"로 읽은 줄을 같은 목록에 붙인다.
 * 하단 버튼 숫자는 지금 누르면 저장되는 줄 수다. 실패한 줄은 사유와 함께 남아 그 줄만 다시 저장하고,
 * 응답이 끊긴 줄은 "저장 확인 필요"로 따로 둔다.
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

  // 처음 열면 빈 줄 하나를 펴 두고 품목명에 커서를 둔다. 지난번에 비워 둔 줄은 치운다.
  useEffect(
    function openFirstLine() {
      if (categories.length === 0 || expandedId) return;
      const store = usePromptIngredientStore.getState();
      const blanks = store.items.filter(isBlank).map((i) => i.id);
      if (blanks.length > 0) store.removeItems(blanks);
      const line = newLine(defaults, defaultCategoryId);
      store.addItems([line]);
      setExpandedId(line.id);
      setFocusId(line.id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categories.length],
  );

  const stateOf = (item: StagedItem) => saveStates[item.id] ?? 'idle';
  const isSaving = items.some((i) => stateOf(i) === 'saving');
  const listItems = items.filter((i) => stateOf(i) !== 'unknown');
  const unknownItems = items.filter((i) => stateOf(i) === 'unknown');
  const failedItems = listItems.filter((i) => stateOf(i) === 'error');
  const expanded = listItems.find((i) => i.id === expandedId) ?? null;

  /** 단건 폼과 같은 규칙으로 검사한다. 걸린 줄은 사유와 함께 저장에서 빠진다. */
  function invalidReason(item: StagedItem): string | null {
    if (categories.length === 0) return null;
    const result = schema.safeParse(item);
    if (result.success) return null;
    const issue = result.error.issues[0];
    if (issue.path[0] === 'price' && item.price === 0) {
      return item.source === 'receipt' ? '가격을 못 읽었어요 · 눌러서 입력' : '가격을 넣어 주세요';
    }
    return issue.message;
  }

  // 품목명이 빈 줄은 사유 없이 빠진다(아직 쓰는 중인 새 줄).
  const targets = listItems.filter(
    (i) => !isBlank(i) && stateOf(i) !== 'success' && !invalidReason(i),
  );
  const isRetry = targets.length > 0 && targets.every((i) => stateOf(i) === 'error');
  const doneCount = targets.filter((i) => ['success', 'error'].includes(stateOf(i))).length;
  const filled = listItems.filter((i) => !isBlank(i));
  const total = filled.reduce((sum, i) => sum + i.price, 0);

  function resolveCategory(item: StagedItem) {
    const cat = categories.find((c) => c.id === item.category_id);
    return { label: cat?.label ?? '기타', emoji: cat?.emoji };
  }

  function differsFromDefaults(item: StagedItem) {
    return item.store !== defaults.store || item.date !== defaults.date;
  }

  /** 펼친 줄을 접는다. 아무것도 안 쓴 줄은 접지 않고 치운다. */
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

  function addLine() {
    if (isSaving) return;
    // 품목명이 빈 줄이 펼쳐져 있으면 새 줄을 만들지 않고 그 칸으로 돌려보낸다.
    if (expanded && isBlank(expanded)) {
      setFocusId(null);
      window.setTimeout(() => setFocusId(expanded.id), 0);
      return;
    }
    // 날짜·구매처·분류는 앞 줄 값을 이어받는다. 맨 위 기본값도 그 값으로 따라간다.
    const next = expanded ? { date: expanded.date, store: expanded.store } : defaults;
    setDefaults(next);
    const line = newLine(next, expanded?.category_id ?? defaultCategoryId);
    addItems([line]);
    setExpandedId(line.id);
    setFocusId(line.id);
  }

  function openReceipt() {
    if (isSaving) return;
    collapseCurrent();
    onOpenReceipt();
  }

  function changeDefaults(updates: Partial<LineDefaults>) {
    // 펼친 새 줄이 기본값을 쓰고 있으면 같이 바꾼다.
    if (expanded && expanded.source === 'direct' && !differsFromDefaults(expanded)) {
      updateItem(expanded.id, updates);
    }
    setDefaults({ ...defaults, ...updates });
  }

  async function saveAll() {
    if (isSaving || targets.length === 0) return;
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
      Toast.success(
        savedTotal === 1 ? '장보기 1건을 저장했어요' : `${savedTotal}건을 모두 저장했어요`,
      );
      onComplete();
      return;
    }
    // 저장된 줄과 빈 줄은 목록에서 빼고, 남은 줄(실패, 확인 필요, 아직 안 고친 줄)만 접어서 둔다.
    removeItems([...successIds, ...blankIds]);
    addSavedCount(successNames.length);
    setExpandedId(null);
  }

  let ctaLabel = targets.length > 0 ? `${targets.length}건 저장` : '저장';
  if (isSaving) ctaLabel = `저장 중... (${doneCount}/${targets.length})`;
  else if (isRetry) ctaLabel = `실패 ${targets.length}건 다시 저장`;

  const addButtons = (
    <div className="grid grid-cols-2 gap-2">
      <Button
        type="button"
        variant="outline"
        className="h-11"
        onClick={addLine}
        disabled={isSaving}
      >
        <Plus className="size-4" />한 줄 더
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-11"
        onClick={openReceipt}
        disabled={isSaving}
      >
        <ScanText className="size-4" />
        영수증으로 채우기
      </Button>
    </div>
  );

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
      <div className="flex flex-col gap-2 px-4 pt-3 pb-28">
        {/* 새 줄 기본값. 값은 줄마다 두고, 여기서는 새 줄에 들어갈 값을 보여 주고 고친다. */}
        <button
          type="button"
          onClick={() => setDefaultsOpen((v) => !v)}
          className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-left"
        >
          <span className="text-sm font-medium text-gray-800">
            {longDate(defaults.date)} · {defaults.store || '구매처 없음'}
          </span>
          <span className="flex items-center gap-2 text-xs text-gray-500">
            {filled.length > 0 ? `${filled.length}줄 · ${total.toLocaleString()}원` : null}
            <Pencil className="size-3.5" />
          </span>
        </button>
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
            {lastSavedCount}건을 저장했어요
            {failedItems.length > 0 ? ` · 실패 ${failedItems.length}건은 아래에 남겼어요` : ''}
          </div>
        ) : null}

        {listItems.map((item) => {
          const state = stateOf(item);
          if (item.id === expandedId) {
            return (
              <div key={item.id} className="flex flex-col gap-2">
                <ExpandedLine
                  item={item}
                  categories={categories}
                  nameOptions={suggestions}
                  brandOptions={brandNames}
                  storeOptions={storeNames}
                  state={state}
                  error={errors[item.id]}
                  autoFocusName={focusId === item.id}
                  onChange={(updates) => updateItem(item.id, updates)}
                  onRemove={() => {
                    removeItems([item.id]);
                    setExpandedId(null);
                  }}
                  onNext={addLine}
                />
                {addButtons}
              </div>
            );
          }

          const reason = invalidReason(item);
          const cat = resolveCategory(item);
          const showIcon = state === 'saving' || state === 'success';
          const isPriceUnknown = item.price === 0;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => expandLine(item)}
              disabled={isSaving}
              className={cn(
                'flex flex-col gap-1 rounded-lg border px-3 py-2 text-left',
                'transition-[background-color] duration-500 ease-out',
                rowBg[state],
              )}
            >
              <div className="flex items-center gap-2">
                {showIcon ? <SaveStateIcon state={state} /> : null}
                <span className="min-w-0 flex-1 truncate text-sm text-gray-900">
                  {item.brand ? <span className="mr-1 text-gray-400">{item.brand}</span> : null}
                  {item.name}
                </span>
                <span
                  className={cn(
                    'shrink-0 text-sm font-semibold',
                    isPriceUnknown ? 'text-orange-500' : 'text-gray-900',
                  )}
                >
                  {isPriceUnknown ? '금액 모름' : `${item.price.toLocaleString()}원`}
                </span>
              </div>
              <div className="flex min-w-0 items-center gap-1.5 text-xs text-gray-500">
                <SourceTag source={item.source} />
                <span className="shrink-0">
                  {cat.emoji ? (
                    <span className="font-tossface mr-0.5" aria-hidden>
                      {cat.emoji}
                    </span>
                  ) : null}
                  {cat.label} · {formatIngredientAmount(item.count, item.unit, true)}
                </span>
                {differsFromDefaults(item) ? (
                  <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">
                    {item.store || '구매처 없음'}·{shortDate(item.date)}
                  </span>
                ) : null}
              </div>
              {state === 'error' ? (
                <span className="text-xs font-medium text-red-600">
                  저장 실패 · {errors[item.id]}
                </span>
              ) : null}
              {state !== 'error' && reason ? (
                <span className="text-xs font-medium text-orange-500">
                  {reason} · 저장에서 빠져요
                </span>
              ) : null}
            </button>
          );
        })}

        {expanded ? null : addButtons}

        {unknownItems.length > 0 ? (
          <div className="mt-2 flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-800">
              <AlertTriangle className="size-4" />
              저장 확인 필요 {unknownItems.length}건
            </div>
            <p className="text-xs leading-relaxed text-amber-800">
              응답이 끊겨 저장됐는지 알 수 없어요. 다시 저장하면 두 번 들어갈 수 있어 다시 저장에서
              뺐어요. 장보기 내역에서 확인해 주세요.
            </p>
            {unknownItems.map((item) => (
              <div key={item.id} className="flex flex-col gap-1.5 rounded-lg bg-white px-3 py-2.5">
                <div className="flex items-center justify-between text-sm">
                  <span>{item.name}</span>
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
                    내역에서 확인
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => removeItems([item.id])}
                  >
                    저장됐어요, 빼기
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <CTAButton
        type="button"
        color="confirm"
        variant="filled"
        onClick={saveAll}
        disabled={isSaving || targets.length === 0}
      >
        {ctaLabel}
      </CTAButton>
    </AppScreen>
  );
}
