/** query key factory */
export const fridgeItemKeys = {
  all: ['fridge-items'] as const,
  list: (householdId: string, userId: string, searchKeyword: string) =>
    [...fridgeItemKeys.all, 'list', householdId, userId, searchKeyword] as const,
  batchUsage: (batchId: string) => [...fridgeItemKeys.all, 'batch-usage', batchId] as const,
  endRecords: (fridgeItemId: string) =>
    [...fridgeItemKeys.all, 'end-records', fridgeItemId] as const,
  preferences: (userId: string) => [...fridgeItemKeys.all, 'preferences', userId] as const,
  brands: (householdId: string) => [...fridgeItemKeys.all, 'brands', householdId] as const,
  categoryExpiryDefaults: (householdId: string) =>
    [...fridgeItemKeys.all, 'category-expiry-defaults', householdId] as const,
};
