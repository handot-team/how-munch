'use client';

import { ShoppingBasket, UtensilsCrossed } from 'lucide-react';

import { BottomSheet } from '@/commons/ui';

interface StoreAddMethodSheetProps {
  open: boolean;
  onClose: () => void;
  onGroceryAdd: () => void;
  onDiningAdd: () => void;
}

interface MethodItemProps {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  description: string;
  onClick: () => void;
}

function MethodItem({ icon, iconBg, label, description, onClick }: MethodItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl px-3 py-4 text-left text-gray-800 transition-colors active:bg-gray-100"
    >
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${iconBg}`}>
        {icon}
      </span>
      <div className="flex flex-col">
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-xs text-gray-400">{description}</span>
      </div>
    </button>
  );
}

/**
 * 식비 추가 방식 선택 시트.
 * 라벨에 "장보기 / 외식비"를 드러내야 외식비가 끼어도 무엇을 추가하는지 모호해지지 않는다.
 * 장보기 입구는 하나다. 품목이 몇 개인지, 영수증인지는 추가 화면 안에서 고른다.
 */
export function StoreAddMethodSheet({
  open,
  onClose,
  onGroceryAdd,
  onDiningAdd,
}: StoreAddMethodSheetProps) {
  return (
    <BottomSheet.Root open={open} onClose={onClose}>
      <BottomSheet.Content className="flex flex-col gap-2 px-4 pt-3 pb-6">
        <MethodItem
          icon={<ShoppingBasket className="size-5 text-emerald-600" />}
          iconBg="bg-emerald-50"
          label="장보기 추가"
          description="직접 입력하거나 영수증을 찍어요"
          onClick={onGroceryAdd}
        />
        <MethodItem
          icon={<UtensilsCrossed className="size-5 text-orange-600" />}
          iconBg="bg-orange-50"
          label="외식비 입력"
          description="외식 비용을 기록할 때 사용해요"
          onClick={onDiningAdd}
        />
      </BottomSheet.Content>
    </BottomSheet.Root>
  );
}
