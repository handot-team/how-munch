'use client';

import { basicUIPlugin } from '@stackflow/plugin-basic-ui';
import { historySyncPlugin } from '@stackflow/plugin-history-sync';
import { basicRendererPlugin } from '@stackflow/plugin-renderer-basic';
import { useActions, useActivity, stackflow } from '@stackflow/react';

import { type DiningExpense } from '@/entities/dining-expense';
import { type FoodExpense } from '@/entities/food-expense';
import { type Ingredient, type IngredientUnit } from '@/entities/ingredient';
import { type FridgeItemBatch, type FridgeItemWithBatches } from '@/entities/fridge-item';
import { type Meal, type MealType } from '@/entities/meal';

import { BudgetEditScreen, BudgetScreen } from '@/features/budget';
import { DiningExpenseAddScreen, DiningExpenseEditScreen } from '@/features/dining-expense';
import { FoodExpenseSearchScreen, toDiningExpense, toIngredient } from '@/features/food-expense';
import {
  FridgeBatchEditScreen,
  FridgeExpiryListScreen,
  FridgeFilterSettingsScreen,
  FridgeItemAddScreen,
  FridgeItemEditScreen,
  FridgeItemSubdivideScreen,
  useFridgeBrandNamesQuery,
} from '@/features/fridge';
import {
  PromptIngredientAddScreen,
  PromptIngredientStagingEditScreen,
  PromptIngredientStagingScreen,
  clearPendingProductNameCallback,
  IngredientAddScreen,
  IngredientEditScreen,
  ProductNameSearchScreen,
  resolvePendingProductNameCallback,
  setPendingProductNameCallback,
  type StagedItem,
  useIngredientBrandNamesQuery,
} from '@/features/ingredient';
import {
  MealEditorScreen,
  FridgeItemSearchScreen,
  FridgeBatchSelectScreen,
  setPendingFridgeItemCallback,
  resolvePendingFridgeItemCallback,
  clearPendingFridgeItemCallback,
  setPendingFridgeBatchCallback,
  resolvePendingFridgeBatchCallback,
  clearPendingFridgeBatchCallback,
  type FridgeItemSearchOption,
  type FridgeBatchSelectOption,
} from '@/features/meal';
import { NotificationScreen, NotificationSettingsScreen } from '@/features/notification';
import { ProfileEditScreen, ProfileSettingsScreen } from '@/features/profile';
import { SearchSynonymSettingsScreen } from '@/features/search-synonym';

function IdleActivity() {
  const activity = useActivity();

  return <div data-stackflow-idle-active={activity.isActive ? 'true' : 'false'} />;
}

function PlaceholderActivity() {
  return null;
}

function IngredientAddActivity({
  params,
}: {
  params: {
    householdId: string;
    userId: string;
    defaultName?: string;
    suggestions?: string[];
  };
}) {
  const { pop, push } = useActions();
  const { data: brandNames } = useIngredientBrandNamesQuery(params.householdId);

  function openProductNameSearch(currentName: string, onSelect: (name: string) => void) {
    setPendingProductNameCallback(onSelect);
    push('ProductNameSearchActivity', {
      fieldLabel: '품목명',
      suggestions: params.suggestions ?? [],
      currentName,
    });
  }

  function openBrandSearch(currentBrand: string, onSelect: (brand: string) => void) {
    setPendingProductNameCallback(onSelect);
    push('ProductNameSearchActivity', {
      fieldLabel: '브랜드',
      suggestions: brandNames ?? [],
      currentName: currentBrand,
    });
  }

  return (
    <IngredientAddScreen
      onClose={pop}
      householdId={params.householdId}
      userId={params.userId}
      defaultName={params.defaultName}
      onOpenProductNameSearch={openProductNameSearch}
      onOpenBrandSearch={openBrandSearch}
    />
  );
}

