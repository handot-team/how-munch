'use client';

import { Camera, PenLine, UtensilsCrossed } from 'lucide-react';

import { BottomSheet } from '@/commons/ui';

interface StoreAddMethodSheetProps {
  open: boolean;
  onClose: () => void;
  onGroceryDirectAdd: () => void;
  onGroceryReceiptAdd: () => void;
  onDiningAdd: () => void;
}

interface MethodItemProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

function MethodItem({ icon, label, onClick }: MethodItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-14 items-center gap-3 rounded-xl px-3 text-left text-[17px] font-semibold text-[#191F28] transition-colors active:bg-gray-100"
    >
      <span className="flex size-6 shrink-0 items-center justify-center text-[#6B7684]">
        {icon}
      </span>
      {label}
    </button>
  );
}

/**
 * 식비 추가 방식 선택 시트.
 * 라벨에 "장보기 / 외식비"를 드러내야 외식비가 끼어도 무엇을 추가하는지 모호해지지 않는다.
 * 시안 v6: 이 시트가 정하는 것은 "무엇을 넣을지" 하나다. 부제를 빼고 아이콘은 같은 회색 하나로 맞췄다.
 * 행을 누르면 확인 없이 바로 다음으로 간다(영수증은 사진 고르기 창이 바로 열린다).
 */
export function StoreAddMethodSheet({
  open,
  onClose,
  onGroceryDirectAdd,
  onGroceryReceiptAdd,
  onDiningAdd,
}: StoreAddMethodSheetProps) {
  return (
    <BottomSheet.Root open={open} onClose={onClose}>
      <BottomSheet.Header heading="무엇을 넣을까요" />
      <BottomSheet.Content className="flex flex-col gap-1 px-4 pt-2 pb-6">
        <MethodItem
          icon={<PenLine className="size-5" />}
          label="장보기 직접 쓰기"
          onClick={onGroceryDirectAdd}
        />
        <MethodItem
          icon={<Camera className="size-5" />}
          label="영수증으로 넣기"
          onClick={onGroceryReceiptAdd}
        />
        <MethodItem
          icon={<UtensilsCrossed className="size-5" />}
          label="외식비"
          onClick={onDiningAdd}
        />
      </BottomSheet.Content>
    </BottomSheet.Root>
  );
}
