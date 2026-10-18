'use client';

import { useEffect, useMemo, useRef } from 'react';

import { AlertTriangle, Check, ChevronLeft, Loader2, X } from 'lucide-react';
import { AppScreen } from '@stackflow/plugin-basic-ui';
import { useQueryClient } from '@tanstack/react-query';

import { cn } from '@/commons/lib';
import { Button, Checkbox, CTAButton, Toast } from '@/commons/ui';

import { useIngredientCategoriesQuery } from '@/entities/ingredient-category';

import {
  invalidateAfterIngredientAdd,
  useDispatchHouseholdActivityMutation,
} from '../api/mutations';
import { type StagedItem } from '../lib/parseAiResponse';
import { setPendingPromptEditCallback } from '../model/promptIngredientEditStore';
import { type SaveState, usePromptIngredientStore } from '../model/promptIngredientStore';

import { createIngredientFormSchema } from './IngredientForm';
import { IngredientItem } from './IngredientItem';

interface PromptIngredientStagingScreenProps {
  onClose: () => void;
  onComplete: () => void;
  householdId: string;
  userId: string;
  onEditItem: (item: StagedItem) => void;
  /** 직접 입력의 "N건 저장"으로 들어오면 열자마자 저장한다 */
  autoSave?: boolean;
}

const rowBg: Record<SaveState, string> = {
  idle: 'bg-white',
  saving: 'bg-blue-50',
  success: 'bg-[oklch(0.96_0.05_145)]',
  error: 'border-red-200 bg-[oklch(0.97_0.03_25)]',
  unknown: 'bg-amber-50',
};

type LineResult = { kind: 'success' } | { kind: 'error'; message: string } | { kind: 'unknown' };

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
        name: item.name,
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
        'rounded px-1.5 py-0.5 text-[11px] font-medium',
        source === 'direct' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700',
      )}
    >
      {source === 'direct' ? '직접 입력' : '영수증'}
    </span>
  );
}

/**
 * 담기 목록. 영수증 줄과 직접 입력으로 담은 줄을 한 목록에서 확인하고 "N건 저장" 한 번으로 저장한다.
 * 실패한 줄은 사유와 함께 남아 그 줄만 다시 저장하고, 응답이 끊긴 줄은 "저장 확인 필요"로 따로 둔다.
 */
