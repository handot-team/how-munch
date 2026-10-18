'use client';

import { useMemo } from 'react';

import { cn } from '@/commons/lib';
import { Chip, ChipRow, Input } from '@/commons/ui';

import { useSearchFilter } from '@/entities/search-synonym';

/**
 * 시안 색. 토스 디자인 시스템(TDS)의 회색 단계와 앱 브랜드 초록 하나만 쓰고,
 * 경고는 빨강(실패)과 주황(가격 없음) 두 가지로만 쓴다. 테두리 대신 면과 여백으로 나눈다.
 * 작은 글자는 흰 바탕 대비 4.5:1을 넘는 단계만 쓴다.
 */
export const tone = {
  text: 'text-[#191F28]',
  label: 'text-[#4E5968]',
  sub: 'text-[#6B7684]',
  hint: 'text-[#6B7684]',
  fill: 'bg-[#F2F4F6]',
  panel: 'bg-[#F9FAFB]',
  red: 'text-[#DC2626]',
  orange: 'text-[#C2410C]',
};

/** 테두리 없는 회색 칸(TDS TextField box형 모양) */
export const fieldClass =
  'h-12 rounded-xl border-0 bg-[#F2F4F6] px-4 text-base shadow-none placeholder:text-[#6B7684] focus-visible:ring-2 focus-visible:ring-emerald-700/30';

export function longDate(date: string) {
  const [, m, d] = date.split('-');
  return `${Number(m)}월 ${Number(d)}일`;
}

/** 받침이 있으면 '을', 없으면 '를' */
export function objectParticle(word: string) {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return '를';
  return (code - 0xac00) % 28 === 0 ? '를' : '을';
}

const getNameTexts = (name: string) => [name];

/** 입력값으로 추천 이름을 고른다. 검색 화면과 같은 이름·유사어 목록(useSearchFilter)을 쓴다. */
export function useNameSuggestions(options: string[], value: string, limit = 6) {
  const unique = useMemo(() => [...new Set(options)], [options]);
  const { exact, similar } = useSearchFilter(unique, value, getNameTexts);
  const query = value.trim();
  if (!query) return [];
  return [...new Set([...exact.filter((n) => n !== query), ...similar])].slice(0, limit);
}

/** 입력칸 아래 추천 줄(시안 v5 입력줄 추천 칩 그대로). 누르면 그 이름으로 채운다. */
export function SuggestionRow({
  names,
  onPick,
}: {
  names: string[];
  onPick: (name: string) => void;
}) {
  if (names.length === 0) return null;
  return (
    <ChipRow className="pb-0">
      {names.map((name) => (
        <Chip
          key={name}
          role="button"
          aria-checked={undefined}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(name)}
          className={cn(
            'h-10 border-0 bg-[#F2F4F6] px-3.5 py-0 text-[15px] hover:bg-[#F2F4F6]',
            tone.text,
          )}
        >
          {name}
        </Chip>
      ))}
    </ChipRow>
  );
}

/** 가격 칸. 0원은 빈칸으로 보이고(기본값 없음), 숫자를 치면 쉼표와 '원'이 붙는다. */
export function PriceField({
  value,
  onChange,
  inputRef,
  onEnter,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  inputRef?: React.Ref<HTMLInputElement>;
  onEnter?: () => void;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <Input
        ref={inputRef}
        inputMode="numeric"
        enterKeyHint="done"
        placeholder="가격"
        aria-label="가격"
        className={cn(fieldClass, 'font-semibold', value > 0 && 'pr-10')}
        value={value > 0 ? value.toLocaleString('ko-KR') : ''}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '');
          onChange(digits ? Math.min(Number.parseInt(digits, 10), 100_000_000) : 0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onEnter?.();
          }
        }}
      />
      {value > 0 ? (
        <span
          className={cn(
            'pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-base',
            tone.sub,
          )}
        >
          원
        </span>
      ) : null}
    </div>
  );
}
