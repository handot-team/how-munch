'use client';

import { useMemo, useState } from 'react';

import { useForm } from '@tanstack/react-form';
import { format } from 'date-fns';
import { ChevronRight } from 'lucide-react';
import { z } from 'zod';

import { cn, ERROR_MSG } from '@/commons/lib';
import { Button, ComboBox, Counter, DatePicker, Input, PriceInput, Select } from '@/commons/ui';
import { Form } from '@/commons/ui/Form';

import {
  convertIngredientAmount,
  isVolumeUnit,
  isWeightUnit,
  normalizeAmountByUnit,
  resolveAmountMin,
  resolveAmountStep,
  validateAmountPrecisionByUnit,
  type IngredientUnit,
} from '@/entities/ingredient';
import {
  CategoryFormField,
  resolveDefaultCategoryId,
  useIngredientCategoriesQuery,
} from '@/entities/ingredient-category';

export interface IngredientFormValues {
  date: string;
  category_id: string;
  name: string;
  brand: string;
  count: number;
  unit: IngredientUnit;
  store: string;
  price: number;
}

interface IngredientFormProps {
  id?: string;
  formId?: string;
  defaultValues?: Partial<IngredientFormValues>;
  storeNames?: string[];
  onSubmit: (values: IngredientFormValues) => void;
  onDelete?: (id: string) => void;
  isSubmitting?: boolean;
  isDeleting?: boolean;
  submitLabel?: string;
  disableUnitSelect?: boolean;
  householdId?: string | null;
  /** 품목명 검색 Screen 진입 핸들러 — 선택값은 form name 필드에 반영된다 */
  onOpenProductNameSearch?: (currentName: string, onSelect: (name: string) => void) => void;
  /** 브랜드 검색 Screen 진입 핸들러 — 선택값은 form brand 필드에 반영된다 */
  onOpenBrandSearch?: (currentBrand: string, onSelect: (brand: string) => void) => void;
}

/** 담기 목록도 단건 폼과 같은 검사 규칙을 쓰도록 밖에서 꺼내 쓴다. */
export function createIngredientFormSchema(categoryIds: string[]) {
  return z
    .object({
      date: z
        .string()
        .min(1, ERROR_MSG.SELECT.REQUIRED({ fieldName: '날짜' }))
        .regex(/^\d{4}-\d{2}-\d{2}$/, ERROR_MSG.FORMAT.INVALID({ fieldName: '날짜' })),
      category_id: z.string().refine((value) => categoryIds.includes(value), {
        message: ERROR_MSG.SELECT.REQUIRED({ fieldName: '카테고리' }),
      }),
      name: z
        .string()
        .trim()
        .min(1, ERROR_MSG.INPUT.REQUIRED({ fieldName: '품목명' }))
        .max(20, ERROR_MSG.RANGE.MAX({ fieldName: '품목명', max: '20자' })),
      brand: z.string().max(30, ERROR_MSG.RANGE.MAX({ fieldName: '브랜드', max: '30자' })),
      count: z.number().max(1_000_000, ERROR_MSG.RANGE.MAX({ fieldName: '수량', max: '100만' })),
      unit: z.enum(['count', 'g', 'kg', 'ml', 'l']),
      store: z.string().max(20, ERROR_MSG.RANGE.MAX({ fieldName: '구매처', max: '20자' })),
      price: z
        .number()
        .min(100, ERROR_MSG.RANGE.MIN({ fieldName: '가격', min: '100원' }))
        .max(100_000_000, ERROR_MSG.RANGE.MAX({ fieldName: '가격', max: '1억원' })),
    })
    .superRefine((value, ctx) => {
      const minCount = resolveAmountMin(value.unit);

      if (value.count < minCount) {
        ctx.addIssue({
          code: 'custom',
          path: ['count'],
          message: ERROR_MSG.RANGE.MIN({ fieldName: '수량', min: minCount }),
        });
      }

      if (!validateAmountPrecisionByUnit(value.count, value.unit)) {
        ctx.addIssue({
          code: 'custom',
          path: ['count'],
          message:
            value.unit === 'kg' || value.unit === 'l'
              ? '수량은 소수점 첫째 자리까지 입력할 수 있습니다'
              : '수량은 정수만 입력할 수 있습니다',
        });
      }
    });
}

