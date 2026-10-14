'use client';

import { AlertTriangle, Check } from 'lucide-react';
import { overlay } from 'overlay-kit';

import { stackFlowActions } from '@/apps/stackflow/StackFlow';

import { useUserSuspenseQuery } from '@/commons/api/auth/queries';
import { cn } from '@/commons/lib';
import { Activity, ProgressBar, SwipeAction } from '@/commons/ui';

import { type FridgeItemWithBatches } from '@/entities/fridge-item';
import { formatIngredientAmount } from '@/entities/ingredient';

import { getDaysUntilExpiry } from '../lib/expiry';

import { ExpiryBadge } from './ExpiryBadge';
import { FridgeEndRecordBottomSheet } from './FridgeEndRecordBottomSheet';

interface FridgeItemCardProps {
  item: FridgeItemWithBatches;
  categoryEmoji?: string;
  onOpenSheet: (item: FridgeItemWithBatches) => void;
  onAddBatch: (item: FridgeItemWithBatches) => void;
}

function getRemainingRate(availableCount: number, usedCount: number) {
  const safeAvailable = Number(availableCount);
  const safeUsed = Number(usedCount);
  if (!Number.isFinite(safeAvailable) || !Number.isFinite(safeUsed)) return 0;
  const total = safeAvailable + safeUsed;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((safeAvailable / total) * 100)));
}

