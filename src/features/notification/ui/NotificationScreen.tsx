'use client';

import { AppScreen } from '@stackflow/plugin-basic-ui';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

import { useUserSuspenseQuery } from '@/commons/api/auth/queries';
import { Button, EmptyState } from '@/commons/ui';

import { type MonthlyClosedPayload, type NotificationItem } from '@/entities/notification';

import {
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
  useNotificationsQuery,
} from '../api';

function formatNotificationDate(value: string) {
  return format(new Date(value), 'M월 d일 HH:mm', { locale: ko });
}

/**
 * 월 마감 알림이면 열 달을 돌려준다. 다른 알림이나 payload가 비었으면 null.
 */
function resolveClosedMonth(notification: NotificationItem): MonthlyClosedPayload | null {
  if (notification.type !== 'monthly_closed') return null;
  const payload = notification.payload as Partial<MonthlyClosedPayload> | null;
  if (!payload?.householdId || !payload.yearMonth) return null;
  return { householdId: payload.householdId, yearMonth: payload.yearMonth };
}

interface NotificationScreenProps {
  /** 월 화면형: 마감 알림에서 그 달 예산 현황 열기 */
  onOpenBudget: (householdId: string, yearMonth: string) => void;
}

/** 알림 목록 화면 */
export function NotificationScreen({ onOpenBudget }: NotificationScreenProps) {
  const { data: user } = useUserSuspenseQuery();
  const { data: notifications = [], isLoading } = useNotificationsQuery(user.id);
  const markReadMutation = useMarkNotificationReadMutation(user.id);
  const markAllReadMutation = useMarkAllNotificationsReadMutation(user.id);

  const unreadCount = notifications.filter((notification) => !notification.read_at).length;

  function markNotificationRead(notificationId: string, isUnread: boolean) {
    if (!isUnread) return;
    markReadMutation.mutate(notificationId);
  }

  function markAllRead() {
    if (unreadCount === 0) return;
    markAllReadMutation.mutate();
  }

  return (
    <AppScreen
      className="pointer-events-auto"
      appBar={{
        title: '알림',
        renderRight: () => (
          <Button
            variant="ghost"
            size="sm"
            onClick={markAllRead}
            disabled={Boolean(!unreadCount || markAllReadMutation.isPending)}
          >
            모두 읽음
          </Button>
        ),
      }}
    >
      <div className="flex min-h-full flex-col p-4">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-gray-400">불러오는 중...</div>
        ) : null}
        {!isLoading &&
          (notifications.length === 0 ? (
            <EmptyState.Root>
              <EmptyState.Content className="py-16">
                <EmptyState.Title>알림이 없습니다</EmptyState.Title>
                <EmptyState.Description>
                  새로운 알림이 오면 여기에 표시됩니다
                </EmptyState.Description>
              </EmptyState.Content>
            </EmptyState.Root>
          ) : (
            <ul className="space-y-2">
              {notifications.map((notification) => {
                const isUnread = !notification.read_at;
                const closedMonth = resolveClosedMonth(notification);

                return (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => markNotificationRead(notification.id, isUnread)}
                      className="w-full rounded-lg border border-gray-200 bg-white p-3 text-left"
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {notification.title}
                        </p>
                        {isUnread ? (
                          <span className="size-2 shrink-0 rounded-full bg-red-500" />
                        ) : null}
                      </div>
                      <p className="text-sm text-gray-600">{notification.description}</p>
                      {closedMonth ? (
                        <span
                          role="link"
                          tabIndex={0}
                          onClick={(event) => {
                            event.stopPropagation();
                            markNotificationRead(notification.id, isUnread);
                            onOpenBudget(closedMonth.householdId, closedMonth.yearMonth);
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== 'Enter') return;
                            event.stopPropagation();
                            onOpenBudget(closedMonth.householdId, closedMonth.yearMonth);
                          }}
                          className="mt-1.5 inline-block text-sm font-semibold text-emerald-600"
                        >
                          {Number(closedMonth.yearMonth.slice(5, 7))}월 예산 현황 보기
                        </span>
                      ) : null}
                      <p className="mt-2 text-xs text-gray-400">
                        {formatNotificationDate(notification.created_at)}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          ))}
      </div>
    </AppScreen>
  );
}
