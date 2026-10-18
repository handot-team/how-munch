'use client';

import { Toaster } from 'sonner';

export function ToastProvider() {
  // 시안 v4: TDS 토스트처럼 아래쪽에 짙은 회색으로 띄운다(위쪽 초록 상자와 닫기 X는 엄지가 닿기 어렵고 토스 색이 아니다).
  // 식비 탭의 하단 탭 바와 입구 버튼을 가리지 않게 그 위에 둔다.
  return (
    <Toaster
      position="bottom-center"
      offset={{ bottom: 'calc(env(safe-area-inset-bottom) + 160px)' }}
      mobileOffset={{ bottom: 'calc(env(safe-area-inset-bottom) + 160px)', left: 16, right: 16 }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'flex w-full items-center gap-2.5 rounded-2xl bg-[#191F28] px-5 py-3.5 text-[15px] font-medium text-white',
          success: '[&_[data-icon]]:text-emerald-300',
          error: '[&_[data-icon]]:text-[#FF8A8A]',
          warning: '[&_[data-icon]]:text-[#FFC266]',
        },
      }}
    />
  );
}
