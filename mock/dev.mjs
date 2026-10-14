// 가짜 Supabase(pnpm mock)를 바라보는 Next 개발 서버. 접속 값은 파일 대신 여기서 환경변수로 넘긴다.
import { spawn } from 'node:child_process';

import { ANON_KEY } from './auth.mjs';

const MOCK_URL = `http://${process.env.MOCK_HOST ?? '127.0.0.1'}:${process.env.MOCK_PORT ?? 54321}`;

const child = spawn('pnpm', ['exec', 'next', 'dev', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: MOCK_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
    // 영수증 인식은 가짜 서버의 고정 응답으로 보낸다.
    ANTHROPIC_API_KEY: 'mock',
    ANTHROPIC_BASE_URL: `${MOCK_URL}/anthropic`,
  },
});

child.on('exit', (code) => process.exit(code ?? 0));
