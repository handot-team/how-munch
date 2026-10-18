'use client';

import { useForm } from '@tanstack/react-form';
import { format } from 'date-fns';
import { z } from 'zod';

import { ERROR_MSG } from '@/commons/lib';
import { ComboBox, DatePicker, Input, PriceInput, SegmentControl, Textarea } from '@/commons/ui';
import { Form } from '@/commons/ui/Form';

import {
  DINING_EXPENSE_KIND_LABEL,
  isDiningExpenseKind,
  type DiningExpenseKind,
} from '@/entities/dining-expense';

export interface DiningExpenseFormValues {
  date: string;
  kind: DiningExpenseKind;
  brand: string;
  name: string;
  store: string;
  price: number;
  memo: string;
}

const diningExpenseFormSchema = z.object({
  date: z
    .string()
    .min(1, ERROR_MSG.SELECT.REQUIRED({ fieldName: '날짜' }))
    .regex(/^\d{4}-\d{2}-\d{2}$/, ERROR_MSG.FORMAT.INVALID({ fieldName: '날짜' })),
  kind: z.enum(['restaurant', 'delivery']),
  brand: z
    .string()
    .trim()
    .min(1, ERROR_MSG.INPUT.REQUIRED({ fieldName: '가게' }))
    .max(30, ERROR_MSG.RANGE.MAX({ fieldName: '가게', max: '30자' })),
  name: z.string().max(20, ERROR_MSG.RANGE.MAX({ fieldName: '메뉴', max: '20자' })),
  store: z.string().max(20, ERROR_MSG.RANGE.MAX({ fieldName: '플랫폼', max: '20자' })),
  price: z
    .number()
    .min(100, ERROR_MSG.RANGE.MIN({ fieldName: '금액', min: '100원' }))
    .max(100_000_000, ERROR_MSG.RANGE.MAX({ fieldName: '금액', max: '1억원' })),
  memo: z.string().max(100, ERROR_MSG.RANGE.MAX({ fieldName: '메모', max: '100자' })),
});

