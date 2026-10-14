import { skipToken, useQuery } from '@tanstack/react-query';

import { apiClient } from '@/commons/lib';

import {
  fridgeItemKeys,
  type FridgeBatchEndRecord,
  type FridgeItemWithBatches,
} from '@/entities/fridge-item';
import { useSynonymExpandedTerms } from '@/entities/search-synonym';

interface FridgePreferences {
  user_id: string;
  hide_depleted_fridge_items: boolean;
}

export interface CategoryExpiryDefaultRow {
  category_id: string;
  default_expiry_days: number;
}

/** categoryId → 기본 유효기간(일수) 맵 */
export type CategoryExpiryDefaultsMap = Record<string, number>;

// 가구 카테고리 기본 유효기간은 자주 바뀌지 않으므로 카테고리 목록과 동일하게 6시간 캐시한다.
const CATEGORY_EXPIRY_DEFAULTS_STALE_TIME = 1000 * 60 * 60 * 6;

/**
 * 냉장고 재고 전체 조회 (배치 포함)
 * 검색어는 유사어 그룹으로 확장해 서버에 반복 파라미터로 넘긴다.
 * 유사어 사전이 로드되기 전에는 검색어 하나만 넘어가므로 기존 동작과 같다.
 */
export function useFridgeItemsQuery({
  householdId,
  userId,
  searchInput = '',
}: {
  householdId: string | null;
  userId: string;
  searchInput?: string;
}) {
  const searchKeywords = useSynonymExpandedTerms(searchInput);

  return useQuery({
    queryKey: fridgeItemKeys.list(householdId ?? '', userId, searchKeywords.join('|')),
    queryFn: householdId
      ? () =>
          apiClient.get<FridgeItemWithBatches[]>('/api/fridge', {
            householdId,
            ...(searchKeywords.length > 0 && { search: searchKeywords }),
          })
      : skipToken,
  });
}

/** 배치별 식단 사용량 합계 및 연결 여부 조회 */
export function useBatchUsedAmountQuery(batchId: string | null) {
  return useQuery({
    queryKey: fridgeItemKeys.batchUsage(batchId ?? ''),
    queryFn: batchId
      ? () =>
          apiClient.get<{ usedAmount: number; hasUsage: boolean }>('/api/fridge/batch-usage', {
            batchId,
          })
      : skipToken,
  });
}

/** 내 냉장고 표시 설정 조회 */
export function useFridgePreferencesQuery(userId: string | null) {
  return useQuery({
    queryKey: fridgeItemKeys.preferences(userId ?? ''),
    queryFn: userId
      ? () => apiClient.get<FridgePreferences | null>('/api/fridge/preferences')
      : skipToken,
  });
}

/** 가구 카테고리별 기본 유효기간 조회 (categoryId → 일수 맵으로 변환) */
export function useCategoryExpiryDefaultsQuery(householdId: string | null) {
  return useQuery({
    queryKey: fridgeItemKeys.categoryExpiryDefaults(householdId ?? ''),
    staleTime: CATEGORY_EXPIRY_DEFAULTS_STALE_TIME,
    queryFn: householdId
      ? () =>
          apiClient.get<CategoryExpiryDefaultRow[]>('/api/fridge/category-expiry-defaults', {
            householdId,
          })
      : skipToken,
    select: (rows): CategoryExpiryDefaultsMap =>
      Object.fromEntries(rows.map((row) => [row.category_id, row.default_expiry_days])),
  });
}

/** 냉장고 브랜드 목록 조회 — 자동완성용 */
export function useFridgeBrandNamesQuery(householdId: string | null) {
  return useQuery({
    queryKey: fridgeItemKeys.brands(householdId ?? ''),
    queryFn: householdId
      ? () => apiClient.get<string[]>('/api/fridge/brands', { householdId })
      : skipToken,
  });
}

/**
 * @description 재료의 최근 끝 기록(되돌리지 않은 것) 조회. 끝 기록 시트의 되돌리기 목록에 쓴다.
 */
export function useFridgeEndRecordsQuery(fridgeItemId: string | null) {
  return useQuery({
    queryKey: fridgeItemKeys.endRecords(fridgeItemId ?? ''),
    queryFn: fridgeItemId
      ? () => apiClient.get<FridgeBatchEndRecord[]>('/api/fridge/end-records', { fridgeItemId })
      : skipToken,
  });
}