function FridgeItemAddActivity({
  params,
}: {
  params: {
    householdId: string;
    suggestions?: string[];
  };
}) {
  const { pop, push } = useActions();
  const { data: brandNames } = useFridgeBrandNamesQuery(params.householdId);

  function openProductNameSearch(currentName: string, onSelect: (name: string) => void) {
    setPendingProductNameCallback(onSelect);
    push('ProductNameSearchActivity', {
      fieldLabel: '재료명',
      suggestions: params.suggestions ?? [],
      currentName,
    });
  }

  function openBrandSearch(currentBrand: string, onSelect: (brand: string) => void) {
    setPendingProductNameCallback(onSelect);
    push('ProductNameSearchActivity', {
      fieldLabel: '브랜드',
      suggestions: brandNames ?? [],
      currentName: currentBrand,
    });
  }

  return (
    <FridgeItemAddScreen
      onClose={pop}
      householdId={params.householdId}
      onOpenProductNameSearch={openProductNameSearch}
      onOpenBrandSearch={openBrandSearch}
    />
  );
}

function FridgeItemEditActivity({
  params,
}: {
  params: {
    item: FridgeItemWithBatches;
    suggestions?: string[];
  };
}) {
  const { pop, push } = useActions();
  const { data: brandNames } = useFridgeBrandNamesQuery(params.item.household_id);

  function openProductNameSearch(currentName: string, onSelect: (name: string) => void) {
    setPendingProductNameCallback(onSelect);
    push('ProductNameSearchActivity', {
      fieldLabel: '재료명',
      suggestions: params.suggestions ?? [],
      currentName,
    });
  }

  function openBrandSearch(currentBrand: string, onSelect: (brand: string) => void) {
    setPendingProductNameCallback(onSelect);
    push('ProductNameSearchActivity', {
      fieldLabel: '브랜드',
      suggestions: brandNames ?? [],
      currentName: currentBrand,
    });
  }

  function openSubdivide() {
    push('FridgeItemSubdivideActivity', {
      fridgeItemId: params.item.id,
      itemName: params.item.name,
      totalCount: params.item.total_count,
      unit: params.item.unit,
      batches: params.item.fridge_item_batches.filter((b) => !b.deleted_at),
    });
  }

  return (
    <FridgeItemEditScreen
      onClose={pop}
      item={params.item}
      onOpenSubdivide={openSubdivide}
      onOpenProductNameSearch={openProductNameSearch}
      onOpenBrandSearch={openBrandSearch}
    />
  );
}

function FridgeItemSubdivideActivity({
  params,
}: {
  params: {
    fridgeItemId: string;
    itemName: string;
    totalCount: number;
    unit: IngredientUnit;
    batches: FridgeItemBatch[];
  };
}) {
  const { pop } = useActions();

  return (
    <FridgeItemSubdivideScreen
      onSuccess={() => pop(2)}
      fridgeItemId={params.fridgeItemId}
      itemName={params.itemName}
      totalCount={params.totalCount}
      unit={params.unit}
      batches={params.batches}
    />
  );
}

function FridgeBatchEditActivity({
  params,
}: {
  params: {
    batch: FridgeItemBatch;
    unit: IngredientUnit;
    fromStore: boolean;
  };
}) {
  const { pop } = useActions();

  return (
    <FridgeBatchEditScreen
      onClose={pop}
      batch={params.batch}
      unit={params.unit}
      fromStore={params.fromStore}
    />
  );
}

function FridgeFilterSettingsActivity() {
  const { pop } = useActions();

  return <FridgeFilterSettingsScreen onClose={pop} />;
}

function FridgeExpiryListActivity({
  params,
}: {
  params: {
    items: FridgeItemWithBatches[];
  };
}) {
  const { pop } = useActions();

  return <FridgeExpiryListScreen onClose={pop} items={params.items} />;
}

