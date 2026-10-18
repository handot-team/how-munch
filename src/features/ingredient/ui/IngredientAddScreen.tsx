'use client';

import { useRef, useState } from 'react';

import { ChevronRight } from 'lucide-react';
import { AppScreen } from '@stackflow/plugin-basic-ui';

import { CTAConfirmButton, Toast } from '@/commons/ui';

import { useAddIngredientMutation } from '../api/mutations';
import { useStoreNamesQuery } from '../api/queries';
import { type StagedItem } from '../lib/parseAiResponse';
import { usePromptIngredientStore } from '../model/promptIngredientStore';

import { IngredientForm, type IngredientFormValues } from './IngredientForm';

interface IngredientAddScreenProps {
  onClose: () => void;
  householdId: string;
  userId: string;
  /** 검색에서 바로 추가 시 품목명 pre-fill */
  defaultName?: string;
  onOpenProductNameSearch?: (currentName: string, onSelect: (name: string) => void) => void;
  onOpenBrandSearch?: (currentBrand: string, onSelect: (brand: string) => void) => void;
  /** 담기 목록 열기. autoSave면 열자마자 담은 줄을 저장한다 */
  onOpenBasket?: (autoSave: boolean) => void;
}

function toBasketItem(values: IngredientFormValues): StagedItem {
  return {
    id: crypto.randomUUID(),
    name: values.name.trim(),
    brand: values.brand,
    price: values.price,
    count: values.count,
    unit: values.unit,
    store: values.store,
    date: values.date,
    category_code: '',
    category_id: values.category_id,
    source: 'direct',
  };
}

export function IngredientAddScreen({
  onClose,
  householdId,
  userId,
  defaultName,
  onOpenProductNameSearch,
  onOpenBrandSearch,
  onOpenBasket,
}: IngredientAddScreenProps) {
  const addMutation = useAddIngredientMutation();
  const { data: storeNames } = useStoreNamesQuery(householdId);
  const basketItems = usePromptIngredientStore((s) => s.items);
  const saveStates = usePromptIngredientStore((s) => s.saveStates);
  const addItems = usePromptIngredientStore((s) => s.addItems);
  const formId = 'ingredient-add-form';
  // 버튼 두 개가 같은 폼을 제출한다. 누른 버튼을 기억해 제출 뒤 갈래를 나눈다.
  const intentRef = useRef<'basket' | 'save'>('save');
  // 담은 뒤 폼을 새로 그려 비우되 날짜와 구매처는 남긴다.
  const [formKey, setFormKey] = useState(0);
  const [carry, setCarry] = useState<Partial<IngredientFormValues> | undefined>(
    defaultName ? { name: defaultName } : undefined,
  );

  const pending = basketItems.filter((i) => saveStates[i.id] !== 'unknown');
  const pendingTotal = pending.reduce((sum, i) => sum + i.price, 0);

  const getErrorMessage = (error: unknown) => {
    if (error instanceof Error) return error.message;
    return '장보기 추가 중 오류가 발생했습니다';
  };

  const handleSubmit = (values: IngredientFormValues) => {
    if (intentRef.current === 'basket') {
      addItems([toBasketItem(values)]);
      Toast.success(`담았어요 · ${pending.length + 1}건`);
      setCarry({ date: values.date, store: values.store, category_id: values.category_id });
      setFormKey((k) => k + 1);
      return;
    }

    // 담은 줄이 있으면 지금 폼도 담아 목록에서 한 번에 저장한다.
    if (pending.length > 0 && onOpenBasket) {
      addItems([toBasketItem(values)]);
      onOpenBasket(true);
      return;
    }

    addMutation.mutate(
      {
        household_id: householdId,
        user_id: userId,
        date: values.date,
        category_id: values.category_id,
        name: values.name,
        brand: values.brand || null,
        count: values.count,
        unit: values.unit,
        store: values.store || null,
        price: values.price,
      },
      {
        onSuccess: () => {
          Toast.success('장보기 항목이 추가되었습니다');
          onClose();
        },
        onError: (error) => {
          Toast.error(getErrorMessage(error));
        },
      },
    );
  };

  return (
    <AppScreen className="pointer-events-auto" appBar={{ title: '장보기 추가' }}>
      {pending.length > 0 ? (
        <button
          type="button"
          onClick={() => onOpenBasket?.(false)}
          className="sticky top-0 z-10 flex w-full items-center justify-between border-b border-emerald-100 bg-emerald-50 px-4 py-3 text-left"
        >
          <span className="text-sm font-semibold text-emerald-800">
            담은 {pending.length}건 · 합계 {pendingTotal.toLocaleString()}원
          </span>
          <span className="flex items-center text-xs font-medium text-emerald-700">
            목록 보기
            <ChevronRight className="size-4" />
          </span>
        </button>
      ) : null}
      <div className="px-4 pt-4 pb-28">
        <IngredientForm
          key={formKey}
          formId={formId}
          householdId={householdId}
          defaultValues={carry}
          storeNames={storeNames}
          onSubmit={handleSubmit}
          isSubmitting={addMutation.isPending}
          onOpenProductNameSearch={onOpenProductNameSearch}
          onOpenBrandSearch={onOpenBrandSearch}
        />
      </div>
      <CTAConfirmButton className="grid-cols-[2fr_3fr]">
        <CTAConfirmButton.Left
          type="submit"
          form={formId}
          color="confirm"
          variant="subtle"
          disabled={addMutation.isPending}
          onClick={() => {
            intentRef.current = 'basket';
          }}
        >
          담기
        </CTAConfirmButton.Left>
        <CTAConfirmButton.Right
          type="submit"
          form={formId}
          color="confirm"
          variant="filled"
          disabled={addMutation.isPending}
          onClick={() => {
            intentRef.current = 'save';
          }}
        >
          {pending.length > 0 ? `${pending.length + 1}건 저장` : '저장'}
        </CTAConfirmButton.Right>
      </CTAConfirmButton>
    </AppScreen>
  );
}
