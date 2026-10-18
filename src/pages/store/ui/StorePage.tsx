'use client';

import { useState } from 'react';

import { addMonths, endOfMonth, format, startOfMonth, subMonths } from 'date-fns';
import { ko } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { overlay } from 'overlay-kit';

import { stackFlowActions } from '@/apps/stackflow/StackFlow';

import { Button } from '@/commons/ui';

import { type FoodExpense, type FoodExpenseFilterKind } from '@/entities/food-expense';

import { BudgetSummaryStrip, toYearMonth } from '@/features/budget';
import {
  FoodExpenseKindFilter,
  FoodExpenseList,
  sumFoodExpensePrice,
  toDiningExpense,
  toIngredient,
  useFoodExpensesQuery,
  useFoodExpenseSuggestionsQuery,
} from '@/features/food-expense';

import { StoreAddMethodSheet } from './StoreAddMethodSheet';

interface StorePageProps {
  householdId: string;
  userId: string;
}

export function StorePage({ householdId, userId }: StorePageProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [kind, setKind] = useState<FoodExpenseFilterKind>('all');

  const yearMonth = toYearMonth(currentDate);
  const startDate = format(startOfMonth(currentDate), 'yyyy-MM-dd');
  const endDate = format(endOfMonth(currentDate), 'yyyy-MM-dd');

  const { data: expenses = [], isLoading } = useFoodExpensesQuery(
    householdId,
    startDate,
    endDate,
    kind,
  );

  const totalSpending = sumFoodExpensePrice(expenses);
  // 품목명 자동완성은 장보기 이름만 모은다. 외식 메뉴는 냉장고 품목이 아니다.
  // 화면의 종류 필터와 분리해 따로 조회한다. 목록에서 뽑으면 포장·배달만 보고 있을 때 후보가 비어버린다.
  const { data: grocerySuggestions = [] } = useFoodExpenseSuggestionsQuery(
    householdId,
    'name',
    'grocery',
  );

  const handlePrevMonth = () => setCurrentDate((d) => subMonths(d, 1));
  const handleNextMonth = () => setCurrentDate((d) => addMonths(d, 1));

  // 장보기 추가 화면이 곧 담은 목록이다. 직접 입력과 영수증이 한 화면에서 만난다.
  function openGroceryAdd() {
    stackFlowActions.push('PromptIngredientStagingActivity', {
      householdId,
      userId,
      suggestions: grocerySuggestions,
    });
  }

  function openBudget() {
    stackFlowActions.push('BudgetActivity', { householdId, yearMonth });
  }

  function openBudgetEdit() {
    stackFlowActions.push('BudgetEditActivity', { householdId, yearMonth });
  }

  function openDiningExpenseAdd() {
    stackFlowActions.push('DiningExpenseAddActivity', { householdId });
  }

  function openExpenseEdit(expense: FoodExpense) {
    const ingredient = toIngredient(expense);
    if (ingredient) {
      stackFlowActions.push('IngredientEditActivity', {
        householdId,
        ingredient,
        suggestions: grocerySuggestions,
      });
      return;
    }

    const diningExpense = toDiningExpense(expense);
    if (diningExpense) {
      stackFlowActions.push('DiningExpenseEditActivity', { householdId, expense: diningExpense });
    }
  }

  function openAddMethodSheet() {
    overlay.open(({ isOpen, close, unmount }) => {
      function closeSheet() {
        close();
        window.setTimeout(unmount, 300);
      }

      return (
        <StoreAddMethodSheet
          open={isOpen}
          onClose={closeSheet}
          onGroceryAdd={() => {
            closeSheet();
            openGroceryAdd();
          }}
          onDiningAdd={() => {
            closeSheet();
            openDiningExpenseAdd();
          }}
        />
      );
    });
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-5">
      <section className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={handlePrevMonth}>
            <ChevronLeft className="size-4" />
          </Button>
          <h2 className="text-base font-bold">
            {format(currentDate, 'yyyy년 M월', { locale: ko })}
          </h2>
          <Button variant="ghost" size="icon-sm" onClick={handleNextMonth}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <span className="text-sm font-semibold text-emerald-600">
          {totalSpending.toLocaleString()}원
        </span>
      </section>

      {/* 예산 요약 — 탭하면 현황, 미설정이면 편집으로 직행한다 */}
      <BudgetSummaryStrip
        householdId={householdId}
        yearMonth={yearMonth}
        onOpenBudget={openBudget}
        onOpenBudgetEdit={openBudgetEdit}
      />

      {/* 종류 필터 — 스크롤 중에도 종류를 바꿀 수 있도록 상단에 붙인다 */}
      <div className="sticky top-0 z-20 -mx-4 -mt-4 bg-white px-4 py-2">
        <FoodExpenseKindFilter value={kind} onValueChange={setKind} />
      </div>

      {/* 식비 리스트 */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <span className="text-sm text-gray-400">불러오는 중...</span>
        </div>
      ) : (
        <FoodExpenseList householdId={householdId} expenses={expenses} onSelect={openExpenseEdit} />
      )}

      {/* FAB 추가 버튼 */}
      <Button
        onClick={openAddMethodSheet}
        color="primary"
        className="fixed right-4 [bottom:calc(constant(safe-area-inset-bottom)+84px)] [bottom:calc(env(safe-area-inset-bottom)+84px)] z-40 size-12 rounded-full shadow-lg sm:right-[calc(50%-215px+16px)]"
        size="icon-lg"
      >
        <Plus className="size-5" />
      </Button>
    </div>
  );
}
