'use client';

import { useState } from 'react';

import { format } from 'date-fns';

import { cn } from '@/commons/lib';
import { Activity, BottomSheet, CTAPrimitive, Counter, SegmentControl, Toast } from '@/commons/ui';

import {
  type FridgeBatchEndKind,
  type FridgeItemBatch,
  type FridgeItemWithBatches,
} from '@/entities/fridge-item';
import { formatIngredientAmount } from '@/entities/ingredient';

import { useRecordFridgeBatchEndMutation, useUndoFridgeBatchEndMutation } from '../api/mutations';
import { useFridgeEndRecordsQuery } from '../api/queries';

type EndChoice = FridgeBatchEndKind | 'subdivide';

const END_KIND_LABEL: Record<FridgeBatchEndKind, string> = {
  eaten: '다 먹음',
  discarded: '버림',
};

/** 단위별 개수 조절 간격. 개는 1개씩, 무게·부피는 반 단위로 자주 끝내므로 큰 간격을 쓴다. */
const STEP_BY_UNIT: Record<string, number> = { count: 1, g: 50, ml: 50, kg: 0.1, l: 0.1 };

interface FridgeEndRecordBottomSheetProps {
  open: boolean;
  onClose: () => void;
  item: FridgeItemWithBatches;
  /** 소분함을 고르면 기존 소분 화면으로 보낸다 */
  onSubdivide: () => void;
}

/**
 * @description 오래된 구매분이 먼저 오도록 남은 구매분만 추린다.
 */
function sortActiveBatches(batches: FridgeItemBatch[]) {
  return batches
    .filter((batch) => !batch.deleted_at && Number(batch.quantity) > 0)
    .sort(
      (a, b) =>
        a.purchased_date.localeCompare(b.purchased_date) ||
        a.created_at.localeCompare(b.created_at),
    );
}

function resolveDefaultAmount(batch: FridgeItemBatch | undefined, unit: string) {
  if (!batch) return 0;
  // 개 단위는 1개부터, 무게·부피는 남은 양 전부를 기본으로 둔다(반 덩이를 세지 않는다).
  return unit === 'count' ? Math.min(1, Number(batch.quantity)) : Number(batch.quantity);
}

