'use client';

import { useEffect, useMemo, useState } from 'react';

import { format } from 'date-fns';
import { Check, ChevronLeft, Loader2, Plus } from 'lucide-react';
import { AppScreen } from '@stackflow/plugin-basic-ui';
import { useQueryClient } from '@tanstack/react-query';

import { cn } from '@/commons/lib';
import { Button, CTAPrimitive, Toast } from '@/commons/ui';

import {
  resolveDefaultCategoryId,
  useIngredientCategoriesQuery,
} from '@/entities/ingredient-category';

import {
  invalidateAfterIngredientAdd,
  useDispatchHouseholdActivityMutation,
  useParseReceiptMutation,
} from '../api/mutations';
import { useIngredientBrandNamesQuery, useStoreNamesQuery } from '../api/queries';
import { compressReceiptImage } from '../lib/compressReceiptImage';
import { type StagedItem } from '../lib/parseAiResponse';
import { type SaveState, usePromptIngredientStore } from '../model/promptIngredientStore';
import { useReceiptInbox } from '../model/receiptInbox';

import { createIngredientFormSchema } from './IngredientForm';
import { PlaceChips } from './PlaceChips';
import { type ItemDraft, StagedItemSheet } from './StagedItemSheet';
import { longDate, objectParticle, tone } from './StagingParts';

/** 품목 한 행의 본문. 식비 탭 행(FoodExpenseItem)을 그대로 쓰도록 앱 층에서 넘겨받는다. */
export type StagedRowRenderer = (
  item: StagedItem,
  info: { categoryLabel: string; categoryEmoji?: string; missingPriceLabel?: string },
) => React.ReactNode;

interface PromptIngredientStagingScreenProps {
  onClose: () => void;
  onComplete: () => void;
  householdId: string;
  userId: string;
  /** 품목명 제안(검색 화면과 같은 목록) */
  suggestions?: string[];
  renderRow?: StagedRowRenderer;
}

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

const isBlank = (item: StagedItem) => item.source === 'direct' && !item.name.trim();

interface Removed {
  item: StagedItem;
  index: number;
  state: SaveState;
  error?: string;
}

type SheetState = { mode: 'add' } | { mode: 'edit'; id: string; focus: 'price' | null } | null;

/**
 * 장보기 담기(시안 v6). 이 화면이 맡는 일은 "담은 품목을 확인하고 한 번에 저장" 하나다. 화면에 입력칸이 없다.
 * - 위: 합계와 새 품목의 [날짜 ▾] [구매처 ▾].
 * - 가운데: 담은 품목 행(식비 탭 행 모양). 가격 없는 품목은 맨 위에 두고 오른쪽에 주황 "가격 입력".
 *   행을 누르면 품목 시트가 '고치기'로 열린다. 목록 끝 "+ 품목 추가"는 품목 시트를 '넣기'로 연다.
 * - 아래: 앱 공용 하단 CTA "N개 저장" 하나.
 * 품목 쓰기는 품목 시트, 날짜·구매처는 각 시트, 영수증 읽기는 식비 탭 + 시트에서 고른 사진을 이 화면이 받아 읽는다.
 */
