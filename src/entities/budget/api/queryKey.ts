/** query key factory */
export const budgetKeys = {
  all: ['budgets'] as const,
  list: (householdId: string, yearMonth: string) =>
    [...budgetKeys.all, 'list', householdId, yearMonth] as const,
  dailySeries: (householdId: string, yearMonth: string) =>
    [...budgetKeys.all, 'daily-series', householdId, yearMonth] as const,
  discarded: (householdId: string, yearMonth: string) =>
    [...budgetKeys.all, 'discarded', householdId, yearMonth] as const,
};
