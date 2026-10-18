'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { format } from 'date-fns';
import { Camera, Check, ChevronDown, ChevronLeft, Loader2, Plus, X } from 'lucide-react';
import { AppScreen } from '@stackflow/plugin-basic-ui';
import { useQueryClient } from '@tanstack/react-query';

import { cn } from '@/commons/lib';
import {
  BottomSheet,
  Button,
  Calendar,
  Chip,
  ChipRow,
  CTAPrimitive,
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

/**
 * 시안 v4 색. 토스 디자인 시스템(TDS)의 회색 단계와 앱 브랜드 초록 하나만 쓰고,
 * 경고는 빨강(실패)과 주황(가격 없음) 두 가지로만 쓴다. 테두리 대신 면과 여백으로 나눈다.
 * 작은 글자는 흰 바탕 대비 4.5:1을 넘는 단계만 쓴다.
 */
const tone = {
  text: 'text-[#191F28]',
  label: 'text-[#4E5968]',
  sub: 'text-[#6B7684]',
  hint: 'text-[#6B7684]',
  fill: 'bg-[#F2F4F6]',
  panel: 'bg-[#F9FAFB]',
  red: 'text-[#DC2626]',
  orange: 'text-[#C2410C]',
};

/** 테두리 없는 회색 칸(TDS TextField box형 모양) */
const fieldClass =
  'h-12 rounded-xl border-0 bg-[#F2F4F6] px-4 text-base shadow-none placeholder:text-[#6B7684] focus-visible:ring-2 focus-visible:ring-emerald-700/30';
/** 회색 면(펼친 품목) 안의 칸은 흰 면으로 맞춘다 */
const panelFieldClass = 'bg-white';

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
  onPanel = false,
}: {
  onPanel?: boolean;
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
        aria-label={placeholder}
        className={cn(fieldClass, onPanel && panelFieldClass)}
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
        <ul className="mt-1 overflow-hidden rounded-xl bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
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
                className="flex h-11 w-full items-center justify-between px-4 text-left text-[15px] active:bg-[#F2F4F6]"
              >
                <span>{s.name}</span>
                {s.similar ? <span className={cn('text-xs', tone.hint)}>유사어</span> : null}
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
    <div className="relative w-[8.5rem] shrink-0">
      <Input
        ref={inputRef}
        inputMode="numeric"
        enterKeyHint="next"
        placeholder="가격"
        aria-label="가격"
        className={cn(fieldClass, panelFieldClass, 'text-right font-semibold', value > 0 && 'pr-8')}
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
        <span
          className={cn(
            'pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-base',
            tone.sub,
          )}
        >
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
  return <span className={cn('w-[5.5rem] shrink-0 text-[15px]', tone.label)}>{children}</span>;
}

/** 값 하나를 고르는 약한 버튼. 누르면 바텀시트가 열린다. */
function SheetChip({
  label,
  placeholder,
  onClick,
  ariaLabel,
  onPanel = false,
}: {
  label: string;
  placeholder: string;
  onClick: () => void;
  ariaLabel: string;
  onPanel?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-haspopup="dialog"
      onClick={onClick}
      className={cn(
        'flex h-10 min-w-0 items-center gap-1 rounded-full px-3.5 text-[15px] font-medium',
        onPanel ? 'bg-white' : tone.fill,
        label ? tone.text : tone.hint,
      )}
    >
      <span className="truncate">{label || placeholder}</span>
      <ChevronDown className={cn('size-4 shrink-0', tone.hint)} />
    </button>
  );
}

/**
 * 날짜와 구매처를 한 줄에 두 버튼으로 둔다(시안 v5). 값이 다르고 고르는 방법도 달라 버튼과 시트를 나눈다.
 * - 날짜: 날짜 바텀시트(달력). 고르면 바로 닫힌다.
 * - 구매처: 구매처 바텀시트(TDS BottomSheet 단건 선택). 기록에 있는 구매처를 고르거나 새 이름을 쓴다.
 */
