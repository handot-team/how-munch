# 가짜 Supabase (목업용)

Docker 없이 앱을 띄워 눌러 보기 위한 개발 도구다. 운영 코드에는 들어가지 않는다.

## 실행

```bash
pnpm mock       # 가짜 Supabase  http://127.0.0.1:54321
pnpm dev:mock   # 가짜 Supabase를 바라보는 Next 개발 서버  http://localhost:3000
```

로그인은 `/login/email`에서 `me@howmunch.test`(가구원 "나")와 아무 6자리 코드로 한다. 다른 메일을 쓰면 가구 없는 새 사용자로 들어간다. `mom@howmunch.test`(엄마), `dad@howmunch.test`(아빠)도 있다.

가짜 서버를 껐다 켜면 fixture 상태로 돌아간다.

## 구조

- `server.mjs`: Node http 서버 하나에 MSW 핸들러(`handlers.mjs`)를 붙인다. Next 서버(Route Handler, Server Component, proxy)와 브라우저가 같은 서버를 불러 메모리 상태 하나를 같이 쓴다.
- `db.mjs`: PGlite(WASM Postgres, 메모리)에 `supabase/migrations/*.sql`을 순서대로 넣고 `fixtures/*.sql`을 넣는다. 테이블·뷰·트리거·RPC·RLS 정책은 실제 migration 그대로다. Supabase가 기본으로 주는 역할(anon·authenticated)과 `auth.users`·`auth.uid()`만 흉내 낸다.
- `postgrest.mjs`: `/rest/v1` 요청을 SQL로 옮긴다. 앱이 쓰는 문법만 다룬다(select 별칭·embedded, eq/neq/gt/gte/lt/lte/like/ilike/is/in/cs, not/or/and, order, limit/offset, count, insert/upsert/update/delete, rpc, single/maybeSingle). 요청마다 `authenticated` 역할과 JWT `sub`를 넣어 RLS가 실제처럼 걸린다.
- `auth.mjs`: `/auth/v1`의 이메일 OTP 흐름(otp, verify, token refresh, user, logout). 코드는 아무 6자리나 통과하고 서명한 JWT를 세션으로 준다.
- 그 밖: `/functions/v1/*`(푸시 발송)은 받기만 하고, 영수증 인식(`/anthropic/v1/messages`)은 고정 응답(이마트 영수증 5줄)을 준다.

## 흉내만 낸 것

- 푸시 발송, 예약 작업(유통기한·주간 알림 생성), 카카오 로그인, Storage는 없다.
- PostgREST 문법 중 앱이 쓰지 않는 것(embedded 테이블 필터, 집계 함수 등)은 받지 않는다.
