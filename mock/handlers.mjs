// 가짜 Supabase의 MSW 핸들러. Next 서버와 브라우저가 같은 프로세스를 부르므로
// 메모리 DB 하나를 같이 쓴다.
import { http, HttpResponse } from 'msw';

import { ANON_KEY, handleAuth, verifyJwt } from './auth.mjs';
import { handlePostgrest } from './postgrest.mjs';

// 영수증 인식(Anthropic Messages API) 고정 응답. 3차 시안의 이마트 영수증 5줄이고,
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
].map((item) => ({ ...item, store: '이마트', date: '' }));

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
  return [
    http.all('*/auth/v1/*', async ({ request }) => toResponse(await handleAuth({ db, request }))),

    http.all('*/rest/v1/*', async ({ request }) => {
      const claims = resolveClaims(request);
      return toResponse(await handlePostgrest({ db, schema, claims, request }));
    }),

    // Edge Function(푸시 발송)은 받기만 하고 보내지 않는다.
    http.all('*/functions/v1/*', () => HttpResponse.json({ ok: true, mocked: true })),

    http.post('*/anthropic/v1/messages', () =>
      HttpResponse.json({
        id: 'msg_mock_receipt',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-5',
        content: [{ type: 'text', text: JSON.stringify({ items: RECEIPT_ITEMS }) }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      }),
    ),

    http.get('*/mock/anon-key', () => HttpResponse.text(ANON_KEY)),
  ];
}
