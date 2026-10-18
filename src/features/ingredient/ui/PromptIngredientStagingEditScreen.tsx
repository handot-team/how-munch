'use client';

import { ChevronLeft } from 'lucide-react';
import { AppScreen } from '@stackflow/plugin-basic-ui';

import { Button, CTAButton } from '@/commons/ui';

import { type StagedItem } from '../lib/parseAiResponse';
import {
  resolvePendingPromptEditCallback,
  resolvePendingPromptRemoveCallback,
  clearPendingPromptEditCallback,
} from '../model/promptIngredientEditStore';
import { useStoreNamesQuery } from '../api/queries';

import { IngredientForm, type IngredientFormValues } from './IngredientForm';

interface PromptIngredientStagingEditScreenProps {
  onClose: () => void;
  item: StagedItem;
  householdId: string;
  /** 가격 없는 품목을 고치러 오면 가격 칸에 커서를 둔다 */
  focusPrice?: boolean;
  /** 품목명 검색 Screen 진입 핸들러 — 선택값은 form name 필드에 반영된다 */
  onOpenProductNameSearch?: (currentName: string, onSelect: (name: string) => void) => void;
  /** 브랜드 검색 Screen 진입 핸들러 — 선택값은 form brand 필드에 반영된다 */
  onOpenBrandSearch?: (currentBrand: string, onSelect: (brand: string) => void) => void;
}

/**
 * 품목 고치기 화면(시안 v7 C안). 장보기 담기에 담은 품목 하나를 장보기 수정 화면(v6 후) 모양으로 고친다.
 * - 칸·순서·모양은 장보기 수정과 같고, 날짜·구매처 칸만 뺀다(담기 화면 위 [날짜 ▾][구매처 ▾]가 정한다).
 * - 위 앱바: 뒤로·제목·오른쪽 위 빨간 "삭제". 지우면 담기 화면으로 돌아가 되돌리기가 뜬다(확인 시트 없음).
 * - 하단: "저장" 한 칸.
 */
export function PromptIngredientStagingEditScreen({
  onClose,
  item,
  householdId,
  focusPrice = false,
  onOpenProductNameSearch,
  onOpenBrandSearch,
}: PromptIngredientStagingEditScreenProps) {
  const { data: storeNames } = useStoreNamesQuery(householdId);
  const formId = `ai-staging-edit-form-${item.id}`;

  function handleSubmit(values: IngredientFormValues) {
    resolvePendingPromptEditCallback({
      name: values.name.trim(),
      brand: values.brand.trim(),
      price: values.price,
      count: values.count,
      unit: values.unit,
      category_id: values.category_id,
    });
    onClose();
  }

  function handleClose() {
    clearPendingPromptEditCallback();
    onClose();
  }

  function handleRemove() {
    resolvePendingPromptRemoveCallback();
    onClose();
  }

  return (
    <AppScreen
      className="pointer-events-auto"
      appBar={{
        title: '품목 고치기',
        backButton: {
          render: () => (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={handleClose}
              aria-label="뒤로가기"
            >
              <ChevronLeft className="size-5" />
            </Button>
          ),
        },
        renderRight: () => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            className="text-[15px] font-semibold text-[#DC2626] hover:text-[#DC2626]"
          >
            삭제
          </Button>
        ),
      }}
    >
      <div data-item-screen className="px-4 pt-4 pb-28">
        <IngredientForm
          formId={formId}
          householdId={householdId}
          defaultValues={{
            date: item.date,
            category_id: item.category_id,
            name: item.name,
            brand: item.brand,
            count: item.count,
            unit: item.unit,
            store: item.store,
            price: item.price,
          }}
          storeNames={storeNames}
          onSubmit={handleSubmit}
          onOpenProductNameSearch={onOpenProductNameSearch}
          onOpenBrandSearch={onOpenBrandSearch}
          hideDateStore
          autoFocusPrice={focusPrice}
        />
      </div>
      <CTAButton type="submit" form={formId} color="confirm" variant="filled">
        저장
      </CTAButton>
    </AppScreen>
  );
}