export function PromptIngredientStagingScreen({
  onClose,
  onComplete,
  householdId,
  userId,
  suggestions = [],
  renderRow,
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
  const parseReceipt = useParseReceiptMutation();
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
  const [sheet, setSheet] = useState<SheetState>(null);
  // 시트가 닫히는 동안에도 마지막 모양(넣기/고치기)을 그대로 보인다.
  const [lastSheet, setLastSheet] = useState<NonNullable<SheetState>>({ mode: 'add' });
  if (sheet && sheet !== lastSheet) setLastSheet(sheet);
  const [removed, setRemoved] = useState<Removed | null>(null);
  const [reading, setReading] = useState(0);
  const pendingReceipts = useReceiptInbox((s) => s.files.length);

  // 처음 열 때 담은 것도 읽을 영수증도 없으면 품목 시트를 바로 연다. 영수증 읽기가 우편함을 비우기 전에 정한다.
  const [startEmpty] = useState(
    () =>
      usePromptIngredientStore.getState().items.every(isBlank) &&
      useReceiptInbox.getState().files.length === 0,
  );

  // 지난번에 이름 없이 남은 품목은 치운다.
  useEffect(function dropBlankItems() {
    const store = usePromptIngredientStore.getState();
    const blanks = store.items.filter(isBlank).map((i) => i.id);
    if (blanks.length > 0) store.removeItems(blanks);
  }, []);

  useEffect(
    function openSheetWhenEmpty() {
      if (!startEmpty) return;
      const timer = window.setTimeout(() => setSheet({ mode: 'add' }), 350);
      return () => window.clearTimeout(timer);
    },
    [startEmpty],
  );

  // 식비 탭에서 고른 영수증 사진을 받아 읽는다. 읽는 동안 "영수증 2장 읽는 중" 한 줄이 보이고, 끝나면 목록에 붙는다.
  useEffect(
    function readQueuedReceipts() {
      if (pendingReceipts === 0 || categories.length === 0) return;
      const files = useReceiptInbox.getState().take();
      setReading((n) => n + files.length);
      void (async () => {
        for (const file of files) {
          try {
            const { base64, mimeType } = await compressReceiptImage(file);
            const { items: parsed } = await parseReceipt.mutateAsync({
              imageBase64: base64,
              mimeType,
              categories,
              today: format(new Date(), 'yyyy-MM-dd'),
            });
            addItems(parsed.map((item) => ({ ...item, source: 'receipt' as const })));
          } catch (err) {
            console.error('[receipt-parse]', err instanceof Error ? (err.cause ?? err) : err);
            Toast.error('영수증을 읽지 못했어요. 다시 골라 주세요');
          } finally {
            setReading((n) => n - 1);
          }
        }
      })();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendingReceipts, categories.length],
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
  const editing =
    lastSheet.mode === 'edit' ? (items.find((i) => i.id === lastSheet.id) ?? null) : null;

  /** 단건 폼과 같은 규칙으로 검사한다. 걸린 품목은 저장에서 빠진다. */
  function invalidReason(item: StagedItem): string | null {
    if (categories.length === 0) return null;
    const result = schema.safeParse(item);
    if (result.success) return null;
    return result.error.issues[0].message;
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

  /** 품목 시트의 "담기": 새 품목의 날짜·구매처로 목록 끝에 담는다. 가격이 비어도 담고, 목록 맨 위에서 가격을 받는다. */
  function addFromSheet(draft: ItemDraft) {
    addItems([
      {
        id: crypto.randomUUID(),
        ...draft,
        store: defaults.store,
        date: defaults.date,
        category_code: '',
        source: 'direct',
      },
    ]);
  }

  function saveFromSheet(id: string, draft: ItemDraft) {
    updateItem(id, draft);
    // 실패한 품목을 고쳤으면 다시 저장 대상으로 돌린다.
    if (stateOf(items.find((i) => i.id === id)!) === 'error') setSaveState(id, 'idle');
    setSheet(null);
  }

  function removeLine(item: StagedItem) {
    const index = usePromptIngredientStore.getState().items.findIndex((i) => i.id === item.id);
    setRemoved({ item, index, state: stateOf(item), error: errors[item.id] });
    removeItems([item.id]);
    setSheet(null);
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

  /** 날짜·구매처를 바꾸면 앞으로 담을 품목과, 같은 값으로 직접 담은 품목이 함께 바뀐다. 영수증 품목은 그대로다. */
  function changeDefaults(updates: Partial<LineDefaults>) {
    for (const item of items) {
      if (item.source !== 'direct') continue;
      if (item.store === defaults.store && item.date === defaults.date)
        updateItem(item.id, updates);
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
      Toast.success(`${savedTotal}개 저장했어요`);
      onComplete();
      return;
    }
    // 저장된 품목과 빈 품목은 목록에서 빼고, 남은 품목(실패, 확인 필요, 가격 없는 품목)만 둔다.
    removeItems([...successIds, ...blankIds]);
    addSavedCount(successNames.length);
  }

  let ctaLabel = targets.length > 0 ? `${targets.length}개 저장` : '저장';
  if (isSaving) ctaLabel = `저장 중... (${doneCount}/${targets.length})`;
  else if (isRetry) ctaLabel = `실패한 ${targets.length}개 다시 저장`;

  // 가격 없는 품목은 맨 위로 모은다. 나머지는 담은 순서대로, 영수증은 영수증마다 묶음 머리를 둔다.
  const needsPrice = (item: StagedItem) => item.price === 0 && stateOf(item) !== 'success';
  const priceless = listItems.filter(needsPrice);
  const rest = listItems.filter((i) => !needsPrice(i));
  function groupKey(item: StagedItem) {
    return item.source === 'receipt' ? `r|${item.store}|${item.date}` : 'd';
  }
  function groupLabel(item: StagedItem) {
    return item.source === 'receipt'
      ? `영수증 · ${item.store || '구매처 없음'} · ${longDate(item.date)}`
      : '직접 쓴 품목';
  }
  const showGroups = rest.some((i) => i.source === 'receipt');

  function renderLine(item: StagedItem) {
    const state = stateOf(item);
    const cat = resolveCategory(item);
    const reason = item.price === 0 ? null : invalidReason(item);
    return (
      <button
        key={item.id}
        type="button"
        data-item-row
        disabled={isSaving}
        onClick={() =>
          setSheet({ mode: 'edit', id: item.id, focus: item.price === 0 ? 'price' : null })
        }
        className="text-foreground flex w-full appearance-none flex-col gap-1 rounded-lg border bg-white px-3 py-2.5 text-left"
      >
        {renderRow ? (
          renderRow(item, {
            categoryLabel: cat.label,
            categoryEmoji: cat.emoji,
            missingPriceLabel: '가격 입력',
          })
        ) : (
          <span>{item.name}</span>
        )}
        {state === 'error' ? (
          <span className={cn('text-[13px] font-medium', tone.red)}>
            저장하지 못했어요. {errors[item.id] || '다시 저장해 주세요'}
          </span>
        ) : null}
        {state !== 'error' && reason ? (
          <span className={cn('text-[13px] font-medium', tone.orange)}>{reason}</span>
        ) : null}
      </button>
    );
  }

  const groupHeaderClass = 'flex items-center px-1 pt-2 text-xs font-semibold text-gray-500';

  return (
    <AppScreen
      className="pointer-events-auto"
      appBar={{
        title: '장보기 담기',
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
      <div className="relative flex min-h-[calc(100dvh-56px)] flex-col pb-40">
        {/* 위: 합계를 크게, 그 아래 새 품목의 날짜와 구매처. */}
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

        {listItems.length === 0 && unknownItems.length === 0 && reading === 0 ? (
          <p
            className={cn(
              'pointer-events-none absolute inset-x-0 top-[calc(50%-15px)] -translate-y-1/2 text-center text-[17px] font-semibold',
              tone.sub,
            )}
          >
            아직 담은 품목이 없어요
          </p>
        ) : null}

        <div className="flex flex-col gap-1.5 px-4">
          {reading > 0 ? (
            <div
              role="status"
              className={cn('flex h-12 items-center gap-2 px-1 text-[15px] font-medium', tone.text)}
            >
              <Loader2 className="size-4 animate-spin text-emerald-600" />
              영수증 {reading}장 읽는 중
            </div>
          ) : null}

          {lastSavedCount > 0 && !isSaving ? (
            <div
              className={cn('flex items-center gap-2 px-1 py-2 text-[15px] font-medium', tone.text)}
            >
              <span className="flex size-5 items-center justify-center rounded-full bg-emerald-600">
                <Check className="size-3 text-white" strokeWidth={3} />
              </span>
              {`${lastSavedCount}개를 저장했어요`}
            </div>
          ) : null}

          {unknownItems.length > 0 ? (
            <div className={cn('flex flex-col gap-3 rounded-2xl p-4', tone.panel)}>
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

          {priceless.length > 0 && showGroups ? (
            <div className={groupHeaderClass}>가격을 넣으면 저장돼요</div>
          ) : null}
          {priceless.map(renderLine)}

          {rest.map((item, index) => {
            const header =
              showGroups && (index === 0 || groupKey(rest[index - 1]) !== groupKey(item)) ? (
                <div key={`h-${item.id}`} className={groupHeaderClass}>
                  {groupLabel(item)}
                </div>
              ) : null;
            return [header, renderLine(item)];
          })}

          {/* 시트를 닫아 목록이 비어 있어도 여기서 다시 연다. */}
          <button
            type="button"
            disabled={isSaving}
            onClick={() => setSheet({ mode: 'add' })}
            className={cn(
              'flex h-12 items-center gap-1.5 self-start px-1 text-[15px] font-semibold',
              tone.label,
            )}
          >
            <Plus className="size-5" />
            품목 추가
          </button>
        </div>
      </div>

      {/* 하단 고정: 되돌리기 → 저장. 채운 초록 버튼은 이것 하나다. */}
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
          <CTAPrimitive
            type="button"
            color="confirm"
            variant="filled"
            aria-live="polite"
            onClick={saveAll}
            disabled={isSaving || targets.length === 0}
          >
            {ctaLabel}
          </CTAPrimitive>
        </div>
      </div>

      <StagedItemSheet
        open={sheet !== null}
        mode={lastSheet.mode}
        item={editing}
        focus={lastSheet.mode === 'edit' ? lastSheet.focus : 'name'}
        categories={categories}
        defaultCategoryId={defaultCategoryId}
        nameOptions={suggestions}
        brandOptions={brandNames}
        basketCount={listItems.length}
        error={editing && stateOf(editing) === 'error' ? errors[editing.id] : undefined}
        onAdd={addFromSheet}
        onSave={saveFromSheet}
        onRemove={removeLine}
        onClose={() => setSheet(null)}
      />
    </AppScreen>
  );
}
