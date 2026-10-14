import { type NextRequest } from 'next/server';

import { josa } from 'es-hangul';

import { notifyBudgetExceeded, respondWithDbError, withAuth } from '@/apps/route';

import { apiResponse } from '@/commons/lib/http/apiResponse';
import { dispatchHouseholdNotification } from '@/commons/lib/http/dispatchHouseholdNotification';
import { type Database, type Page, type PageInfo } from '@/commons/model/types';

import { type FoodExpense, type FoodExpenseStock } from '@/entities/food-expense';

type DiningExpenseRow = Database['public']['Tables']['dining_expenses']['Row'];

const DINING_KINDS = ['restaurant', 'delivery'] as const;
const FILTER_KINDS = ['all', 'grocery', ...DINING_KINDS] as const;

type FilterKind = (typeof FILTER_KINDS)[number];

/** 검색이 훑는 컬럼. 외식비는 메뉴(name)가 선택 입력이라 가게명(brand)까지 봐야 찾을 수 있다. */
const SEARCH_COLUMNS = ['name', 'brand'] as const;

/**
 * PostgREST or 필터에 값을 안전하게 넣기 위해 큰따옴표 안에서 이스케이프한다.
 * 검색어에 쉼표가 들어가면 필터 구문 자체가 깨지기 때문이다.
 */
function toQuotedIlikeFilters(keyword: string): string[] {
  const escaped = keyword.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return SEARCH_COLUMNS.map((column) => `${column}.ilike."%${escaped}%"`);
}

function resolveFilterKind(value: string | null): FilterKind {
  return (FILTER_KINDS as readonly string[]).includes(value ?? '') ? (value as FilterKind) : 'all';
}

/**
 * GET /api/food-expenses?householdId=&startDate=&endDate=&kind=&q=&q=&page=&pageSize=
 * 장보기 + 외식비 통합 내역 조회. v_food_expenses 뷰를 읽으므로 필터·정렬·페이징이 전부 서버에 있다.
 * q는 반복 파라미터다. 클라이언트가 검색어를 유사어 그룹으로 확장해 여러 개를 보내면 OR로 묶는다.
 */
