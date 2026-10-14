import { type Database, type Json } from '@/commons/model/types/database';

import { type IngredientUnit } from '@/entities/ingredient/@x/notification';

export type NotificationRow = Database['public']['Tables']['notifications']['Row'];
export type NotificationPreferenceRow =
  Database['public']['Tables']['notification_preferences']['Row'];
export type NotificationPushSubscriptionRow =
  Database['public']['Tables']['notification_push_subscriptions']['Row'];

export type NotificationType =
  | 'expiry_soon'
  | 'fridge_item_added'
  | 'meal_added'
  | 'dining_expense_added'
  | 'budget_exceeded'
  | 'weekly_expense'
  | 'monthly_closed';
export type NotificationStatus = NotificationRow['status'];

export interface ExpirySoonPayload {
  householdId: string;
  itemId: string;
  batchId: string;
  itemName: string;
  expiryDate: string;
  daysLeft: number;
  remainingQuantity: number;
  unit: IngredientUnit;
}

export interface FridgeItemAddedPayload {
  householdId: string;
  createdBy: string;
  createdByNickname: string;
  itemId: string;
  itemName: string;
  itemCount: number;
}

export interface MealAddedPayload {
  householdId: string;
  createdBy: string;
  createdByNickname: string;
  mealId: string;
  date: string;
  type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
}

export interface BudgetExceededPayload {
  householdId: string;
  /** 'YYYY-MM' */
  yearMonth: string;
  /** 전체 예산 대비 기준선 — 50: 절반 사용, 100: 초과 */
  threshold: 50 | 100;
  budgetAmount: number;
  spentAmount: number;
}

/** 월 화면형: 지난달 식비 마감 알림. 누르면 그 달 예산 현황을 연다. */
export interface MonthlyClosedPayload {
  householdId: string;
  /** 마감한 달 'YYYY-MM' */
  yearMonth: string;
}

export interface WeeklyExpensePayload {
  householdId: string;
  /** 지난주 월요일 (YYYY-MM-DD) */
  weekStart: string;
  /** 지난주 일요일 (YYYY-MM-DD) */
  weekEnd: string;
  weeklyTotal: number;
  /** 발송일이 속한 달 ('YYYY-MM') */
  yearMonth: string;
  monthlyTotal: number;
  /** total scope 예산 — 미설정이면 null */
  budgetAmount: number | null;
}

export interface NotificationItem extends Omit<NotificationRow, 'type' | 'payload'> {
  type: NotificationType;
  payload: Json;
}