function PlaceChips({
  date,
  store,
  storeOptions,
  onChange,
  onPanel = false,
}: {
  date: string;
  store: string;
  storeOptions: string[];
  onChange: (updates: { date?: string; store?: string }) => void;
  onPanel?: boolean;
}) {
  const [open, setOpen] = useState<'date' | 'store' | null>(null);
  const [draft, setDraft] = useState(store);
  const close = () => setOpen(null);
  const pickStore = (value: string) => {
    onChange({ store: value.trim() });
    close();
  };
  const query = draft.trim();
  const shownStores = [...new Set(storeOptions)].filter((s) => !query || s.includes(query));

  return (
    <div className="flex min-w-0 gap-2">
      <SheetChip
        ariaLabel="날짜 바꾸기"
        label={longDate(date)}
        placeholder="날짜"
        onPanel={onPanel}
        onClick={() => setOpen('date')}
      />
      <SheetChip
        ariaLabel="구매처 바꾸기"
        label={store}
        placeholder="구매처"
        onPanel={onPanel}
        onClick={() => {
          setDraft(store);
          setOpen('store');
        }}
      />

      <BottomSheet open={open === 'date'} onClose={close}>
        <BottomSheet.Header heading="날짜" />
        <BottomSheet.Content className="relative pb-6">
          <Calendar
            mode="single"
            selected={new Date(date)}
            defaultMonth={new Date(date)}
            disabled={{ after: new Date() }}
            onSelect={(d) => {
              if (d) onChange({ date: format(d, 'yyyy-MM-dd') });
              close();
            }}
            className="mx-auto w-full max-w-[340px] border-none p-0"
          />
        </BottomSheet.Content>
      </BottomSheet>

      <BottomSheet open={open === 'store'} onClose={close}>
        <BottomSheet.Header heading="구매처" />
        <BottomSheet.Content className="flex flex-col gap-1 pb-2">
          <Input
            value={draft}
            placeholder="구매처 이름"
            aria-label="구매처 이름"
            className={fieldClass}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                pickStore(draft);
              }
            }}
            enterKeyHint="done"
            autoComplete="off"
          />
          <ul className="flex flex-col pt-2">
            {shownStores.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  onClick={() => pickStore(name)}
                  className={cn(
                    'flex h-14 w-full items-center justify-between rounded-xl px-2 text-left text-[17px] active:bg-[#F2F4F6]',
                    tone.text,
                  )}
                >
                  {name}
                  {name === store ? <Check className="size-5 text-emerald-700" /> : null}
                </button>
              </li>
            ))}
          </ul>
        </BottomSheet.Content>
        <BottomSheet.Footer className="pb-5">
          <CTAPrimitive type="button" onClick={() => pickStore(draft)}>
            확인
          </CTAPrimitive>
        </BottomSheet.Footer>
      </BottomSheet>
    </div>
  );
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

  const step = resolveAmountStep(item.unit);
  const min = resolveAmountMin(item.unit);
  const setCount = (n: number) =>
    onChange({ count: normalizeAmountByUnit(Math.max(min, n), item.unit) });

  // 펼친 품목은 입력줄 바로 위(엄지가 닿는 아래쪽)로 스크롤된다. 그래서 자주 고치는 가격, 수량, 분류를 위에,
  // 드물게 고치는 브랜드, 날짜·구매처를 아래에 두고, 맨 아래 줄은 [삭제 | 완료]로 하단 버튼과 같은 방향(주 행동이 오른쪽)을 지킨다.
  return (
    <div
      ref={rootRef}
      data-expanded-item
      className={cn('flex scroll-mb-64 flex-col gap-3 rounded-2xl p-4', tone.panel)}
    >
      <div className="flex items-start gap-2">
        <SuggestInput
          className="flex-1"
          value={item.name}
          onChange={(name) => onChange({ name })}
          options={nameOptions}
          placeholder="품목 이름"
          onPanel
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
        <span className={cn('text-sm font-medium', tone.red)}>
          저장하지 못했어요. {error || '다시 저장해 주세요'}
        </span>
      ) : null}

      <div className="flex h-11 items-center justify-between">
        <FieldLabel>수량</FieldLabel>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="수량 감소"
            onClick={() => setCount(item.count - step)}
            disabled={item.count <= min}
            className={cn(
              'flex size-11 items-center justify-center rounded-full bg-white text-xl disabled:opacity-40',
              tone.text,
            )}
          >
            −
          </button>
          <span className={cn('w-8 text-center text-base font-semibold tabular-nums', tone.text)}>
            {item.count}
          </span>
          <button
            type="button"
            aria-label="수량 증가"
            onClick={() => setCount(item.count + step)}
            className={cn(
              'flex size-11 items-center justify-center rounded-full bg-white text-xl',
              tone.text,
            )}
          >
            +
          </button>
          <Select
            value={item.unit}
            onValueChange={(u) =>
              onChange({
                unit: u as IngredientUnit,
                count: resolveAmountMin(u as IngredientUnit),
              })
            }
          >
            <Select.Trigger className="h-11 w-16 rounded-xl border-0 bg-white shadow-none">
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

      <div ref={chipsRef} className="flex items-center gap-2">
        <FieldLabel>분류</FieldLabel>
        <ChipRow className="pb-0">
          {categories.map((c) => (
            <Chip
              key={c.id}
              selected={c.id === item.category_id}
              onClick={() => onChange({ category_id: c.id })}
              className={cn(
                'h-10 border-0 px-3.5 py-0 text-sm',
                c.id === item.category_id
                  ? 'bg-[#191F28] text-white'
                  : cn('bg-white hover:bg-white', tone.sub),
              )}
            >
              {c.label}
            </Chip>
          ))}
        </ChipRow>
      </div>

      <div className="flex items-start gap-2">
        <span className="flex h-12 items-center">
          <FieldLabel>브랜드</FieldLabel>
        </span>
        <SuggestInput
          className="flex-1"
          value={item.brand}
          onChange={(brand) => onChange({ brand })}
          options={brandOptions}
          placeholder="없으면 비워 두세요"
          onPanel
        />
      </div>

      <div className="flex items-center gap-2">
        <FieldLabel>날짜·구매처</FieldLabel>
        <PlaceChips
          date={item.date}
          store={item.store}
          storeOptions={storeOptions}
          onChange={onChange}
          onPanel
        />
      </div>

      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          type="button"
          onClick={onRemove}
          className={cn('h-11 rounded-xl bg-white text-[15px] font-semibold', tone.sub)}
        >
          삭제
        </button>
        <button
          type="button"
          onClick={onDone}
          className="h-11 rounded-xl bg-emerald-50 text-[15px] font-semibold text-emerald-800"
        >
          완료
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
      Toast.success(`${savedTotal}개 저장했어요`);
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

  let ctaLabel = targets.length > 0 ? `${targets.length}개 저장` : '저장';
  if (isSaving) ctaLabel = `저장 중... (${doneCount}/${targets.length})`;
  else if (isRetry) ctaLabel = `실패한 ${targets.length}개 다시 저장`;

  /** 품목을 어디서 왔는지(영수증, 직접)와 날짜·구매처로 묶는다. 묶음 머리에 한 번만 쓰고 행에서는 뺀다. */
  function groupKey(item: StagedItem) {
    if (item.source === 'receipt') return `r|${item.store}|${item.date}`;
    return differsFromDefaults(item) ? `d|${item.store}|${item.date}` : 'd|default';
  }
  function groupLabel(item: StagedItem) {
    const place = `${item.store || '구매처 없음'} · ${longDate(item.date)}`;
    return item.source === 'receipt' ? `영수증 · ${place}` : `직접 쓴 품목 · ${place}`;
  }
  const groupKeys = [...new Set(listItems.map(groupKey))];
  const showGroups =
    groupKeys.length > 1 || (groupKeys.length === 1 && groupKeys[0] !== 'd|default');

  // 시선과 엄지 배치(시안 v4)
  // - 위(엄지가 닿기 어려운 곳): 뒤로, [장보기 | 외식], 날짜·구매처. 드물게 바꾸고 잘못 누르면 되돌리기 번거로운 것만 둔다.
  //   Z 패턴의 첫 줄이다. 왼쪽 위 전환 탭 → 오른쪽 위 날짜·구매처.
  // - 가운데: 품목 목록. 글이 많아 F 패턴으로 읽힌다. 이름은 왼쪽 줄, 가격은 오른쪽 줄로 세워 훑기 쉽게 한다.
  // - 아래(엄지가 편한 곳): 입력칸, 영수증, 합계, 저장. Z 패턴의 끝(오른쪽 아래)이 주 버튼이다.
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
      {/* 화면 높이를 채우고 품목 목록을 아래(입력줄 쪽)부터 쌓는다. 품목이 적을 때도 누를 품목이 엄지가 편한 아래쪽에 온다. */}
      <div
        className={cn(
          'relative flex min-h-[calc(100dvh-56px)] flex-col',
          // 되돌리기 알림이나 추천 칩이 떠도 마지막 품목이 가려지지 않게 하단 자리를 늘린다.
          removed || chips.length > 0 ? 'pb-56' : 'pb-40',
        )}
      >
        {/* 위(엄지가 닿기 어려운 곳)에는 드물게 바꾸는 것만 둔다. 첫 줄 [장보기 | 외식] 전환, 둘째 줄 새 품목의 날짜·구매처. */}
        <div
          role="tablist"
          className="flex gap-1 border-b border-[#F2F4F6] px-3 text-[17px] font-semibold"
        >
          <button
            type="button"
            role="tab"
            aria-selected
            className={cn('h-12 min-w-12 border-b-2 border-[#191F28] px-2', tone.text)}
          >
            장보기
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={false}
            onClick={onOpenDining}
            className={cn('h-12 min-w-12 px-2', tone.hint)}
          >
            외식
          </button>
        </div>
        {/* 합계는 버튼 위 작은 글자 대신 맨 위에 크게 둔다(시안 v5). 그 아래 한 줄에 새 품목의 날짜와 구매처 버튼. */}
        <div className="flex flex-col gap-3 px-5 pt-5 pb-4">
          <span
            data-total
            className={cn(
              'text-[28px] leading-tight font-bold tabular-nums',
              targets.length > 0 ? tone.text : 'text-[#B0B8C1]',
            )}
          >
            {total.toLocaleString()}원
          </span>
          <PlaceChips
            date={defaults.date}
            store={defaults.store}
            storeOptions={storeNames}
            onChange={changeDefaults}
          />
        </div>

        {/* 빈 안내는 화면 세로 정가운데에 둔다. 품목이 생기면 아래(입력줄 쪽)부터 쌓는다. */}
        {listItems.length === 0 && unknownItems.length === 0 ? (
          <p
            className={cn(
              'pointer-events-none absolute inset-x-0 top-[calc(50%-15px)] -translate-y-1/2 text-center text-[17px] font-semibold',
              tone.sub,
            )}
          >
            아직 담은 품목이 없어요
          </p>
        ) : null}

        {/* 아래 묶음: 저장 결과, 확인 필요, 품목 목록. 모두 입력줄 쪽(엄지가 편한 곳)에 붙는다. */}
        <div className="mt-auto flex flex-col">
          {lastSavedCount > 0 && !isSaving ? (
            <div
              className={cn('flex items-center gap-2 px-5 pt-4 text-[15px] font-medium', tone.text)}
            >
              <span className="flex size-5 items-center justify-center rounded-full bg-emerald-600">
                <Check className="size-3 text-white" strokeWidth={3} />
              </span>
              {`${lastSavedCount}개를 저장했어요`}
            </div>
          ) : null}

          {unknownItems.length > 0 ? (
            <div className={cn('mx-4 mt-3 flex flex-col gap-3 rounded-2xl p-4', tone.panel)}>
              <div className="flex flex-col gap-1">
                <span className={cn('text-[15px] font-semibold', tone.text)}>
                  저장됐는지 확인해 주세요 · {unknownItems.length}개
                </span>
                <p className={cn('text-[15px]', tone.sub)}>연결이 끊겨 저장됐는지 몰라요</p>
              </div>
              {unknownItems.map((item) => (
                <div key={item.id} className="flex flex-col gap-3">
                  <div className="flex items-center justify-between text-base">
                    <span className={cn('font-semibold', tone.text)}>{item.name}</span>
                    <span className={cn('font-semibold tabular-nums', tone.text)}>
                      {item.price.toLocaleString()}원
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className={cn('h-11 rounded-xl bg-white text-[15px] font-semibold', tone.sub)}
                      onClick={() => {
                        removeItems([item.id]);
                        onComplete();
                      }}
                    >
                      내역 보기
                    </button>
                    <button
                      type="button"
                      className="h-11 rounded-xl bg-emerald-50 text-[15px] font-semibold text-emerald-800"
                      onClick={() => removeItems([item.id])}
                    >
                      확인했어요
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex flex-col px-2 pt-2">
            {listItems.map((item, index) => {
              const state = stateOf(item);
              const header =
                showGroups && (index === 0 || groupKey(listItems[index - 1]) !== groupKey(item)) ? (
                  <div
                    key={`h-${item.id}`}
                    className={cn('px-3 pt-4 pb-1 text-[13px] font-medium', tone.sub)}
                  >
                    {groupLabel(item)}
                  </div>
                ) : null;
              if (item.id === expandedId) {
                return [
                  header,
                  <div key={item.id} className="px-2 py-1">
                    <ExpandedItem
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
                  </div>,
                ];
              }

              const reason = invalidReason(item);
              const cat = resolveCategory(item);
              const showIcon = state === 'saving' || state === 'success';
              const isPriceUnknown = item.price === 0;
              // 설명 줄에는 기본값(분류 기타, 1개)이 아닌 것만 쓴다. 출처와 날짜·구매처는 묶음 머리에 있다.
              const meta: string[] = [];
              if (cat.label !== '기타') meta.push(cat.label);
              if (!(item.unit === 'count' && item.count === 1)) {
                meta.push(formatIngredientAmount(item.count, item.unit, true));
              }
              if (item.brand) meta.push(item.brand);

              // TDS 리스트 행 모양: 테두리 없이 여백으로 나누고, 이름·설명은 왼쪽, 가격은 오른쪽 한 줄로 세운다.
              return [
                header,
                <button
                  key={item.id}
                  type="button"
                  data-item-row
                  onClick={() => expandLine(item)}
                  disabled={isSaving}
                  className={cn(
                    'flex min-h-14 flex-col justify-center gap-0.5 rounded-xl px-3 py-3 text-left active:bg-[#F2F4F6]',
                  )}
                >
                  <div className="flex items-center gap-2">
                    {showIcon ? <SaveStateIcon state={state} /> : null}
                    <span
                      className={cn('min-w-0 flex-1 truncate text-[17px] font-semibold', tone.text)}
                    >
                      {item.name}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 text-[17px] tabular-nums',
                        isPriceUnknown
                          ? cn('font-medium', tone.orange)
                          : cn('font-semibold', tone.text),
                      )}
                    >
                      {isPriceUnknown ? '가격 없음' : `${item.price.toLocaleString()}원`}
                    </span>
                  </div>
                  {meta.length > 0 ? (
                    <span className={cn('min-w-0 truncate text-sm', tone.hint)}>
                      {meta.join(' · ')}
                    </span>
                  ) : null}
                  {state === 'error' ? (
                    <span className={cn('text-sm font-medium', tone.red)}>
                      저장하지 못했어요. {errors[item.id] || '다시 저장해 주세요'}
                    </span>
                  ) : null}
                  {state !== 'error' && reason ? (
                    <span className={cn('text-sm font-medium', tone.orange)}>{reason}</span>
                  ) : null}
                </button>,
              ];
            })}
          </div>
        </div>
      </div>

      {/* 하단 고정(엄지가 편한 곳): 되돌리기 → 추천 칩 → 입력줄 → 합계 → 저장. 왼쪽은 보조, 오른쪽 끝이 주 행동이다. */}
      {/* TDS BottomCTA처럼 화면 맨 아래에 고정하고, 아래 여백은 안전 영역과 20px 중 큰 값, 위는 흰색으로 흐려지는 배경이다. */}
      <div className="fixed right-0 bottom-0 left-0 z-[var(--z-cta)] bg-[linear-gradient(to_top,#fff_88%,rgba(255,255,255,0))] px-4 pt-4 pb-[max(env(safe-area-inset-bottom),20px)]">
        <div className="mx-auto flex w-full max-w-[480px] flex-col gap-2">
          {removed ? (
            <div className="animate-in fade-in slide-in-from-bottom-2 flex h-12 items-center justify-between rounded-2xl bg-[#191F28] px-5 text-[15px] text-white">
              <span className="min-w-0 truncate">
                {removed.item.name.trim() || '빈 품목'}
                {removed.item.name.trim() ? objectParticle(removed.item.name) : '을'} 삭제했어요
              </span>
              <button
                type="button"
                onClick={undoRemove}
                className="h-12 shrink-0 pl-4 font-semibold text-emerald-300"
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
                  role="button"
                  aria-checked={undefined}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addByName(name)}
                  className={cn(
                    'h-10 border-0 bg-[#F2F4F6] px-3.5 py-0 text-[15px] hover:bg-[#F2F4F6]',
                    tone.text,
                  )}
                >
                  {name}
                </Chip>
              ))}
            </ChipRow>
          ) : null}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Plus
                className={cn(
                  'pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2',
                  tone.hint,
                )}
              />
              <Input
                ref={barRef}
                value={draft}
                placeholder="품목 이름"
                aria-label="품목 이름"
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
                className={cn(fieldClass, 'pl-11')}
              />
            </div>
            <button
              type="button"
              onClick={openReceipt}
              disabled={isSaving}
              className={cn(
                'flex h-12 shrink-0 items-center gap-1.5 rounded-xl bg-[#F2F4F6] px-4 text-[15px] font-semibold active:bg-[#E5E8EB]',
                tone.text,
              )}
            >
              <Camera className="size-5" />
              영수증
            </button>
          </div>
          {/* 주 버튼은 앱 공용 하단 CTA(TDS FixedBottomCTA에 대응) 모양 그대로 쓴다. 입력줄은 그 위 topAccessory 자리다. */}
          <CTAPrimitive
            type="button"
            color="confirm"
            variant="filled"
            aria-live="polite"
            className="mt-1"
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
