import { type NextRequest } from 'next/server';

import { respondWithDbError, withAuth } from '@/apps/route';

import { resolveDomainError } from '@/commons/lib';
import { apiResponse } from '@/commons/lib/http/apiResponse';

import { type FridgeBatchEndRecord } from '@/entities/fridge-item';

const END_KINDS = ['eaten', 'discarded'] as const;
const RECENT_LIMIT = 5;

/**
 * GET /api/fridge/end-records?fridgeItemId=
 * 재료의 최근 끝 기록(되돌리지 않은 것). 끝 기록 시트의 "최근 기록"과 되돌리기에 쓴다.
 */
export const GET = withAuth(async (req: NextRequest, { supabase }) => {
  const fridgeItemId = req.nextUrl.searchParams.get('fridgeItemId');

  if (!fridgeItemId) {
    return apiResponse.BAD_REQUEST('CMN_002', 'fridgeItemId가 필요합니다.');
  }

  const { data, error } = await supabase
    .from('fridge_batch_end_records')
    .select('*')
    .eq('fridge_item_id', fridgeItemId)
    .is('undone_at', null)
    .order('created_at', { ascending: false })
    .limit(RECENT_LIMIT);

  if (error) return respondWithDbError(error, 'GET /api/fridge/end-records');

  return apiResponse.OK((data ?? []) as FridgeBatchEndRecord[]);
});

/** POST /api/fridge/end-records — 구매분 하나를 다 먹음/버림으로 끝낸다 */
export const POST = withAuth(async (req: NextRequest, { supabase }) => {
  const body = await req.json();
  const { batchId, kind, amount } = body;

  if (!batchId || !END_KINDS.includes(kind) || !(Number(amount) > 0)) {
    return apiResponse.BAD_REQUEST('CMN_002', 'batchId, kind, amount가 필요합니다.');
  }

  const { data, error } = await supabase.rpc('record_fridge_batch_end', {
    p_batch_id: batchId,
    p_kind: kind,
    p_amount: Number(amount),
  });

  if (error) {
    const domainError = resolveDomainError(error);
    if (domainError) return apiResponse.CONFLICT(domainError.code, domainError.message);
    return apiResponse.INTERNAL_ERROR();
  }

  return apiResponse.CREATED({ id: data });
});

/** DELETE /api/fridge/end-records?id= — 끝 기록 되돌리기(구매분 수량 복구) */
export const DELETE = withAuth(async (req: NextRequest, { supabase }) => {
  const id = req.nextUrl.searchParams.get('id');

  if (!id) {
    return apiResponse.BAD_REQUEST('CMN_002', 'id가 필요합니다.');
  }

  const { error } = await supabase.rpc('undo_fridge_batch_end_record', { p_record_id: id });

  if (error) {
    const domainError = resolveDomainError(error);
    if (domainError) return apiResponse.CONFLICT(domainError.code, domainError.message);
    return apiResponse.INTERNAL_ERROR();
  }

  return apiResponse.NO_CONTENT();
});