function IngredientEditActivity({
  params,
}: {
  params: {
    householdId: string;
    ingredient: Ingredient;
    suggestions?: string[];
  };
}) {
  const { pop, push } = useActions();
  const { data: brandNames } = useIngredientBrandNamesQuery(params.householdId);

  function openProductNameSearch(currentName: string, onSelect: (name: string) => void) {
    setPendingProductNameCallback(onSelect);
    push('ProductNameSearchActivity', {
      fieldLabel: '품목명',
      suggestions: params.suggestions ?? [],
      currentName,
    });
  }

  function openBrandSearch(currentBrand: string, onSelect: (brand: string) => void) {
    setPendingProductNameCallback(onSelect);
    push('ProductNameSearchActivity', {
      fieldLabel: '브랜드',
      suggestions: brandNames ?? [],
      currentName: currentBrand,
    });
  }

  return (
    <IngredientEditScreen
      onClose={pop}
      householdId={params.householdId}
      ingredient={params.ingredient}
      onOpenProductNameSearch={openProductNameSearch}
      onOpenBrandSearch={openBrandSearch}
    />
  );
}

function MealEditorActivity({
  params,
}: {
  params: {
    householdId: string;
    date: string;
    type: MealType;
    meal: Meal | null;
  };
}) {
  const { pop, push } = useActions();

  function openFridgeItemSearch(
    items: FridgeItemSearchOption[],
    onSelectId: (fridgeItemId: string) => void,
  ) {
    setPendingFridgeItemCallback(onSelectId);
    push('FridgeItemSearchActivity', {
      fieldLabel: '재료',
      items,
    });
  }

  function openFridgeBatchSelect(
    batches: FridgeBatchSelectOption[],
    unit: IngredientUnit,
    onSelectBatchId: (batchId: string) => void,
  ) {
    setPendingFridgeBatchCallback(onSelectBatchId);
    push('FridgeBatchSelectActivity', {
      batches,
      unit,
    });
  }

  return (
    <MealEditorScreen
      onClose={pop}
      householdId={params.householdId}
      date={params.date}
      type={params.type}
      meal={params.meal}
      onOpenFridgeItemSearch={openFridgeItemSearch}
      onOpenFridgeBatchSelect={openFridgeBatchSelect}
    />
  );
}

function ProfileSettingsActivity() {
  const { pop } = useActions();

  return <ProfileSettingsScreen onClose={pop} />;
}

function SearchSynonymSettingsActivity() {
  const { pop } = useActions();

  return <SearchSynonymSettingsScreen onClose={pop} />;
}

function ProfileEditActivity() {
  const { pop } = useActions();

  return <ProfileEditScreen onClose={pop} />;
}

function NotificationActivity() {
  const { push } = useActions();

  function openBudget(householdId: string, yearMonth: string) {
    push('BudgetActivity', { householdId, yearMonth });
  }

  return <NotificationScreen onOpenBudget={openBudget} />;
}

function NotificationSettingsActivity() {
  const { pop } = useActions();

  return <NotificationSettingsScreen onClose={pop} />;
}

function PromptIngredientAddActivity({
  params,
}: {
  params: {
    householdId: string;
    userId: string;
    suggestions?: string[];
  };
}) {
  const { pop, push } = useActions();

  function handleParsed() {
    push('PromptIngredientStagingActivity', {
      householdId: params.householdId,
      userId: params.userId,
      suggestions: params.suggestions ?? [],
    });
  }

  return (
    <PromptIngredientAddScreen
      onClose={pop}
      onParsed={handleParsed}
      householdId={params.householdId}
    />
  );
}

function PromptIngredientStagingActivity({
  params,
}: {
  params: {
    householdId: string;
    userId: string;
    suggestions?: string[];
  };
}) {
  const { pop, push } = useActions();

  function openEdit(item: StagedItem) {
    push('PromptIngredientStagingEditActivity', {
      householdId: params.householdId,
      userId: params.userId,
      item,
      suggestions: params.suggestions ?? [],
    });
  }

  return (
    <PromptIngredientStagingScreen
      onClose={pop}
      onComplete={() => pop(2)}
      householdId={params.householdId}
      userId={params.userId}
      onEditItem={openEdit}
    />
  );
}

