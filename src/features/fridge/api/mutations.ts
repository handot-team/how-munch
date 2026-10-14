import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '@/commons/lib';
import { Toast } from '@/commons/ui';

import { budgetKeys } from '@/entities/budget';
import { foodExpenseKeys } from '@/entities/food-expense';
import {
  fridgeItemKeys,
  type FridgeBatchEndKind,
  type FridgeItem,
  type FridgeItemBatch,
} from '@/entities/fridge-item';
import { mealKeys } from '@/entities/meal';

import { type CategoryExpiryDefaultRow } from './queries';

/** 냉장고 아이템 + 첫 배치 동시 추가 */
export function useAddFridgeItemMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { item: Record<string, unknown>; batch: Record<string, unknown> }) =>
      apiClient.post<FridgeItem>('/api/fridge', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fridgeItemKeys.all });
      queryClient.invalidateQueries({ queryKey: mealKeys.fridgeItemsAll });
    },
  });
}

/** 냉장고 아이템 메타 수정 (name, category_id, unit 등) */
export function useUpdateFridgeItemMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...updates }: Record<string, unknown> & { id: string }) =>
      apiClient.put<FridgeItem>('/api/fridge', { id, ...updates }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fridgeItemKeys.all });
      // 재료 이름/정보 변경이 식단 카드 표시에도 반영되도록 식단 관련 캐시 전체 무효화
      queryClient.invalidateQueries({ queryKey: mealKeys.all });
    },
  });
}

/** 냉장고 아이템 삭제 (배치도 CASCADE 삭제) */
export function useDeleteFridgeItemMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/fridge?id=${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fridgeItemKeys.all });
      queryClient.invalidateQueries({ queryKey: mealKeys.fridgeItemsAll });
    },
  });
}

/** 기존 아이템에 배치 추가 */
export function useAddBatchMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      apiClient.post<FridgeItemBatch>('/api/fridge/batches', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fridgeItemKeys.all });
      queryClient.invalidateQueries({ queryKey: mealKeys.fridgeItemsAll });
    },
  });
}

/** 배치 수정 */
export function useUpdateBatchMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...updates }: Record<string, unknown> & { id: string }) =>
      apiClient.put<FridgeItemBatch>('/api/fridge/batches', { id, ...updates }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fridgeItemKeys.all });
      queryClient.invalidateQueries({ queryKey: mealKeys.fridgeItemsAll });
    },
  });
}

/** 냉장고 배치 재고 소진 (버리기) */
export function useDiscardBatchMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.post('/api/fridge/batches/discard', { id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fridgeItemKeys.all });
      queryClient.invalidateQueries({ queryKey: mealKeys.fridgeItemsAll });
    },
  });
}

/** 냉장고 아이템 전체 재고 소진 (버리기) */
export function useDiscardFridgeItemMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.post('/api/fridge/discard', { id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fridgeItemKeys.all });
      queryClient.invalidateQueries({ queryKey: mealKeys.fridgeItemsAll });
    },
  });
}

/** 배치 삭제 */
export function useDeleteBatchMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/fridge/batches?id=${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fridgeItemKeys.all });
      queryClient.invalidateQueries({ queryKey: mealKeys.fridgeItemsAll });
    },
  });
}

interface SubdivideFridgeItemInput {
  source_item_id: string;
  consume_amount: number;
  new_item_name: string;
  new_item_quantity: number;
  new_expiry_date?: string | null;
  new_item_unit?: string | null;
}

/** 냉장고 아이템 소분 — FIFO 차감 후 새 독립 fridge_item 생성 */
export function useSubdivideFridgeItemMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SubdivideFridgeItemInput) =>
      apiClient.post<FridgeItem>('/api/fridge/subdivide', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fridgeItemKeys.all });
      queryClient.invalidateQueries({ queryKey: mealKeys.fridgeItemsAll });
    },
  });
}

interface UpsertCategoryExpiryDefaultInput {
  householdId: string;
  categoryId: string;
  /** null이면 해당 카테고리 설정을 제거(미설정) */
  days: number | null;
}

/** 카테고리별 기본 유효기간 설정 저장 (days=null이면 제거) — 낙관적 업데이트 적용 */
export function useUpsertCategoryExpiryDefaultMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpsertCategoryExpiryDefaultInput) =>
      apiClient.put('/api/fridge/category-expiry-defaults', input),
    onMutate: async (variables) => {
      const queryKey = fridgeItemKeys.categoryExpiryDefaults(variables.householdId);
      await queryClient.cancelQueries({ queryKey });

      const previousRows = queryClient.getQueryData<CategoryExpiryDefaultRow[]>(queryKey);
      queryClient.setQueryData<CategoryExpiryDefaultRow[]>(queryKey, (rows = []) => {
        const withoutCategory = rows.filter((row) => row.category_id !== variables.categoryId);
        if (variables.days === null) return withoutCategory;
        return [
          ...withoutCategory,
          { category_id: variables.categoryId, default_expiry_days: variables.days },
        ];
      });

      return { queryKey, previousRows };
    },
    onError: (error, _variables, context) => {
      if (context) {
        queryClient.setQueryData(context.queryKey, context.previousRows);
      }
      Toast.error(error.message);
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({
        queryKey: fridgeItemKeys.categoryExpiryDefaults(variables.householdId),
      });
    },
  });
}

interface UpsertFridgePreferencesInput {
  userId: string;
  values: { hide_depleted_fridge_items: boolean };
}

/** 냉장고 표시 설정 저장 */
export function useUpsertFridgePreferencesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpsertFridgePreferencesInput) =>
      apiClient.put('/api/fridge/preferences', input.values),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: fridgeItemKeys.preferences(variables.userId) });
      queryClient.invalidateQueries({ queryKey: fridgeItemKeys.all });
      queryClient.invalidateQueries({ queryKey: mealKeys.fridgeItemsAll });
    },
    onError: (error) => {
      Toast.error(error.message);
    },
  });
}

interface RecordFridgeBatchEndInput {
  batchId: string;
  kind: FridgeBatchEndKind;
  amount: number;
}

/**
 * @description 구매분 하나를 다 먹음/버림으로 끝낸다.
 * 재고 수량, 식비 행 꼬리표, 버린 식비가 함께 바뀌므로 세 목록을 모두 다시 읽는다.
 */
export function useRecordFridgeBatchEndMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RecordFridgeBatchEndInput) =>
      apiClient.post<{ id: string }>('/api/fridge/end-records', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fridgeItemKeys.all });
      queryClient.invalidateQueries({ queryKey: mealKeys.fridgeItemsAll });
      queryClient.invalidateQueries({ queryKey: foodExpenseKeys.all });
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });
}

/**
 * @description 끝 기록 하나를 되돌린다(구매분 수량 복구).
 */
export function useUndoFridgeBatchEndMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (recordId: string) => apiClient.delete(`/api/fridge/end-records?id=${recordId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fridgeItemKeys.all });
      queryClient.invalidateQueries({ queryKey: mealKeys.fridgeItemsAll });
      queryClient.invalidateQueries({ queryKey: foodExpenseKeys.all });
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });
}
