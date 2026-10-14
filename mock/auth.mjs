// GoTrue(/auth/v1) 중 앱이 쓰는 이메일 OTP 로그인 흐름만 흉내 낸다.
// 어떤 6자리 코드든 통과시키고, 서명한 JWT를 세션으로 내준다.
import crypto from 'node:crypto';

const JWT_SECRET = 'how-munch-mock-jwt-secret';
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

const base64url = (input) => Buffer.from(input).toString('base64url');

function signJwt(payload) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

/**
 * @description 서명과 만료를 확인하고 claims를 돌려준다. 틀리면 null.
 */
export function verifyJwt(token) {
  if (!token) return null;
  const [header, body, signature] = token.split('.');
  if (!header || !body || !signature) return null;
  const expected = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  if (expected !== signature) return null;
  const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) return null;
  return claims;
}

/** 앱에 NEXT_PUBLIC_SUPABASE_ANON_KEY로 넘기는 값. 만료 없는 anon JWT다. */
export const ANON_KEY = signJwt({ iss: 'how-munch-mock', role: 'anon', iat: 1700000000 });

const refreshTokens = new Map();

function toAuthUser(row) {
  return {
    id: row.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: row.email,
    email_confirmed_at: row.created_at,
    phone: '',
    confirmed_at: row.created_at,
    last_sign_in_at: new Date().toISOString(),
    app_metadata: row.raw_app_meta_data,
    user_metadata: row.raw_user_meta_data,
    identities: [],
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_anonymous: false,
  };
}

async function findUserById(db, id) {
  const result = await db.query(`select * from auth.users where id = $1`, [id]);
  return result.rows[0] ?? null;
}

async function findOrCreateUser(db, email) {
  const existing = await db.query(`select * from auth.users where email = $1`, [email]);
  if (existing.rows[0]) return existing.rows[0];
  // 새 사용자는 실제 트리거(handle_new_user)가 profiles·알림 설정 행을 만든다.
  const created = await db.query(`insert into auth.users (email) values ($1) returning *`, [email]);
  return created.rows[0];
}

function issueSession(user) {
  const now = Math.floor(Date.now() / 1000);
  const accessToken = signJwt({
    sub: user.id,
    email: user.email,
    role: 'authenticated',
    aud: 'authenticated',
    iat: now,
    exp: now + ACCESS_TOKEN_TTL_SECONDS,
    session_id: crypto.randomUUID(),
  });
  const refreshToken = crypto.randomBytes(16).toString('hex');
  refreshTokens.set(refreshToken, user.id);
  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    expires_at: now + ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refreshToken,
    user: toAuthUser(user),
  };
}

const json = (status, body) => ({ status, body });
const authError = (status, code, message) =>
  json(status, { code: status, error_code: code, msg: message });

/**
 * @description /auth/v1 요청 하나를 처리해 { status, body }를 돌려준다.
 */
export async function handleAuth({ db, request }) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/auth\/v1\/?/, '');
  const method = request.method.toUpperCase();
  const payload = method === 'GET' ? {} : await request.json().catch(() => ({}));
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  if (path === 'otp' && method === 'POST') {
    if (!payload.email) return authError(400, 'validation_failed', '이메일이 필요합니다.');
    return json(200, {});
  }

  if (path === 'verify' && method === 'POST') {
    if (!payload.email || !/^\d{6}$/.test(String(payload.token ?? ''))) {
      return authError(403, 'otp_expired', 'Token has expired or is invalid');
    }
    const user = await findOrCreateUser(db, String(payload.email).toLowerCase());
    return json(200, issueSession(user));
  }

  if (path === 'token' && method === 'POST') {
    const grantType = url.searchParams.get('grant_type');
    if (grantType !== 'refresh_token') {
      return authError(400, 'unsupported_grant_type', `${grantType}은 흉내 내지 않습니다.`);
    }
    const userId = refreshTokens.get(payload.refresh_token);
    const user = userId ? await findUserById(db, userId) : null;
    if (!user) return authError(400, 'refresh_token_not_found', 'Invalid Refresh Token');
    refreshTokens.delete(payload.refresh_token);
    return json(200, issueSession(user));
  }

  if (path === 'user') {
    const claims = verifyJwt(bearer);
    const user = claims?.sub ? await findUserById(db, claims.sub) : null;
    if (!user) return authError(401, 'bad_jwt', 'invalid JWT');
    if (method === 'PUT') {
      const metadata = { ...user.raw_user_meta_data, ...(payload.data ?? {}) };
      const updated = await db.query(
        `update auth.users set raw_user_meta_data = $2, updated_at = now() where id = $1 returning *`,
        [user.id, metadata],
      );
      return json(200, toAuthUser(updated.rows[0]));
    }
    return json(200, toAuthUser(user));
  }

  if (path === 'logout' && method === 'POST') return { status: 204, body: null };

  return authError(404, 'not_found', `/auth/v1/${path}은 흉내 내지 않습니다.`);
}