function PromptIngredientStagingEditActivity({
  params,
}: {
  params: {
    householdId: string;
    userId: string;
    item: StagedItem;
    suggestions?: string[];
  };
}) {
  const { pop, push } = useActions();
  const { data: brandNames } = useIngredientBrandNamesQuery(params.householdId);

  function openProductNameSearch(currentName: string, onSelect: (name: string) => void) {
    setPendingProductNameCallback(onSelect);
    push('ProductNameSearchActivity', {
      fieldLabel: '품목명',
      suggestions: params.suggestions ?? [],
      currentName,
    });
  }

  function openBrandSearch(currentBrand: string, onSelect: (brand: string) => void) {
    setPendingProductNameCallback(onSelect);
    push('ProductNameSearchActivity', {
      fieldLabel: '브랜드',
      suggestions: brandNames ?? [],
      currentName: currentBrand,
    });
  }

  return (
    <PromptIngredientStagingEditScreen
      onClose={pop}
      item={params.item}
      householdId={params.householdId}
      onOpenProductNameSearch={openProductNameSearch}
      onOpenBrandSearch={openBrandSearch}
    />
  );
}

function FoodExpenseSearchActivity({
  params,
}: {
  params: {
    householdId: string;
  };
}) {
  const { pop, push } = useActions();

  // 통합 검색 결과는 장보기와 외식비가 섞여 있어, 종류에 맞는 편집 화면으로 갈라 보낸다.
  function selectExpense(expense: FoodExpense) {
    const ingredient = toIngredient(expense);
    if (ingredient) {
      push('IngredientEditActivity', {
        householdId: params.householdId,
        ingredient,
        suggestions: [],
      });
      return;
    }

    const diningExpense = toDiningExpense(expense);
    if (diningExpense) {
      push('DiningExpenseEditActivity', {
        householdId: params.householdId,
        expense: diningExpense,
      });
    }
  }

  return (
    <FoodExpenseSearchScreen
      onClose={pop}
      householdId={params.householdId}
      onExpenseSelect={selectExpense}
    />
  );
}

function BudgetActivity({
  params,
}: {
  params: {
    householdId: string;
    yearMonth: string;
  };
}) {
  const { pop, push } = useActions();

  function openEdit(yearMonth: string) {
    push('BudgetEditActivity', {
      householdId: params.householdId,
      yearMonth,
    });
  }

  return (
    <BudgetScreen
      onClose={pop}
      onOpenEdit={openEdit}
      householdId={params.householdId}
      yearMonth={params.yearMonth}
    />
  );
}

function BudgetEditActivity({
  params,
}: {
  params: {
    householdId: string;
    yearMonth: string;
  };
}) {
  const { pop } = useActions();

  return (
    <BudgetEditScreen onClose={pop} householdId={params.householdId} yearMonth={params.yearMonth} />
  );
}

function DiningExpenseAddActivity({
  params,
}: {
  params: {
    householdId: string;
  };
}) {
  const { pop } = useActions();

  return <DiningExpenseAddScreen onClose={pop} householdId={params.householdId} />;
}

function DiningExpenseEditActivity({
  params,
}: {
  params: {
    householdId: string;
    expense: DiningExpense;
  };
}) {
  const { pop } = useActions();

  return (
    <DiningExpenseEditScreen
      onClose={pop}
      householdId={params.householdId}
      expense={params.expense}
    />
  );
}

function ProductNameSearchActivity({
  params,
}: {
  params: {
    fieldLabel?: string;
    suggestions?: string[];
    depletedNames?: string[];
    currentName?: string;
  };
}) {
  const { pop } = useActions();

  function handleSelectName(name: string) {
    resolvePendingProductNameCallback(name);
    pop();
  }

  function handleClose() {
    clearPendingProductNameCallback();
    pop();
  }

  return (
    <ProductNameSearchScreen
      onClose={handleClose}
      onSelectName={handleSelectName}
      fieldLabel={params.fieldLabel}
      suggestions={params.suggestions}
      depletedNames={params.depletedNames}
      defaultQuery={params.currentName}
    />
  );
}

function FridgeItemSearchActivity({
  params,
}: {
  params: {
    fieldLabel?: string;
    items?: FridgeItemSearchOption[];
  };
}) {
  const { pop } = useActions();

  function handleSelectItem(fridgeItemId: string) {
    resolvePendingFridgeItemCallback(fridgeItemId);
    pop();
  }

  function handleClose() {
    clearPendingFridgeItemCallback();
    pop();
  }

  return (
    <FridgeItemSearchScreen
      onClose={handleClose}
      onSelectItem={handleSelectItem}
      fieldLabel={params.fieldLabel}
      items={params.items}
    />
  );
}