/** 끝 기록 시트 — 구매분 하나를 다 먹음/버림과 개수로 끝내고, 최근 기록을 되돌린다 */
export function FridgeEndRecordBottomSheet({
  open,
  onClose,
  item,
  onSubdivide,
}: FridgeEndRecordBottomSheetProps) {
  const batches = sortActiveBatches(item.fridge_item_batches);
  const [batchId, setBatchId] = useState(batches[0]?.id ?? null);
  const [choice, setChoice] = useState<EndChoice>('eaten');
  const [amount, setAmount] = useState(resolveDefaultAmount(batches[0], item.unit));

  const { data: records = [] } = useFridgeEndRecordsQuery(open ? item.id : null);
  const recordMutation = useRecordFridgeBatchEndMutation();
  const undoMutation = useUndoFridgeBatchEndMutation();

  const selectedBatch = batches.find((batch) => batch.id === batchId);
  const maxAmount = Number(selectedBatch?.quantity ?? 0);
  const step = STEP_BY_UNIT[item.unit] ?? 1;

  function selectBatch(batch: FridgeItemBatch) {
    setBatchId(batch.id);
    setAmount(resolveDefaultAmount(batch, item.unit));
  }

  function selectChoice(value: string) {
    setChoice(value as EndChoice);
  }

  function submitRecord() {
    if (choice === 'subdivide') {
      onClose();
      onSubdivide();
      return;
    }
    if (!selectedBatch || amount <= 0) return;

    recordMutation.mutate(
      { batchId: selectedBatch.id, kind: choice, amount },
      {
        onSuccess: () => {
          Toast.success(
            `${item.name} ${formatIngredientAmount(amount, item.unit, true)} ${END_KIND_LABEL[choice]}으로 남겼어요`,
          );
          onClose();
        },
        onError: (error) =>
          Toast.error(error instanceof Error ? error.message : '끝 기록 중 오류가 발생했습니다'),
      },
    );
  }

  function undoRecord(recordId: string) {
    undoMutation.mutate(recordId, {
      onSuccess: () => Toast.success('끝 기록을 되돌렸어요'),
      onError: (error) =>
        Toast.error(error instanceof Error ? error.message : '되돌리는 중 오류가 발생했습니다'),
    });
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <BottomSheet.Header heading={`${item.name} 끝 기록`} />
      <BottomSheet.Content>
        <div className="flex flex-col gap-4 pb-2">
          <p className="text-sm text-gray-500">
            구매분을 고르고 다 먹었는지 버렸는지 남겨요. 오래된 구매분이 먼저 골라져 있어요.
          </p>

          {/* 구매분 */}
          <section className="flex flex-col gap-2">
            <span className="text-xs font-medium text-gray-500">구매분</span>
            <Activity visible={batches.length === 0}>
              <p className="py-3 text-center text-sm text-gray-400">남은 구매분이 없어요</p>
            </Activity>
            {batches.map((batch) => (
              <button
                key={batch.id}
                type="button"
                onClick={() => selectBatch(batch)}
                className={cn(
                  'flex items-center justify-between rounded-lg border px-3 py-2.5 text-left',
                  batch.id === batchId
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-gray-200 bg-white',
                )}
              >
                <span className="text-sm text-gray-900">
                  {format(new Date(batch.purchased_date), 'M/d')} 구매
                </span>
                <span className="text-sm font-semibold text-gray-900">
                  남은 {formatIngredientAmount(Number(batch.quantity), item.unit, true)}
                </span>
              </button>
            ))}
          </section>

          {/* 어떻게 끝났나요 */}
          <section className="flex flex-col gap-2">
            <span className="text-xs font-medium text-gray-500">어떻게 끝났나요</span>
            <SegmentControl.Root value={choice} onValueChange={selectChoice}>
              <SegmentControl.Item value="eaten">다 먹음</SegmentControl.Item>
              <SegmentControl.Item value="discarded">버림</SegmentControl.Item>
              <SegmentControl.Item value="subdivide">소분함</SegmentControl.Item>
            </SegmentControl.Root>
          </section>

          {/* 개수 */}
          <Activity visible={choice !== 'subdivide' && !!selectedBatch}>
            <section className="flex flex-col gap-2">
              <span className="text-xs font-medium text-gray-500">개수</span>
              <div className="flex items-center gap-3">
                <Counter
                  value={amount}
                  onValueChange={setAmount}
                  min={step}
                  max={maxAmount}
                  step={step}
                  className="w-40"
                />
                <span className="text-xs text-gray-400">
                  최대 {formatIngredientAmount(maxAmount, item.unit, true)}
                </span>
              </div>
            </section>
          </Activity>

          {/* 최근 기록 */}
          <Activity visible={records.length > 0}>
            <section className="flex flex-col gap-2">
              <span className="text-xs font-medium text-gray-500">최근 기록</span>
              <ul className="flex flex-col gap-1.5">
                {records.map((record) => (
                  <li
                    key={record.id}
                    className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
                  >
                    <span className="text-sm text-gray-700">
                      {format(new Date(record.ended_on), 'M/d')} {END_KIND_LABEL[record.kind]}{' '}
                      {formatIngredientAmount(Number(record.amount), item.unit, true)}
                    </span>
                    <button
                      type="button"
                      onClick={() => undoRecord(record.id)}
                      disabled={undoMutation.isPending}
                      className="text-sm font-semibold text-emerald-600 disabled:text-gray-300"
                    >
                      되돌리기
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </Activity>

          <CTAPrimitive
            type="button"
            color="confirm"
            variant="filled"
            onClick={submitRecord}
            disabled={
              recordMutation.isPending ||
              (choice !== 'subdivide' && (!selectedBatch || amount <= 0))
            }
          >
            {choice === 'subdivide' ? '소분 화면으로' : '기록하기'}
          </CTAPrimitive>
          <p className="text-center text-[11px] text-gray-400">
            금액은 이 시트에 쓰지 않아요 · 삭제는 재료 수정 화면에 있어요
          </p>
        </div>
      </BottomSheet.Content>
    </BottomSheet>
  );
}
