// 가짜 Supabase의 MSW 핸들러. Next 서버와 브라우저가 같은 프로세스를 부르므로
// 메모리 DB 하나를 같이 쓴다.
import { http, HttpResponse } from 'msw';

import { ANON_KEY, handleAuth, verifyJwt } from './auth.mjs';
import { handlePostgrest } from './postgrest.mjs';

// 영수증 인식(Anthropic Messages API) 고정 응답. 3차 시안의 이마트 영수증 5줄(나흘 전 날짜)이고,
// 당근은 가격을 못 읽은 줄(0원)이다.
const RECEIPT_ITEMS = [
  {
    brand: '',
    product: '사과',
    spec: '',
    unit: 'count',
    count: 4,
    price: 5980,
    category_code: 'fruit',
  },
  {
    brand: '',
    product: '요거트',
    spec: '',
    unit: 'count',
    count: 4,
    price: 4480,
    category_code: 'dairy',
  },
  {
    brand: '',
    product: '당근',
    spec: '1봉',
    unit: 'count',
    count: 1,
    price: 0,
    category_code: 'veggie',
  },
  {
    brand: '',
    product: '두유',
    spec: '',
    unit: 'count',
    count: 2,
    price: 3600,
    category_code: 'drink',
  },
  {
    brand: '',
    product: '김',
    spec: '1봉',
    unit: 'count',
    count: 1,
    price: 3200,
    category_code: 'processed',
  },
].map((item) => ({ ...item, store: '이마트', date: receiptDate() }));

// 두 번째 영수증(시안 v5, 영수증 여러 장). 다른 가게, 이틀 전 날짜다.
const RECEIPT_ITEMS_2 = [
  { brand: '', product: '바나나', spec: '', unit: 'count', count: 1, price: 3980, category_code: 'fruit' },
  { brand: '', product: '대파', spec: '1단', unit: 'count', count: 1, price: 2480, category_code: 'veggie' },
  { brand: '', product: '두부', spec: '', unit: 'count', count: 2, price: 3000, category_code: 'tofu_legume' },
].map((item) => ({ ...item, store: '홈플러스', date: receiptDate(2) }));

// 영수증은 며칠 전 장보기다(직접 넣는 줄의 기본값 날짜·구매처와 다르게 읽힌 줄을 보여 준다).
function receiptDate(daysAgo = 4) {
  const d = new Date(Date.now() + 9 * 3600_000 - daysAgo * 86400_000);
  return d.toISOString().slice(0, 10);
}

function toResponse({ status, body, headers = {} }) {
  if (body === null || body === undefined || status === 204) {
    return new HttpResponse(null, { status, headers });
  }
  return HttpResponse.json(body, { status, headers });
}

/** apikey·Authorization 헤더에서 요청자 claims를 읽는다. 둘 다 없으면 anon. */
function resolveClaims(request) {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const apiKey = request.headers.get('apikey');
  return verifyJwt(bearer) ?? verifyJwt(apiKey) ?? { role: 'anon' };
}

/**
 * @description DB와 스키마 캐시를 받아 MSW 핸들러 목록을 만든다.
 */
export function createHandlers({ db, schema }) {
  // 다건 저장 시험용 실패 스위치. 장보기 저장(add_ingredient_with_fridge)에서 품목명이 맞는 줄에 한 번만 건다.
  // - reject: 저장하지 않고 제약 위반(23514)으로 거절한다. 앱에는 도메인 오류 문구(CMN_004)로 온다.
  // - drop: 저장은 하고 응답만 끊는다(504). 앱은 저장 여부를 모른다.
  let failSwitch = null;
  // 알림 요청 기록. 묶음 알림이 몇 번 갔는지 시험 출력에 쓴다.
  const notifyLog = [];
  let receiptCalls = 0;
  const nextReceipt = () => (receiptCalls++ % 2 === 0 ? RECEIPT_ITEMS : RECEIPT_ITEMS_2);

  return [
    http.post('*/mock/switch', async ({ request }) => {
      const body = await request.json().catch(() => ({}));
      failSwitch = body.mode === 'reject' || body.mode === 'drop' ? body : null;
      return HttpResponse.json({ failSwitch });
    }),
    http.get('*/mock/log', () => HttpResponse.json({ notifyLog, failSwitch })),

    http.all('*/auth/v1/*', async ({ request }) => toResponse(await handleAuth({ db, request }))),

    http.post('*/rest/v1/rpc/add_ingredient_with_fridge', async ({ request }) => {
      if (!failSwitch) return undefined;
      const body = await request.clone().json();
      if (body.p_name !== failSwitch.name) return undefined;
      const { mode } = failSwitch;
      failSwitch = null;
      if (mode === 'reject') {
        return HttpResponse.json(
          { code: '23514', message: 'mock reject', hint: null, details: null },
          { status: 400 },
        );
      }
      const claims = resolveClaims(request);
      await handlePostgrest({ db, schema, claims, request });
      return HttpResponse.json({ message: 'mock drop: upstream timeout' }, { status: 504 });
    }),

    http.all('*/rest/v1/*', async ({ request }) => {
      const claims = resolveClaims(request);
      return toResponse(await handlePostgrest({ db, schema, claims, request }));
    }),

    // Edge Function(푸시 발송)은 받기만 하고 보내지 않는다. 종류만 기록한다.
    http.all('*/functions/v1/*', async ({ request }) => {
      const body = await request
        .clone()
        .json()
        .catch(() => ({}));
      notifyLog.push({ path: new URL(request.url).pathname, type: body.type ?? null });
      return HttpResponse.json({ ok: true, mocked: true });
    }),

    // 영수증 인식은 부를 때마다 이마트 → 홈플러스 순으로 번갈아 답한다(여러 장 시험용).
    http.post('*/anthropic/v1/messages', () =>
      HttpResponse.json({
        id: 'msg_mock_receipt',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-5',
        content: [{ type: 'text', text: JSON.stringify({ items: nextReceipt() }) }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      }),
    ),

    http.get('*/mock/anon-key', () => HttpResponse.text(ANON_KEY)),
  ];
}