export const GET = withAuth(async (req: NextRequest, { supabase }) => {
  const { searchParams } = req.nextUrl;
  const householdId = searchParams.get('householdId');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const kind = resolveFilterKind(searchParams.get('kind'));
  const searchKeywords = searchParams
    .getAll('q')
    .map((keyword) => keyword.trim())
    .filter(Boolean);
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
  const pageSize = Math.max(1, Number(searchParams.get('pageSize') ?? '200'));

  if (!householdId || !startDate || !endDate) {
    return apiResponse.BAD_REQUEST('CMN_002', 'householdId, startDate, endDate가 필요합니다.');
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('v_food_expenses')
    .select('*', { count: 'exact' })
    .eq('household_id', householdId)
    .gte('date', startDate)
    .lte('date', endDate)
    // 두 테이블을 UNION한 뷰라 date만으로는 순서가 확정되지 않는다.
    // 페이지 경계가 흔들리면 무한 스크롤에서 항목이 빠지거나 중복되므로 동점 기준을 끝까지 건다.
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to);

  if (kind !== 'all') {
    query = query.eq('kind', kind);
  }

  if (searchKeywords.length > 0) {
    query = query.or(searchKeywords.flatMap(toQuotedIlikeFilters).join(','));
  }

  const { data, count, error } = await query;

  if (error) return respondWithDbError(error, 'GET /api/food-expenses');

  const expenses = (data ?? []) as FoodExpense[];

  const fridgeItemIds = [
    ...new Set(expenses.map((e) => e.linked_fridge_item_id).filter((id): id is string => !!id)),
  ];
  const fridgeBatchIds = [
    ...new Set(expenses.map((e) => e.linked_fridge_batch_id).filter((id): id is string => !!id)),
  ];

  // 식단 사용 여부의 완전한 출처는 dish_ingredients다.
  // meal_batch_usages는 차감 수량 원장이라 g/kg 'used'처럼 차감이 없는 사용은 행이 남지 않는다.
  const [usedByItemResult, usedByBatchResult] = await Promise.all([
    fridgeItemIds.length
      ? supabase
          .from('dish_ingredients')
          .select('fridge_item_id')
          .in('fridge_item_id', fridgeItemIds)
      : Promise.resolve({ data: [] as { fridge_item_id: string }[], error: null }),
    fridgeBatchIds.length
      ? supabase.from('dish_ingredients').select('batch_id').in('batch_id', fridgeBatchIds)
      : Promise.resolve({ data: [] as { batch_id: string | null }[], error: null }),
  ]);

  // 조회에 실패하면 사용 중인 재료가 미사용으로 보여 삭제가 열리므로 에러를 삼키지 않는다
  if (usedByItemResult.error || usedByBatchResult.error) return apiResponse.INTERNAL_ERROR();

  const usedFridgeItemIds = new Set((usedByItemResult.data ?? []).map((row) => row.fridge_item_id));
  const usedFridgeBatchIds = new Set(
    (usedByBatchResult.data ?? [])
      .map((row) => row.batch_id)
      .filter((id): id is string => id !== null),
  );

  // 꼬리표형: 장보기 행이 만든 구매분의 남은 양과 끝 기록(먹음/버림)을 함께 싣는다.
  // 냉장고에서 재료를 지워 구매분이 사라졌으면 꼬리표를 붙이지 않는다.
  const [batchResult, endRecordResult] = await Promise.all([
    fridgeBatchIds.length
      ? supabase
          .from('fridge_item_batches')
          .select('id, quantity')
          .in('id', fridgeBatchIds)
          .is('deleted_at', null)
      : Promise.resolve({ data: [] as { id: string; quantity: number }[], error: null }),
    fridgeBatchIds.length
      ? supabase
          .from('fridge_batch_end_records')
          .select('batch_id, kind, amount')
          .in('batch_id', fridgeBatchIds)
          .is('undone_at', null)
      : Promise.resolve({
          data: [] as { batch_id: string; kind: string; amount: number }[],
          error: null,
        }),
  ]);

  if (batchResult.error || endRecordResult.error) return apiResponse.INTERNAL_ERROR();

  const stockByBatchId = new Map<string, FoodExpenseStock>(
    (batchResult.data ?? []).map((batch) => [
      batch.id,
      { remaining: Number(batch.quantity), eaten: 0, discarded: 0 },
    ]),
  );
  for (const record of endRecordResult.data ?? []) {
    const stock = stockByBatchId.get(record.batch_id);
    if (!stock) continue;
    if (record.kind === 'discarded') stock.discarded += Number(record.amount);
    else stock.eaten += Number(record.amount);
  }

  const contents: FoodExpense[] = expenses.map((expense) => ({
    ...expense,
    stock: expense.linked_fridge_batch_id
      ? (stockByBatchId.get(expense.linked_fridge_batch_id) ?? null)
      : null,
    has_meal_usage:
      (!!expense.linked_fridge_item_id && usedFridgeItemIds.has(expense.linked_fridge_item_id)) ||
      (!!expense.linked_fridge_batch_id && usedFridgeBatchIds.has(expense.linked_fridge_batch_id)),
  }));

  const totalElements = count ?? 0;
  const totalPages = Math.ceil(totalElements / pageSize);

  const pageInfo: PageInfo = {
    page,
    pageSize,
    totalElements,
    totalPages,
    numberOfElements: contents.length,
    empty: contents.length === 0,
    first: page === 1,
    last: page >= totalPages,
  };

  const result: Page<FoodExpense[]> = { contents, pageInfo };

  return apiResponse.OK(result);
});

/**
 * 외식비 등록 알림 본문 — 포장/배달은 주문 문구로, 식당/카페는 외식비 등록 문구로 보낸다.
 * 플랫폼(store)은 선택 입력이라 없으면 플랫폼 구절을 뺀다.
 */
function buildDiningExpenseNotificationBody(
  nickname: string,
  expense: Pick<DiningExpenseRow, 'kind' | 'brand' | 'store'>,
): string {
  if (expense.kind !== 'delivery') {
    return `${nickname}님이 ${expense.brand} 외식비를 등록했어요`;
  }

  const platform = expense.store ? ` ${josa(expense.store, '으로/로')}` : '';
  return `${nickname}님이 ${josa(expense.brand, '을/를')}${platform} 주문했어요`;
}

/**
 * POST /api/food-expenses — 외식비 추가.
 * 장보기는 냉장고 입고까지 묶여 /api/ingredients(RPC)를 그대로 쓴다.
 * 외식비는 냉장고·식단 연동이 없는 단일 테이블 CRUD라 여기서 직접 insert한다.
 */
