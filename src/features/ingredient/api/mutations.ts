import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '@/commons/lib';
import { type Database } from '@/commons/model/types';

import { budgetKeys } from '@/entities/budget';
import { foodExpenseKeys } from '@/entities/food-expense';
import { fridgeItemKeys } from '@/entities/fridge-item';
import { ingredientKeys, type Ingredient } from '@/entities/ingredient';
import { mealKeys } from '@/entities/meal';
import { type IngredientCategoryOption } from '@/entities/ingredient-category';

import { type StagedItem } from '../lib/parseAiResponse';

type IngredientInsert = Database['public']['Tables']['ingredients']['Insert'];
type IngredientUpdate = Database['public']['Tables']['ingredients']['Update'];

/** 장보기 항목 추가 (I-04) */
export function useAddIngredientMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: IngredientInsert & { skipNotification?: boolean }) =>
      apiClient.post<Ingredient>('/api/ingredients', input),
    onSuccess: () => invalidateAfterIngredientAdd(queryClient),
  });
}

/** 장보기 추가 뒤 낡는 조회들. 담기 목록 저장은 끝에 한 번만 부른다. */
export function invalidateAfterIngredientAdd(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ingredientKeys.all });
  // 식비 탭은 통합 뷰를 읽으므로 장보기 변경도 함께 무효화해야 즉시 반영된다
  queryClient.invalidateQueries({ queryKey: foodExpenseKeys.all });
  // 지출이 바뀌면 예산 소진율과 일자별 시리즈도 같이 낡는다
  queryClient.invalidateQueries({ queryKey: budgetKeys.all });
  queryClient.invalidateQueries({ queryKey: fridgeItemKeys.all });
  // 장보기 추가는 냉장고 품목을 새로 만들거나 기존 품목에 병합하므로 식단 재료 선택 목록도 갱신한다
  queryClient.invalidateQueries({ queryKey: mealKeys.fridgeItemsAll });
}

/** 장보기 항목 수정 (I-06) */
export function useUpdateIngredientMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...updates }: IngredientUpdate & { id: string }) =>
      apiClient.put<Ingredient>('/api/ingredients', { id, ...updates }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ingredientKeys.all });
      // 식비 탭은 통합 뷰를 읽으므로 장보기 변경도 함께 무효화해야 즉시 반영된다
      queryClient.invalidateQueries({ queryKey: foodExpenseKeys.all });
      // 지출이 바뀌면 예산 소진율과 일자별 시리즈도 같이 낡는다
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
      queryClient.invalidateQueries({ queryKey: fridgeItemKeys.all });
      // 이름/브랜드 변경이 냉장고 품목까지 바꾸므로 식단 카드와 재료 선택 목록을 함께 갱신한다
      queryClient.invalidateQueries({ queryKey: mealKeys.all });
    },
  });
}

/** 영수증 이미지를 Claude Vision으로 분석해 파싱된 항목(StagedItem[])을 받아온다 */
export function useParseReceiptMutation() {
  return useMutation({
    mutationFn: (input: {
      imageBase64: string;
      mimeType: string;
      categories: IngredientCategoryOption[];
      today: string;
    }) => apiClient.post<{ items: StagedItem[] }>('/api/ingredients/parse-receipt', input),
  });
}

/** AI 다중 추가 후 가구 활동 알림 단건 통합 발송 */
export function useDispatchHouseholdActivityMutation() {
  return useMutation({
    mutationFn: (input: { householdId: string; itemNames: string[]; triggeredBy: string }) =>
      apiClient.post('/api/notification/household-activity', input),
  });
}

/** 장보기 항목 삭제 (I-06) */
export function useDeleteIngredientMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/ingredients?id=${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ingredientKeys.all });
      // 식비 탭은 통합 뷰를 읽으므로 장보기 변경도 함께 무효화해야 즉시 반영된다
      queryClient.invalidateQueries({ queryKey: foodExpenseKeys.all });
      // 지출이 바뀌면 예산 소진율과 일자별 시리즈도 같이 낡는다
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
      queryClient.invalidateQueries({ queryKey: fridgeItemKeys.all });
      queryClient.invalidateQueries({ queryKey: mealKeys.fridgeItemsAll });
    },
  });
}