export function PromptIngredientStagingScreen({
  onClose,
  onComplete,
  householdId,
  userId,
  onEditItem,
  autoSave = false,
}: PromptIngredientStagingScreenProps) {
  const {
    items,
    checkedIds,
    saveStates,
    errors,
    lastSavedCount,
    toggleCheck,
    toggleAll,
    updateItem,
    setSaveState,
    removeItems,
    addSavedCount,
    reset,
  } = usePromptIngredientStore();
  const queryClient = useQueryClient();
  const dispatchActivityMutation = useDispatchHouseholdActivityMutation();
  const { data: categories = [] } = useIngredientCategoriesQuery(householdId);
  const schema = useMemo(
    () => createIngredientFormSchema(categories.map((c) => c.id)),
    [categories],
  );

  const stateOf = (item: StagedItem) => saveStates[item.id] ?? 'idle';
  const isSaving = items.some((i) => stateOf(i) === 'saving');
  const listItems = items.filter((i) => stateOf(i) !== 'unknown');
  const unknownItems = items.filter((i) => stateOf(i) === 'unknown');
  const failedItems = listItems.filter((i) => stateOf(i) === 'error');

  /** 단건 폼과 같은 규칙으로 검사한다. 걸린 줄은 사유와 함께 저장에서 빠진다. */
  function invalidReason(item: StagedItem): string | null {
    if (categories.length === 0) return null;
    const result = schema.safeParse(item);
    if (result.success) return null;
    const issue = result.error.issues[0];
    if (issue.path[0] === 'price' && item.price === 0) return '가격을 못 읽었어요 · 눌러서 입력';
    return issue.message;
  }

  const targets = listItems.filter(
    (i) => checkedIds.includes(i.id) && stateOf(i) !== 'success' && !invalidReason(i),
  );
  const isRetry = targets.length > 0 && targets.every((i) => stateOf(i) === 'error');
  const total = listItems.reduce((sum, i) => sum + i.price, 0);
  const unknownPriceCount = listItems.filter((i) => i.price === 0).length;
  const doneCount = targets.filter((i) => ['success', 'error'].includes(stateOf(i))).length;
  const allChecked = listItems.length > 0 && listItems.every((i) => checkedIds.includes(i.id));

  function resolveCategory(item: StagedItem) {
    const cat = categories.find((c) => c.id === item.category_id);
    return { label: cat?.label ?? '기타', emoji: cat?.emoji };
  }

  function openEdit(item: StagedItem) {
    if (isSaving) return;
    setPendingPromptEditCallback((updates) => updateItem(item.id, updates));
    onEditItem(item);
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
        successNames.push(item.name);
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

    const leftover = usePromptIngredientStore
      .getState()
      .items.filter((i) => !successIds.includes(i.id));
    if (problemCount === 0 && leftover.length === 0) {
      const savedTotal = usePromptIngredientStore.getState().lastSavedCount + successNames.length;
      reset();
      Toast.success(`${savedTotal}건을 모두 저장했어요`);
      onComplete();
      return;
    }
    // 저장된 줄은 목록에서 빼고, 남은 줄(실패, 확인 필요, 아직 안 고친 줄)만 둔다.
    removeItems(successIds);
    addSavedCount(successNames.length);
  }

  const autoSavedRef = useRef(false);
  useEffect(() => {
    if (!autoSave || autoSavedRef.current || categories.length === 0) return;
    autoSavedRef.current = true;
    void saveAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSave, categories.length]);

  let ctaLabel = `${targets.length}건 저장`;
  if (isSaving) ctaLabel = `저장 중... (${doneCount}/${targets.length})`;
  else if (isRetry) ctaLabel = `실패 ${targets.length}건 다시 저장`;
  else if (targets.length === 0 && listItems.length === 0) ctaLabel = '닫기';

  const ctaIsClose = !isSaving && targets.length === 0 && listItems.length === 0;

  return (
    <AppScreen
      className="pointer-events-auto"
      appBar={{
        title: '담은 목록',
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
      <div className="flex flex-col gap-3 px-4 pt-4 pb-28">
        {lastSavedCount > 0 && !isSaving ? (
          <div className="flex items-center gap-2 rounded-lg bg-[oklch(0.96_0.05_145)] px-3 py-2.5 text-sm font-medium text-green-800">
            <Check className="size-4" strokeWidth={3} />
            {lastSavedCount}건을 저장했어요
            {failedItems.length > 0 ? ` · 실패 ${failedItems.length}건은 아래에 남겼어요` : ''}
          </div>
        ) : null}

        {listItems.length > 0 ? (
          <>
            {/* 담은 건수와 합계 */}
            <div className="flex items-end justify-between">
              <div className="flex flex-col">
                <span className="text-base font-semibold text-gray-900">
                  담은 {listItems.length}건 · 합계 {total.toLocaleString()}원
                </span>
                {unknownPriceCount > 0 ? (
                  <span className="text-xs text-orange-500">
                    금액 모름 {unknownPriceCount}건은 합계에서 빠져요
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                className="text-sm font-medium text-gray-600"
                onClick={toggleAll}
                disabled={isSaving}
              >
                {allChecked ? '전체 해제' : '전체 선택'}
              </button>
            </div>

            {listItems.map((item) => {
              const state = stateOf(item);
              const checked = checkedIds.includes(item.id);
              const reason = invalidReason(item);
              const showIcon = state === 'saving' || state === 'success';

              return (
                <div
                  key={item.id}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border px-3 py-2.5',
                    'transition-[background-color] duration-500 ease-out',
                    rowBg[state],
                  )}
                >
                  <div className="shrink-0 pt-0.5">
                    {showIcon ? (
                      <SaveStateIcon state={state} />
                    ) : (
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleCheck(item.id)}
                        disabled={isSaving}
                      />
                    )}
                  </div>

                  <button
                    type="button"
                    className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
                    onClick={() => openEdit(item)}
                    disabled={isSaving}
                  >
                    <IngredientItem
                      name={item.name}
                      brand={item.brand}
                      price={item.price}
                      count={item.count}
                      unit={item.unit}
                      store={item.store}
                      categoryLabel={resolveCategory(item).label}
                      categoryEmoji={resolveCategory(item).emoji}
                      size="sm"
                    />
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <SourceTag source={item.source} />
                      {state === 'error' ? (
                        <span className="text-xs font-medium text-red-600">
                          저장 실패 · {errors[item.id]}
                        </span>
                      ) : reason ? (
                        <span className="text-xs font-medium text-orange-500">
                          {reason} · 저장에서 빠져요
                        </span>
                      ) : null}
                    </div>
                  </button>
                </div>
              );
            })}
          </>
        ) : null}

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
              <div key={item.id} className="flex flex-col gap-0.5 rounded-lg bg-white px-3 py-2.5">
                <IngredientItem
                  name={item.name}
                  brand={item.brand}
                  price={item.price}
                  count={item.count}
                  unit={item.unit}
                  store={item.store}
                  categoryLabel={resolveCategory(item).label}
                  categoryEmoji={resolveCategory(item).emoji}
                  size="sm"
                />
                <div className="mt-1.5 flex gap-2">
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
        color={ctaIsClose ? 'cancel' : 'confirm'}
        variant={ctaIsClose ? 'subtle' : 'filled'}
        onClick={ctaIsClose ? onComplete : saveAll}
        disabled={isSaving || (!ctaIsClose && targets.length === 0)}
      >
        {ctaLabel}
      </CTAButton>
    </AppScreen>
  );
}
