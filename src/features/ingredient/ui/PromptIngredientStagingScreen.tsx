'use client';

import { Check, ChevronLeft, Loader2, X } from 'lucide-react';
import { AppScreen } from '@stackflow/plugin-basic-ui';

import { cn } from '@/commons/lib';
import { Button, Checkbox, CTAButton } from '@/commons/ui';

import { useIngredientCategoriesQuery } from '@/entities/ingredient-category';

import { useAddIngredientMutation, useDispatchHouseholdActivityMutation } from '../api/mutations';
import { type StagedItem } from '../lib/parseAiResponse';
import { setPendingPromptEditCallback } from '../model/promptIngredientEditStore';
import { type SaveState, usePromptIngredientStore } from '../model/promptIngredientStore';

import { IngredientItem } from './IngredientItem';

interface PromptIngredientStagingScreenProps {
  onClose: () => void;
  onComplete: () => void;
  householdId: string;
  userId: string;
  onEditItem: (item: StagedItem) => void;
}

const rowBg: Record<SaveState, string> = {
  idle: 'bg-white',
  saving: 'bg-blue-50',
  success: 'bg-[oklch(0.96_0.05_145)]',
  error: 'bg-[oklch(0.96_0.05_25)]',
};

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

/**
 * 확인 버튼 문구로 저장 결과를 미리 보여 준다(완료 화면을 따로 두지 않는다).
 * 가격을 못 읽은 줄(0원)은 식비 합에 넣지 않고 '모름'으로 따로 센다.
 */
function buildConfirmLabel(selectedItems: StagedItem[]) {
  const total = selectedItems.reduce((sum, item) => sum + item.price, 0);
  const unknownCount = selectedItems.filter((item) => item.price === 0).length;
  const parts = [`${selectedItems.length}개 추가`, `식비 +${total.toLocaleString()}원`];
  if (unknownCount > 0) parts.push(`모름 ${unknownCount}개`);
  return parts.join(', ');
}

export function PromptIngredientStagingScreen({
  onClose,
  onComplete,
  householdId,
  userId,
  onEditItem,
}: PromptIngredientStagingScreenProps) {
  const { items, checkedIds, saveStates, toggleCheck, toggleAll, updateItem, setSaveState, reset } =
    usePromptIngredientStore();
  const addMutation = useAddIngredientMutation();
  const dispatchActivityMutation = useDispatchHouseholdActivityMutation();
  const { data: categories = [] } = useIngredientCategoriesQuery(householdId);

  const isSaving = Object.values(saveStates).some((s) => s === 'saving');
  const doneCount = Object.values(saveStates).filter(
    (s) => s === 'success' || s === 'error',
  ).length;
  const selectedItems = items.filter((i) => checkedIds.includes(i.id));
  const allChecked = items.length > 0 && items.every((i) => checkedIds.includes(i.id));
  const confirmLabel = buildConfirmLabel(selectedItems);

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
    if (isSaving || selectedItems.length === 0) return;

    const successNames: string[] = [];

    for (const item of selectedItems) {
      setSaveState(item.id, 'saving');
      const nextState = await addMutation
        .mutateAsync({
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
        })
        .then(() => {
          successNames.push(item.name);
          return 'success' as const;
        })
        .catch(() => 'error' as const);
      setSaveState(item.id, nextState);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }

    if (successNames.length > 0) {
      dispatchActivityMutation.mutate({
        householdId,
        itemNames: successNames,
        triggeredBy: userId,
      });
    }

    reset();
    onComplete();
  }

  return (
    <AppScreen
      className="pointer-events-auto"
      appBar={{
        title: '추가할 항목 선택',
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
        {/* 전체 선택 */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="text-sm font-medium text-gray-600"
            onClick={toggleAll}
            disabled={isSaving}
          >
            {allChecked ? '전체 해제' : '전체 선택'}
          </button>
          <span className="text-xs text-gray-400">
            {checkedIds.length}/{items.length}개 선택
          </span>
        </div>

        {/* 아이템 목록 */}
        {items.map((item) => {
          const state = saveStates[item.id] ?? 'idle';
          const checked = checkedIds.includes(item.id);

          const isCompleted = state === 'success' || state === 'error';
          const isCurrentlySaving = state === 'saving';

          return (
            <div
              key={item.id}
              className={cn(
                'flex items-center gap-3 rounded-lg border px-3 py-2.5',
                'transition-[background-color] duration-500 ease-out',
                rowBg[state],
              )}
            >
              {/* 상태 아이콘 / 체크박스 */}
              <div className="shrink-0">
                {isCompleted || isCurrentlySaving ? (
                  <SaveStateIcon state={state} />
                ) : (
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleCheck(item.id)}
                    disabled={isSaving}
                  />
                )}
              </div>

              {/* 항목 내용 */}
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
                {item.price === 0 ? (
                  <span className="text-xs font-medium text-orange-500">
                    가격을 못 읽었어요 · 눌러서 입력
                  </span>
                ) : null}
              </button>
            </div>
          );
        })}
      </div>

      <CTAButton
        type="button"
        color="confirm"
        variant="filled"
        onClick={saveAll}
        disabled={isSaving || selectedItems.length === 0}
      >
        {isSaving ? `저장 중... (${doneCount}/${selectedItems.length})` : confirmLabel}
      </CTAButton>
    </AppScreen>
  );
}
