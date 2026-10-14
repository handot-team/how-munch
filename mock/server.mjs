// 가짜 Supabase 서버. MSW 핸들러를 Node http 서버 하나로 띄운다.
// 실행: pnpm mock (기본 127.0.0.1:54321). 끄면 메모리 DB가 사라지고 다시 켜면 fixture 상태로 돌아간다.
import http from 'node:http';

import { getResponse } from 'msw';

import { createDatabase } from './db.mjs';
import { createHandlers } from './handlers.mjs';
import { loadSchema } from './postgrest.mjs';

const HOST = process.env.MOCK_HOST ?? '127.0.0.1';
const PORT = Number(process.env.MOCK_PORT ?? 54321);

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,HEAD,POST,PATCH,PUT,DELETE,OPTIONS',
  'access-control-allow-headers':
    'authorization, apikey, content-type, prefer, accept, accept-profile, content-profile, range, x-client-info, x-supabase-api-version',
  'access-control-expose-headers': 'content-range, x-supabase-api-version',
};

const startedAt = Date.now();
const db = await createDatabase();
const schema = await loadSchema(db);
const handlers = createHandlers({ db, schema });

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const url = `http://${req.headers.host ?? `${HOST}:${PORT}`}${req.url}`;
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req);
  const request = new Request(url, {
    method: req.method,
    headers: Object.entries(req.headers).flatMap(([key, value]) =>
      Array.isArray(value) ? value.map((item) => [key, item]) : [[key, value]],
    ),
    body,
  });

  const begin = Date.now();
  try {
    const response = await getResponse(handlers, request);
    if (!response) {
      res.writeHead(404, { ...CORS_HEADERS, 'content-type': 'application/json' });
      res.end(JSON.stringify({ message: `가짜 서버에 없는 경로: ${req.method} ${req.url}` }));
      return;
    }
    const headers = { ...CORS_HEADERS };
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    res.writeHead(response.status, headers);
    res.end(req.method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()));
    if (process.env.MOCK_LOG !== '0') {
      const path = req.url.split('?')[0];
      console.log(`${req.method} ${path} ${response.status} ${Date.now() - begin}ms`);
    }
  } catch (error) {
    console.error(error);
    res.writeHead(500, { ...CORS_HEADERS, 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: error.message }));
  }
});

server.listen(PORT, HOST, () => {
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`가짜 Supabase 준비됨 http://${HOST}:${PORT} (${seconds}s)`);
});
