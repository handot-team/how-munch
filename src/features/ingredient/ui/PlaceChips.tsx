'use client';

import { useState } from 'react';

import { format } from 'date-fns';
import { Check, ChevronDown } from 'lucide-react';

import { cn } from '@/commons/lib';
import { BottomSheet, Calendar, Input } from '@/commons/ui';

import { fieldClass, longDate, tone } from './StagingParts';

/** 값 하나를 고르는 약한 버튼. 누르면 바텀시트가 열린다. */
function SheetChip({
  label,
  placeholder,
  onClick,
  ariaLabel,
}: {
  label: string;
  placeholder: string;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-haspopup="dialog"
      onClick={onClick}
      className={cn(
        'flex h-10 min-w-0 items-center gap-1 rounded-full px-3.5 text-[15px] font-medium',
        tone.fill,
        label ? tone.text : tone.hint,
      )}
    >
      <span className="truncate">{label || placeholder}</span>
      <ChevronDown className={cn('size-4 shrink-0', tone.hint)} />
    </button>
  );
}

/**
 * 날짜와 구매처를 한 줄에 두 버튼으로 둔다. 시트 하나가 정하는 것은 하나다(시안 v6).
 * - 날짜 시트: 달력에서 날짜를 누르면 바로 닫힌다. 확인 버튼이 없다.
 * - 구매처 시트: 기록에 있는 구매처 줄을 누르면 바로 닫힌다. 새 이름은 쓰고 Enter로 정한다. 확인 버튼이 없다.
 */
export function PlaceChips({
  date,
  store,
  storeOptions,
  onChange,
}: {
  date: string;
  store: string;
  storeOptions: string[];
  onChange: (updates: { date?: string; store?: string }) => void;
}) {
  const [open, setOpen] = useState<'date' | 'store' | null>(null);
  const [draft, setDraft] = useState(store);
  const close = () => setOpen(null);
  const pickStore = (value: string) => {
    onChange({ store: value.trim() });
    close();
  };
  const query = draft.trim();
  const shownStores = [...new Set(storeOptions)].filter((s) => !query || s.includes(query));

  return (
    <div className="flex min-w-0 gap-2">
      <SheetChip
        ariaLabel="날짜 바꾸기"
        label={longDate(date)}
        placeholder="날짜"
        onClick={() => setOpen('date')}
      />
      <SheetChip
        ariaLabel="구매처 바꾸기"
        label={store}
        placeholder="구매처"
        onClick={() => {
          setDraft('');
          setOpen('store');
        }}
      />

      <BottomSheet open={open === 'date'} onClose={close}>
        <BottomSheet.Header heading="날짜" />
        <BottomSheet.Content className="relative pb-6">
          <Calendar
            mode="single"
            selected={new Date(date)}
            defaultMonth={new Date(date)}
            disabled={{ after: new Date() }}
            onSelect={(d) => {
              if (d) onChange({ date: format(d, 'yyyy-MM-dd') });
              close();
            }}
            className="mx-auto w-full max-w-[340px] border-none p-0"
          />
        </BottomSheet.Content>
      </BottomSheet>

      <BottomSheet open={open === 'store'} onClose={close}>
        <BottomSheet.Header heading="구매처" />
        <BottomSheet.Content className="flex flex-col gap-1 pb-6">
          <Input
            value={draft}
            placeholder="새 구매처는 쓰고 Enter"
            aria-label="구매처 이름"
            className={fieldClass}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing && draft.trim()) {
                e.preventDefault();
                pickStore(draft);
              }
            }}
            enterKeyHint="done"
            autoComplete="off"
          />
          <ul className="flex flex-col pt-2">
            {shownStores.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  onClick={() => pickStore(name)}
                  className={cn(
                    'flex h-14 w-full items-center justify-between rounded-xl px-2 text-left text-[17px] active:bg-[#F2F4F6]',
                    tone.text,
                  )}
                >
                  {name}
                  {name === store ? <Check className="size-5 text-emerald-700" /> : null}
                </button>
              </li>
            ))}
          </ul>
        </BottomSheet.Content>
      </BottomSheet>
    </div>
  );
}