function parseDateValue(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function IngredientForm({
  id,
  formId,
  defaultValues,
  storeNames = [],
  onSubmit,
  onDelete,
  isSubmitting,
  isDeleting,
  submitLabel,
  disableUnitSelect = false,
  householdId = null,
  onOpenProductNameSearch,
  onOpenBrandSearch,
}: IngredientFormProps) {
  const { data: categoryOptions = [] } = useIngredientCategoriesQuery(householdId);
  const categoryIds = useMemo(
    () => categoryOptions.map((category) => category.id),
    [categoryOptions],
  );
  const ingredientFormSchema = useMemo(
    () => createIngredientFormSchema(categoryIds),
    [categoryIds],
  );
  const defaultCategoryId = useMemo(
    () => resolveDefaultCategoryId(categoryOptions, defaultValues?.category_id),
    [categoryOptions, defaultValues?.category_id],
  );
  const initialUnit = (defaultValues?.unit ?? 'count') as IngredientUnit;
  const [selectedUnit, setSelectedUnit] = useState<IngredientUnit>(initialUnit);
  const today = new Date();
  const form = useForm({
    defaultValues: {
      date: defaultValues?.date ?? format(new Date(), 'yyyy-MM-dd'),
      category_id: defaultCategoryId,
      name: defaultValues?.name ?? '',
      brand: defaultValues?.brand ?? '',
      count: defaultValues?.count ?? 1,
      unit: initialUnit,
      store: defaultValues?.store ?? '',
      price: defaultValues?.price ?? 100,
    },
    validators: {
      onSubmit: ingredientFormSchema,
      onChange: ingredientFormSchema,
    },
    onSubmit: async ({ value }) => {
      onSubmit(value);
    },
  });

  const isEditMode = Boolean(id);
  const countStep = resolveAmountStep(selectedUnit);
  const countMin = resolveAmountMin(selectedUnit);

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

      {/* 카테고리 */}
      <form.Field name="category_id">
        {(field) => <CategoryFormField field={field} options={categoryOptions} />}
      </form.Field>

      {/* 품목명 */}
      <form.Field name="name">
        {(field) => (
          <Form.Field field={field}>
            <Form.Label required>품목명</Form.Label>
            <Form.Control>
              {onOpenProductNameSearch ? (
                <button
                  type="button"
                  onClick={() =>
                    onOpenProductNameSearch(field.state.value, (name) => field.handleChange(name))
                  }
                  className={cn(
                    'border-input flex h-10 w-full items-center justify-between rounded-md border bg-white px-3 text-sm',
                    'hover:bg-accent transition-colors',
                    field.state.meta.errors.length > 0 && 'border-destructive',
                    !field.state.value && 'text-muted-foreground',
                  )}
                >
                  <span>{field.state.value || '품목명을 검색하세요'}</span>
                  <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                </button>
              ) : (
                <Input
                  placeholder="예: 삼겹살"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              )}
            </Form.Control>
            <Form.Error />
          </Form.Field>
        )}
      </form.Field>

      {/* 브랜드 */}
      <form.Field name="brand">
        {(field) => (
          <Form.Field field={field}>
            <Form.Label>브랜드</Form.Label>
            <Form.Control>
              {onOpenBrandSearch ? (
                <button
                  type="button"
                  onClick={() =>
                    onOpenBrandSearch(field.state.value, (brand) => field.handleChange(brand))
                  }
                  className={cn(
                    'border-input flex h-10 w-full items-center justify-between rounded-md border bg-white px-3 text-sm',
                    'hover:bg-accent transition-colors',
                    field.state.meta.errors.length > 0 && 'border-destructive',
                    !field.state.value && 'text-muted-foreground',
                  )}
                >
                  <span>{field.state.value || '브랜드를 검색하세요'}</span>
                  <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                </button>
              ) : (
                <Input
                  placeholder="예: 풀무원"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              )}
            </Form.Control>
            <Form.Error />
          </Form.Field>
        )}
      </form.Field>

      {/* 수량 + 단위 */}
      <div className="grid gap-1.5">
        <div className="flex gap-2">
          <form.Field name="count">
            {(field) => (
              <Form.Field field={field} className="flex-1">
                <Form.Label required>수량</Form.Label>
                <Form.Control>
                  <Counter
                    key={`ingredient-count-${selectedUnit}`}
                    value={field.state.value}
                    min={countMin}
                    step={countStep}
                    onValueChange={(nextValue) =>
                      field.handleChange(normalizeAmountByUnit(nextValue, selectedUnit))
                    }
                    invalid={Boolean(field.state.meta.errors[0])}
                  />
                </Form.Control>
              </Form.Field>
            )}
          </form.Field>
          <form.Field name="unit">
            {(field) => (
              <Form.Field field={field} className="w-24">
                <Form.Label required>단위</Form.Label>
                <Select
                  value={field.state.value}
                  disabled={disableUnitSelect}
                  onValueChange={(value) => {
                    const nextUnit = value as IngredientUnit;
                    const currentUnit = field.state.value;
                    const currentCount = form.state.values.count;
                    const convertedCount = convertIngredientAmount(
                      currentCount,
                      currentUnit,
                      nextUnit,
                    );

                    field.handleChange(nextUnit);
                    setSelectedUnit(nextUnit);
                    if (convertedCount !== null) {
                      form.setFieldValue('count', normalizeAmountByUnit(convertedCount, nextUnit));
                      return;
                    }

                    if (
                      isWeightUnit(currentUnit) ||
                      isWeightUnit(nextUnit) ||
                      isVolumeUnit(currentUnit) ||
                      isVolumeUnit(nextUnit)
                    ) {
                      form.setFieldValue('count', resolveAmountMin(nextUnit));
                    }
                  }}
                >
                  <Form.Control>
                    <Select.Trigger>
                      <Select.Value placeholder="단위" />
                    </Select.Trigger>
                  </Form.Control>
                  <Select.Content>
                    <Select.Item value="count">개</Select.Item>
                    <Select.Item value="g">g</Select.Item>
                    <Select.Item value="kg">kg</Select.Item>
                    <Select.Item value="ml">ml</Select.Item>
                    <Select.Item value="l">L</Select.Item>
                  </Select.Content>
                </Select>
              </Form.Field>
            )}
          </form.Field>
        </div>
        <form.Field name="count">
          {(field) => (
            <Form.Field field={field}>
              <Form.Error />
            </Form.Field>
          )}
        </form.Field>
      </div>

      {/* 구매처 */}
      <form.Field name="store">
        {(field) => (
          <Form.Field field={field}>
            <Form.Label>구매처</Form.Label>
            <ComboBox value={field.state.value} onValueChange={field.handleChange}>
              <Form.Control>
                <ComboBox.Input placeholder="구매처를 입력하거나 선택하세요" />
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

      {/* 가격 */}
      <form.Field name="price">
        {(field) => (
          <Form.Field field={field}>
            <Form.Label required>가격</Form.Label>
            <Form.Control>
              <PriceInput value={field.state.value} onChange={field.handleChange} />
            </Form.Control>
            <Form.Error />
          </Form.Field>
        )}
      </form.Field>

      {isEditMode && onDelete ? (
        <div className="mt-2 flex gap-2">
          <Button type="submit" className="flex-1" disabled={Boolean(isSubmitting || isDeleting)}>
            {isSubmitting ? '수정 중...' : (submitLabel ?? '수정')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1 text-red-600 hover:text-red-700"
            disabled={Boolean(isSubmitting || isDeleting)}
            onClick={() => {
              if (!id || !onDelete) return;
              onDelete(id);
            }}
          >
            {isDeleting ? '삭제 중...' : '삭제'}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