function FridgeBatchSelectActivity({
  params,
}: {
  params: {
    batches?: FridgeBatchSelectOption[];
    unit?: IngredientUnit;
  };
}) {
  const { pop } = useActions();

  function handleSelectBatch(batchId: string) {
    resolvePendingFridgeBatchCallback(batchId);
    pop();
  }

  function handleClose() {
    clearPendingFridgeBatchCallback();
    pop();
  }

  return (
    <FridgeBatchSelectScreen
      onClose={handleClose}
      onSelectBatch={handleSelectBatch}
      batches={params.batches}
      unit={params.unit}
    />
  );
}

const appStackFlow = stackflow({
  transitionDuration: 360,
  initialActivity: () => 'IdleActivity',
  activities: {
    IdleActivity,
    PlaceholderActivity,
    IngredientAddActivity,
    IngredientEditActivity,
    FoodExpenseSearchActivity,
    DiningExpenseAddActivity,
    DiningExpenseEditActivity,
    BudgetActivity,
    BudgetEditActivity,
    FridgeItemAddActivity,
    FridgeItemEditActivity,
    FridgeItemSubdivideActivity,
    FridgeBatchEditActivity,
    FridgeFilterSettingsActivity,
    FridgeExpiryListActivity,
    MealEditorActivity,
    NotificationActivity,
    NotificationSettingsActivity,
    ProfileSettingsActivity,
    SearchSynonymSettingsActivity,
    ProfileEditActivity,
    ProductNameSearchActivity,
    FridgeItemSearchActivity,
    FridgeBatchSelectActivity,
    PromptIngredientAddActivity,
    PromptIngredientStagingActivity,
    PromptIngredientStagingEditActivity,
  },
  plugins: [
    basicRendererPlugin(),
    historySyncPlugin({
      routes: {
        IdleActivity: '/idle',
        PlaceholderActivity: '/placeholder',
        IngredientAddActivity: '/ingredient/add',
        IngredientEditActivity: '/ingredient/edit',
        FoodExpenseSearchActivity: '/food-expense/search',
        DiningExpenseAddActivity: '/dining/add',
        DiningExpenseEditActivity: '/dining/edit',
        BudgetActivity: '/budget',
        BudgetEditActivity: '/budget/edit',
        FridgeItemAddActivity: '/fridge/item/add',
        FridgeItemEditActivity: '/fridge/item/edit',
        FridgeItemSubdivideActivity: '/fridge/item/subdivide',
        FridgeBatchEditActivity: '/fridge/batch/edit',
        FridgeFilterSettingsActivity: '/fridge/filter/settings',
        FridgeExpiryListActivity: '/fridge/expiry',
        MealEditorActivity: '/meal/editor',
        NotificationActivity: '/notifications',
        NotificationSettingsActivity: '/notifications/settings',
        ProfileSettingsActivity: '/profile/settings',
        SearchSynonymSettingsActivity: '/search/synonym/settings',
        ProfileEditActivity: '/profile/edit',
        ProductNameSearchActivity: '/search/product-name',
        FridgeItemSearchActivity: '/search/fridge-item',
        FridgeBatchSelectActivity: '/search/fridge-batch',
        PromptIngredientAddActivity: '/ingredient/ai/add',
        PromptIngredientStagingActivity: '/ingredient/ai/staging',
        PromptIngredientStagingEditActivity: '/ingredient/ai/staging/edit',
      },
      fallbackActivity: () => 'IdleActivity',
      useHash: true,
    }),
    basicUIPlugin({
      theme: 'cupertino',
      rootClassName: 'stackflow-root absolute inset-0 z-[var(--z-stackflow)]',
    }),
  ],
});

export const {
  Stack: StackFlowStack,
  useFlow: useStackFlow,
  actions: stackFlowActions,
} = appStackFlow;