/** 냉장고 아이템 카드 — SwipeAction으로 퀵 액션 노출, 탭으로 배치 목록 시트 진입 */
export function FridgeItemCard({
  item,
  categoryEmoji,
  onOpenSheet,
  onAddBatch,
}: FridgeItemCardProps) {
  const { data: user } = useUserSuspenseQuery();
  // 꼬리표형: 누가 넣은 재료인지 카드 첫 화면에 칩으로 보인다. 입력한 사람이지 산 사람은 아니다.
  const creatorLabel = item.created_by
    ? `${item.created_by === user.id ? '나' : (item.created_by_nickname ?? '가구원')} 입력`
    : null;

  const activeBatches = item.fridge_item_batches.filter(
    (b) => !b.deleted_at && Number(b.quantity) > 0,
  );
  const activeBatchIds = new Set(activeBatches.map((b) => b.id));

  // 완전히 소진된(quantity=0) 옛 배치의 사용 이력은 잔여율 계산에서 제외한다.
  // 그렇지 않으면 같은 재료를 재등록해도 예전 소진량이 분모에 남아 100%가 되지 않는다.
  const usedAmountByBatchId = new Map<string, number>();
  for (const usage of item.meal_batch_usages ?? []) {
    if (!activeBatchIds.has(usage.batch_id)) continue;
    const prev = usedAmountByBatchId.get(usage.batch_id) ?? 0;
    usedAmountByBatchId.set(usage.batch_id, prev + Number(usage.amount));
  }

  const totalUsedCount = Array.from(usedAmountByBatchId.values()).reduce((sum, amount) => {
    const safe = Number(amount);
    return Number.isFinite(safe) ? sum + safe : sum;
  }, 0);

  const isOutOfStock = Number(item.total_count) <= 0;
  const remainingRate =
    item.unit === 'count' && !isOutOfStock
      ? getRemainingRate(item.total_count, totalUsedCount)
      : null;
  const hasExpiredBatch = activeBatches.some(
    (b) => b.expiry_date && getDaysUntilExpiry(b.expiry_date) < 0,
  );
  const soonestExpiry = activeBatches
    .filter((b) => b.expiry_date)
    .map((b) => ({ batch: b, days: getDaysUntilExpiry(b.expiry_date!) }))
    .sort((a, b) => a.days - b.days)[0];

  function openSubdivide() {
    stackFlowActions.push('FridgeItemSubdivideActivity', {
      fridgeItemId: item.id,
      itemName: item.name,
      totalCount: item.total_count,
      unit: item.unit,
      batches: item.fridge_item_batches.filter((b) => !b.deleted_at),
    });
  }

  // 휴지통 대신 끝 기록 시트를 연다. 재료 삭제는 재료 수정 화면에만 둔다.
  // 삭제는 장보기 행의 냉장고 연결까지 지워서, 먹거나 버린 기록이 남지 않았다.
  function openEndRecordSheet() {
    overlay.open(({ isOpen, close, unmount }) => {
      function closeSheet() {
        close();
        window.setTimeout(unmount, 200);
      }

      return (
        <FridgeEndRecordBottomSheet
          open={isOpen}
          onClose={closeSheet}
          item={item}
          onSubdivide={openSubdivide}
        />
      );
    });
  }

  const leftSwipeRightActions = [
    {
      id: 'end-record',
      icon: <Check className="size-4" />,
      label: '끝 기록',
      className: 'bg-emerald-500',
      onPress: openEndRecordSheet,
    },
  ];

  const rightSwipeLeftActions = [
    {
      id: 'subdivide',
      label: '소분',
      className: 'bg-indigo-500',
      onPress: openSubdivide,
    },
    {
      id: 'add-batch',
      label: '재고추가',
      className: 'bg-emerald-500',
      onPress: () => onAddBatch(item),
    },
  ];

  return (
    <SwipeAction
      rightActions={leftSwipeRightActions}
      leftActions={rightSwipeLeftActions}
      rightActionsWidth={80}
      leftActionsWidth={124}
      groupId="fridge-card"
      className="rounded-xl"
    >
      <button
        type="button"
        disabled={isOutOfStock}
        onClick={() => onOpenSheet(item)}
        className={cn(
          'w-full rounded-xl border bg-white text-left',
          hasExpiredBatch ? 'border-red-300' : 'border-gray-200',
          isOutOfStock ? 'cursor-default' : 'cursor-pointer',
        )}
      >
        <div className={cn('flex flex-col gap-2 p-3', isOutOfStock && 'opacity-50')}>
          {/* 1행: 이름·브랜드 + 총량·만료일 */}
          <div className="flex items-center gap-2">
            <Activity visible={!!categoryEmoji}>
              <span className="font-tossface shrink-0 text-base" aria-hidden>
                {categoryEmoji}
              </span>
            </Activity>

            <div className="flex min-w-0 flex-col">
              <Activity visible={!!item.brand}>
                <span className="truncate text-[11px] text-gray-400">{item.brand}</span>
              </Activity>
              <span
                className={cn(
                  'truncate text-sm font-medium',
                  isOutOfStock ? 'text-gray-400' : 'text-gray-900',
                )}
              >
                {item.name}
              </span>
            </div>

            <Activity visible={!!creatorLabel}>
              <span className="shrink-0 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                {creatorLabel}
              </span>
            </Activity>
            <span className="flex-1" aria-hidden />

            <div className="flex shrink-0 items-center gap-1.5">
              <span
                className={cn(
                  'text-sm font-semibold tabular-nums',
                  isOutOfStock ? 'text-gray-400' : 'text-gray-900',
                )}
              >
                {formatIngredientAmount(Number(item.total_count), item.unit, true)}
              </span>
              <Activity visible={!!soonestExpiry}>
                <ExpiryBadge daysLeft={soonestExpiry?.days ?? 0} />
              </Activity>
            </div>
          </div>

          {/* 2행: 뱃지 */}
          <Activity visible={item.is_subdivided || hasExpiredBatch}>
            <div className="flex items-center gap-1.5">
              <Activity visible={item.is_subdivided}>
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                  소분
                </span>
              </Activity>
              <Activity visible={hasExpiredBatch}>
                <span className="flex items-center gap-0.5 text-[11px] font-medium text-red-500">
                  <AlertTriangle className="size-3" aria-hidden />
                  만료 재고 있음
                </span>
              </Activity>
            </div>
          </Activity>

          {/* 3행: 소진율 — 개(count) 단위만 표시 */}
          <Activity visible={remainingRate !== null}>
            <div className="flex items-center gap-2">
              <ProgressBar value={remainingRate ?? 0} className="h-1.5 flex-1" />
              <span className="shrink-0 text-[11px] text-emerald-600">
                잔여율 {remainingRate ?? 0}%
              </span>
            </div>
          </Activity>
        </div>
      </button>
    </SwipeAction>
  );
}