function parseDateValue(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

const KINDS: DiningExpenseKind[] = ['restaurant', 'delivery'];

interface DiningExpenseFormProps {
  formId?: string;
  defaultValues?: Partial<DiningExpenseFormValues>;
  /** 가게명 자동완성 후보 */
  brandNames?: string[];
  /** 포장·배달 플랫폼 자동완성 후보 */
  storeNames?: string[];
  onSubmit: (values: DiningExpenseFormValues) => void;
  /** kind가 바뀔 때 자동완성 후보 스코프를 다시 잡기 위해 상위로 알린다 */
  onKindChange?: (kind: DiningExpenseKind) => void;
}

export function DiningExpenseForm({
  formId,
  defaultValues,
  brandNames = [],
  storeNames = [],
  onSubmit,
  onKindChange,
}: DiningExpenseFormProps) {
  const today = new Date();
  const form = useForm({
    defaultValues: {
      date: defaultValues?.date ?? format(today, 'yyyy-MM-dd'),
      kind: defaultValues?.kind ?? ('restaurant' as DiningExpenseKind),
      brand: defaultValues?.brand ?? '',
      name: defaultValues?.name ?? '',
      store: defaultValues?.store ?? '',
      // 시안 v6: 금액 기본값 100 대신 빈칸에서 시작한다
      price: defaultValues?.price ?? 0,
      memo: defaultValues?.memo ?? '',
    },
    validators: {
      onSubmit: diningExpenseFormSchema,
      onChange: diningExpenseFormSchema,
    },
    onSubmit: async ({ value }) => {
      onSubmit(value);
    },
  });

  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
      className="flex flex-col gap-4"
    >
      {/* 날짜 */}
      <form.Field name="date">
        {(field) => (
          <Form.Field field={field}>
            <Form.Label required>날짜</Form.Label>
            <Form.Control>
              <DatePicker
                value={parseDateValue(field.state.value)}
                onChange={(date) =>
                  field.handleChange(date ? format(date, 'yyyy-MM-dd') : field.state.value)
                }
                maxDate={today}
                placeholder="날짜를 선택하세요"
              />
            </Form.Control>
            <Form.Error />
          </Form.Field>
        )}
      </form.Field>

      {/* 식당 / 포장·배달 */}
      <form.Field name="kind">
        {(field) => (
          <Form.Field field={field}>
            <Form.Label required>종류</Form.Label>
            <Form.Control>
              <SegmentControl
                value={field.state.value}
                onValueChange={(next) => {
                  if (!isDiningExpenseKind(next)) return;
                  field.handleChange(next);
                  // 식당은 결제 채널을 따로 두지 않으므로 남아 있던 플랫폼 값을 지운다.
                  if (next === 'restaurant') form.setFieldValue('store', '');
                  onKindChange?.(next);
                }}
                aria-label="외식비 종류"
              >
                {KINDS.map((kind) => (
                  <SegmentControl.Item key={kind} value={kind}>
                    {DINING_EXPENSE_KIND_LABEL[kind]}
                  </SegmentControl.Item>
                ))}
              </SegmentControl>
            </Form.Control>
            <Form.Error />
          </Form.Field>
        )}
      </form.Field>

      {/* 가게 */}
      <form.Field name="brand">
        {(field) => (
          <Form.Field field={field}>
            <Form.Label required>가게</Form.Label>
            <ComboBox value={field.state.value} onValueChange={field.handleChange}>
              <Form.Control>
                <ComboBox.Input placeholder="예: ○○숯불갈비" />
              </Form.Control>
              <ComboBox.List>
                <ComboBox.Empty>검색 결과가 없습니다</ComboBox.Empty>
                {brandNames.map((name) => (
                  <ComboBox.Item key={name} value={name}>
                    {name}
                  </ComboBox.Item>
                ))}
              </ComboBox.List>
            </ComboBox>
            <Form.Error />
          </Form.Field>
        )}
      </form.Field>

      {/* 메뉴 */}
      <form.Field name="name">
        {(field) => (
          <Form.Field field={field}>
            <Form.Label>메뉴</Form.Label>
            <Form.Control>
              <Input
                placeholder="예: 삼겹살"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </Form.Control>
            <Form.Error />
          </Form.Field>
        )}
      </form.Field>

      {/* 플랫폼 — 포장·배달일 때만 노출한다. 식당에는 결제 채널 개념이 없다.
          직접 픽업한 포장처럼 채널이 없는 경우는 비워 둔다. */}
      <form.Subscribe selector={(state) => state.values.kind}>
        {(kind) =>
          kind === 'delivery' ? (
            <form.Field name="store">
              {(field) => (
                <Form.Field field={field}>
                  <Form.Label>플랫폼</Form.Label>
                  <ComboBox value={field.state.value} onValueChange={field.handleChange}>
                    <Form.Control>
                      <ComboBox.Input placeholder="예: 배달의민족" />
                    </Form.Control>
                    <ComboBox.List>
                      <ComboBox.Empty>검색 결과가 없습니다</ComboBox.Empty>
                      {storeNames.map((name) => (
                        <ComboBox.Item key={name} value={name}>
                          {name}
                        </ComboBox.Item>
                      ))}
                    </ComboBox.List>
                  </ComboBox>
                  <Form.Error />
                </Form.Field>
              )}
            </form.Field>
          ) : null
        }
      </form.Subscribe>

      {/* 금액 */}
      <form.Field name="price">
        {(field) => (
          <Form.Field field={field}>
            <Form.Label required>금액</Form.Label>
            <Form.Control>
              <PriceInput
                value={field.state.value}
                onChange={field.handleChange}
                blankWhenZero
                placeholder="금액"
              />
            </Form.Control>
            <Form.Error />
          </Form.Field>
        )}
      </form.Field>

      {/* 메모 */}
      <form.Field name="memo">
        {(field) => (
          <Form.Field field={field}>
            <Form.Label>메모</Form.Label>
            <Form.Control>
              <Textarea
                placeholder="함께 먹은 사람, 상황 등을 남겨보세요"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                invalid={Boolean(field.state.meta.errors[0])}
              />
            </Form.Control>
            <Form.Error />
          </Form.Field>
        )}
      </form.Field>
    </form>
  );
}
