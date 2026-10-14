import { type NextRequest } from 'next/server';

import { josa } from 'es-hangul';

import { withAuth } from '@/apps/route';

import { resolveDomainError } from '@/commons/lib';
import { apiResponse } from '@/commons/lib/http/apiResponse';
import { dispatchHouseholdNotification } from '@/commons/lib/http/dispatchHouseholdNotification';
import { type Json } from '@/commons/model/types';

/** 냉장고 품목 메타 수정에서 클라이언트가 보낼 수 있는 필드 */
const FRIDGE_ITEM_EDITABLE_FIELDS = ['name', 'brand', 'category_id', 'unit', 'is_subdivided'];

/**
 * GET /api/fridge?householdId=&search=&search= — 냉장고 재고 전체 조회 (배치 포함)
 * search는 반복 파라미터다. 클라이언트가 검색어를 유사어 그룹으로 확장해 여러 개를 보내면
 * RPC가 OR 조건으로 묶어 조회한다.
 */
export const GET = withAuth(async (req: NextRequest, { supabase }) => {
  const { searchParams } = req.nextUrl;
  const householdId = searchParams.get('householdId');
  const searchKeywords = searchParams.getAll('search').filter((keyword) => keyword.trim());

  if (!householdId) {
    return apiResponse.BAD_REQUEST('CMN_002', 'householdId가 필요합니다.');
  }

  const { data, error } = await supabase.rpc('get_fridge_items_with_active_batches', {
    p_household_id: householdId,
    p_search_keywords: searchKeywords.length > 0 ? searchKeywords : null,
  });

  if (error) {
    const domainError = resolveDomainError(error);
    if (domainError) return apiResponse.CONFLICT(domainError.code, domainError.message);
    return apiResponse.INTERNAL_ERROR();
  }

  const items = (data ?? []) as { created_by?: string | null }[];

  // 꼬리표형: 카드에 입력자 칩을 붙이려고 입력한 가구원의 닉네임을 함께 싣는다.
  const creatorIds = [
    ...new Set(items.map((item) => item.created_by).filter((id): id is string => !!id)),
  ];
  const { data: creators, error: creatorsError } = creatorIds.length
    ? await supabase.from('profiles').select('user_id, nickname').in('user_id', creatorIds)
    : { data: [] as { user_id: string; nickname: string }[], error: null };

  if (creatorsError) return apiResponse.INTERNAL_ERROR();

  const nicknameByUserId = new Map((creators ?? []).map((row) => [row.user_id, row.nickname]));

  return apiResponse.OK(
    items.map((item) => ({
      ...item,
      created_by_nickname: item.created_by ? (nicknameByUserId.get(item.created_by) ?? null) : null,
    })),
  );
});

/** POST /api/fridge — 냉장고 아이템 + 첫 배치 동시 추가 */
export const POST = withAuth(async (req: NextRequest, { userId, supabase }) => {
  const body = await req.json();
  const { item, batch } = body;

  if (!item || !batch) {
    return apiResponse.BAD_REQUEST('CMN_002', '필수 항목이 누락되었습니다.');
  }

  const { data, error } = await supabase.rpc('create_fridge_item_with_batch', {
    p_household_id: item.household_id,
    p_name: item.name,
    p_brand: item.brand ?? null,
    p_category_id: item.category_id,
    p_unit: item.unit ?? 'count',
    p_is_subdivided: item.is_subdivided ?? false,
    p_from_grocery: item.from_grocery ?? false,
    p_quantity: batch.quantity,
    p_purchased_date: batch.purchased_date,
    p_expiry_date: batch.expiry_date ?? null,
    p_memo: batch.memo ?? null,
  });

  if (error) {
    const domainError = resolveDomainError(error);
    if (domainError) return apiResponse.CONFLICT(domainError.code, domainError.message);
    return apiResponse.INTERNAL_ERROR();
  }

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
      householdId: item.household_id,
      triggeredBy: userId,
      type: 'fridge_item_added',
      title: '냉장고 재료 추가',
      body: `${nickname}님이 ${josa(item.name, '을/를')} 추가했어요`,
    });
  })();

  return apiResponse.CREATED(data);
});

/** PUT /api/fridge — 냉장고 아이템 메타 수정 */
export const PUT = withAuth(async (req: NextRequest, { supabase }) => {
  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) {
    return apiResponse.BAD_REQUEST('CMN_002', 'id가 필요합니다.');
  }

  // 허용 필드만 통과시킨다.
  // 실제 차단은 update_fridge_item_guarded RPC와 fridge_items의 UPDATE 권한 회수가 담당하며,
  // 이 필터는 잘못된 필드를 빠르게 걸러 주는 1차 방어선이다.
  const patch = Object.fromEntries(
    Object.entries(updates).filter(
      ([key, value]) => FRIDGE_ITEM_EDITABLE_FIELDS.includes(key) && value !== undefined,
    ),
  ) as Json;

  const { data, error } = await supabase.rpc('update_fridge_item_guarded', {
    p_fridge_item_id: id,
    p_updates: patch,
  });

  if (error) {
    const domainError = resolveDomainError(error);
    if (domainError) return apiResponse.CONFLICT(domainError.code, domainError.message);
    return apiResponse.INTERNAL_ERROR();
  }

  return apiResponse.OK(data);
});

/** DELETE /api/fridge?id= — 냉장고 아이템 소프트 삭제 */
export const DELETE = withAuth(async (req: NextRequest, { supabase }) => {
  const { searchParams } = req.nextUrl;
  const id = searchParams.get('id');

  if (!id) {
    return apiResponse.BAD_REQUEST('CMN_002', 'id가 필요합니다.');
  }

  const { error } = await supabase.rpc('soft_delete_fridge_item', {
    p_fridge_item_id: id,
  });

  if (error) {
    const domainError = resolveDomainError(error);
    if (domainError) return apiResponse.CONFLICT(domainError.code, domainError.message);
    return apiResponse.INTERNAL_ERROR();
  }

  return apiResponse.NO_CONTENT();
});