export const POST = withAuth(async (req: NextRequest, { userId, supabase }) => {
  const body = await req.json();

  if (!body.household_id || !body.brand || !DINING_KINDS.includes(body.kind)) {
    return apiResponse.BAD_REQUEST('CMN_002', 'household_id, kind, brand가 필요합니다.');
  }

  const expenseDate = body.date ?? new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('dining_expenses')
    .insert({
      household_id: body.household_id,
      user_id: userId,
      date: expenseDate,
      kind: body.kind,
      name: body.name || null,
      brand: body.brand,
      // 식당은 결제 채널을 따로 두지 않는다. 폼에서 숨기므로 서버에서도 비워 정합성을 맞춘다.
      store: body.kind === 'delivery' ? body.store || null : null,
      price: body.price ?? 0,
      memo: body.memo || null,
    })
    .select()
    .single<DiningExpenseRow>();

  if (error) return respondWithDbError(error, 'POST /api/food-expenses');

  // 예산 초과 알림 — 실패해도 외식비 저장 흐름을 막지 않는다
  void notifyBudgetExceeded({
    supabase,
    userId,
    householdId: body.household_id,
    date: expenseDate,
  });

  // 가구원 활동 알림 — 등록한 본인을 제외한 가구원에게 push를 보낸다
  void (async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('nickname')
      .eq('user_id', userId)
      .single();
    const nickname = profile?.nickname ?? '가구원';

    dispatchHouseholdNotification({
      accessToken: session.access_token,
      householdId: body.household_id,
      triggeredBy: userId,
      type: 'dining_expense_added',
      title: '외식비 등록',
      body: buildDiningExpenseNotificationBody(nickname, data),
    });
  })();

  return apiResponse.CREATED(data);
});

/** 클라이언트가 바꿀 수 있는 컬럼. 나머지는 요청에 실려와도 무시한다. */
const EDITABLE_COLUMNS = ['date', 'name', 'brand', 'store', 'price', 'memo'] as const;

/** PUT /api/food-expenses — 외식비 수정 */
export const PUT = withAuth(async (req: NextRequest, { supabase }) => {
  const body = await req.json();
  const { id, kind } = body;

  if (!id) {
    return apiResponse.BAD_REQUEST('CMN_002', 'id가 필요합니다.');
  }
  if (kind !== undefined && !DINING_KINDS.includes(kind)) {
    return apiResponse.BAD_REQUEST('CMN_002', 'kind가 올바르지 않습니다.');
  }

  // 요청 바디를 그대로 펼치면 deleted_at, user_id, created_at까지 덮어쓸 수 있다.
  // 바꿔도 되는 컬럼만 추려서 넘긴다.
  const patch: Record<string, unknown> = {};
  for (const column of EDITABLE_COLUMNS) {
    if (body[column] !== undefined) patch[column] = body[column];
  }

  const { data, error } = await supabase
    .from('dining_expenses')
    .update({
      ...patch,
      ...(kind === undefined ? {} : { kind }),
      // 포장·배달 → 식당으로 바꾸면 남아 있던 플랫폼 값이 유령으로 따라다니므로 여기서 지운다.
      ...(kind === 'restaurant' ? { store: null } : {}),
    })
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .maybeSingle<DiningExpenseRow>();

  if (error) return respondWithDbError(error, 'PUT /api/food-expenses');
  // maybeSingle은 0행일 때 에러 대신 null을 준다. single()은 PGRST116을 던져 500으로 떨어졌다.
  if (!data) return apiResponse.NOT_FOUND('CMN_005', '외식비 내역을 찾을 수 없습니다.');

  return apiResponse.OK(data);
});

/** DELETE /api/food-expenses?id= — 외식비 소프트 삭제 */
export const DELETE = withAuth(async (req: NextRequest, { supabase }) => {
  const id = req.nextUrl.searchParams.get('id');

  if (!id) {
    return apiResponse.BAD_REQUEST('CMN_002', 'id가 필요합니다.');
  }

  const { data, error } = await supabase
    .from('dining_expenses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle<{ id: string }>();

  if (error) return respondWithDbError(error, 'DELETE /api/food-expenses');
  // 없는 id에 조용히 204를 주면 다른 기기에서 이미 지운 항목을 지운 척하게 된다.
  if (!data) return apiResponse.NOT_FOUND('CMN_005', '외식비 내역을 찾을 수 없습니다.');

  return apiResponse.NO_CONTENT();
});
