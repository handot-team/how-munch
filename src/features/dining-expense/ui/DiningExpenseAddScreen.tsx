'use client';

import { useState } from 'react';

import { AppScreen } from '@stackflow/plugin-basic-ui';

import { CTAButton, Toast } from '@/commons/ui';

import { type DiningExpenseKind } from '@/entities/dining-expense';

import { useAddDiningExpenseMutation } from '../api/mutations';
import { useDiningExpenseSuggestionsQuery } from '../api/queries';

import { DiningExpenseForm, type DiningExpenseFormValues } from './DiningExpenseForm';

interface DiningExpenseAddScreenProps {
  onClose: () => void;
  householdId: string;
}

export function DiningExpenseAddScreen({ onClose, householdId }: DiningExpenseAddScreenProps) {
  // 자동완성 후보는 선택한 종류로 스코프를 좁힌다. 포장·배달 플랫폼이 식당 가게 후보로 섞이지 않는다.
  const [kind, setKind] = useState<DiningExpenseKind>('restaurant');
  const addMutation = useAddDiningExpenseMutation();
  const { data: brandNames } = useDiningExpenseSuggestionsQuery(householdId, 'brand', kind);
  const { data: storeNames } = useDiningExpenseSuggestionsQuery(householdId, 'store', 'delivery');
  const formId = 'dining-expense-add-form';

  function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    return '외식비 추가 중 오류가 발생했습니다';
  }

  function handleSubmit(values: DiningExpenseFormValues) {
    addMutation.mutate(
      {
        household_id: householdId,
        date: values.date,
        kind: values.kind,
        brand: values.brand,
        name: values.name || null,
        store: values.store || null,
        price: values.price,
        memo: values.memo || null,
      },
      {
        onSuccess: () => {
          Toast.success('외식비가 추가되었습니다');
          onClose();
        },
        onError: (error) => {
          Toast.error(getErrorMessage(error));
        },
      },
    );
  }

  // 시안 v6: 스크롤해도 저장 버튼이 숨지 않는다(hideOnScroll 끔). 금액은 빈칸에서 시작한다(DiningExpenseForm).
  return (
    <AppScreen className="pointer-events-auto" appBar={{ title: '외식비 입력' }}>
      <div className="px-4 pt-4 pb-28">
        <DiningExpenseForm
          formId={formId}
          brandNames={brandNames}
          storeNames={storeNames}
          onSubmit={handleSubmit}
          onKindChange={setKind}
        />
      </div>
      <CTAButton
        type="submit"
        form={formId}
        color="confirm"
        variant="filled"
        disabled={addMutation.isPending}
      >
        저장
      </CTAButton>
    </AppScreen>
  );
}
