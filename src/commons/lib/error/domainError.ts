/** 도메인별 커스텀 에러 코드 (XXX_NNN 규격) */
const DOMAIN_ERROR_CODE = {
  // CMN: 공통 도메인
  DUPLICATE_ENTRY: 'CMN_003',
  CONSTRAINT_VIOLATION: 'CMN_004',
  RESOURCE_NOT_FOUND: 'CMN_005',

  // AUT: 인증(Auth) 도메인
  AUTH_UNAUTHORIZED: 'AUT_001',
  COMMON_PERMISSION_DENIED: 'AUT_002',

  // FRG: 냉장고(Fridge) 도메인
  FRIDGE_IN_USE_IN_MEAL: 'FRG_001',
  FRIDGE_QUANTITY_MANAGED_IN_GROCERY: 'FRG_002',
  FRIDGE_QUANTITY_BELOW_MEAL_USAGE: 'FRG_003',
  FRIDGE_ITEM_NOT_FOUND: 'FRG_004',
  FRIDGE_BATCH_NOT_FOUND: 'FRG_005',
  FRIDGE_INVALID_QUANTITY: 'FRG_006',
  FRIDGE_ITEM_DUPLICATE_IDENTITY: 'FRG_007',
  FRIDGE_END_RECORD_NOT_FOUND: 'FRG_008',

  // GRC: 장보기(Grocery) 도메인
  GROCERY_IN_USE_IN_MEAL: 'GRC_001',

  // HSH: 가구(Household) 도메인
  HOUSEHOLD_INVITE_INVALID_OR_EXPIRED: 'HSH_001',
  HOUSEHOLD_ALREADY_MEMBER: 'HSH_002',
  HOUSEHOLD_INVITE_MAX_USES_REACHED: 'HSH_003',

  // MEL: 식단(Meal) 도메인
  MEAL_STOCK_INSUFFICIENT: 'MEL_001',
  MEAL_NOT_FOUND: 'MEL_002',
  MEAL_DISH_NOT_FOUND: 'MEL_003',
  MEAL_INGREDIENT_UNIT_MISMATCH: 'MEL_004',

  // ING: 재료(Ingredient) 도메인
  INGREDIENT_CATEGORY_OTHER_DELETE_NOT_ALLOWED: 'ING_001',
  INGREDIENT_CATEGORY_OTHER_NOT_FOUND: 'ING_002',
  INGREDIENT_CATEGORY_ID_NOT_FOUND: 'ING_003',
  INGREDIENT_CATEGORY_REPLACEMENT_NOT_FOUND: 'ING_004',
  INGREDIENT_NOT_FOUND: 'ING_005',
  INGREDIENT_UNIT_LOCKED_BY_MEAL: 'ING_006',

  // SBD: 소분(Subdivision) 도메인
  SUBDIVISION_INSUFFICIENT_STOCK: 'SBD_001',

  // BUD: 예산(Budget) 도메인
  BUDGET_SCOPE_SUM_EXCEEDS_TOTAL: 'BUD_001',
  BUDGET_YEAR_MONTH_INVALID: 'BUD_002',
  BUDGET_AMOUNT_NEGATIVE: 'BUD_003',

  // SRC: 검색(Search) 도메인
  SEARCH_SYNONYM_GROUP_CONFLICT: 'SRC_001',
  SEARCH_SYNONYM_TERM_EMPTY: 'SRC_002',
  SEARCH_SYNONYM_TERM_DUPLICATED: 'SRC_003',
} as const;

type DomainErrorCodeKey = keyof typeof DOMAIN_ERROR_CODE;
type DomainApiCode = (typeof DOMAIN_ERROR_CODE)[DomainErrorCodeKey];

interface DomainErrorPayload {
  code: DomainApiCode;
  hint?: DomainErrorCodeKey | null;
  message: string;
}

interface DatabaseErrorLike {
  code?: string;
  message?: string;
  hint?: string | null;
  details?: string | null;
}

/** 도메인 에러 코드별 사용자 메시지 */
const DOMAIN_ERROR_MESSAGE: Record<DomainApiCode, string> = {
  // CMN
  CMN_003: '이미 같은 항목이 있습니다.',
  CMN_004: '입력한 값이 허용 범위를 벗어났습니다.',
  CMN_005: '요청한 항목을 찾을 수 없습니다.',

  // AUT
  AUT_001: '로그인이 필요합니다.',
  AUT_002: '권한이 없습니다.',

  // FRG
  FRG_001: '식단에 등록되어 있는 재료는 삭제할 수 없습니다.',
  FRG_002: '장보기에서 등록한 재고는 장보기에서만 수량을 변경할 수 있습니다.',
  FRG_003: '식단에서 사용 중인 수량보다 작게 설정할 수 없습니다.',
  FRG_004: '냉장고 재료를 찾을 수 없습니다.',
  FRG_005: '재고 배치를 찾을 수 없습니다.',
  FRG_006: '유효하지 않은 수량입니다.',
  FRG_007: '같은 이름·브랜드·단위·카테고리의 재료가 이미 있습니다.',
  FRG_008: '끝 기록을 찾을 수 없습니다.',

  // GRC
  GRC_001: '식단에 등록되어 있는 재료는 삭제할 수 없습니다.',

  // HSH
  HSH_001: '유효하지 않거나 만료된 초대 코드입니다.',
  HSH_002: '이미 해당 가구의 구성원입니다.',
  HSH_003: '초대 코드 사용 횟수가 모두 소진되었습니다.',

  // MEL
  MEL_001: '냉장고 재고가 부족합니다. 식단 재료 수량을 확인해 주세요.',
  MEL_002: '식단을 찾을 수 없습니다.',
  MEL_003: '메뉴를 찾을 수 없습니다.',
  MEL_004: '재료 정보가 변경되었습니다. 새로고침한 뒤 다시 저장해 주세요.',

  // ING
  ING_001: '기본 카테고리(기타)는 삭제할 수 없습니다.',
  ING_002: '기본 카테고리(기타)를 찾을 수 없습니다.',
  ING_003: '유효하지 않은 카테고리입니다.',
  ING_004: '대체할 기본 카테고리(기타)를 찾을 수 없습니다.',
  ING_005: '재료를 찾을 수 없습니다.',
  ING_006: '식단에서 사용 중인 재료는 단위를 변경할 수 없습니다.',

  // SBD
  SBD_001: '소분할 재고가 부족합니다.',

  // BUD
  BUD_001: '항목별 예산 합계가 전체 예산을 초과합니다.',
  BUD_002: '예산 연월 형식이 올바르지 않습니다.',
  BUD_003: '예산은 0원 이상이어야 합니다.',

  // SRC
  SRC_001: '입력한 단어가 이미 다른 유사어 그룹에 있습니다. 설정에서 확인해 주세요.',
  SRC_002: '유사어를 입력해 주세요.',
  SRC_003: '이미 같은 단어입니다. 다른 단어를 입력해 주세요.',
};

/**
 * PostgreSQL 레거시 errcode → DomainErrorCodeKey 폴백 매핑.
 * RPC hint가 없는 경우 errcode로 도메인 에러를 식별한다.
 */
const POSTGRES_ERRCODE_TO_KEY: Partial<Record<string, DomainErrorCodeKey>> = {
  // 표준 PostgreSQL 제약 위반. 도메인 코드가 없으면 원인이 안 보이는 500으로만 떨어진다.
  '23505': 'DUPLICATE_ENTRY',
  '23514': 'CONSTRAINT_VIOLATION',
  A0001: 'AUTH_UNAUTHORIZED',
  A0002: 'COMMON_PERMISSION_DENIED',
  F0001: 'FRIDGE_IN_USE_IN_MEAL',
  F0002: 'FRIDGE_QUANTITY_MANAGED_IN_GROCERY',
  F0003: 'FRIDGE_QUANTITY_BELOW_MEAL_USAGE',
  F0004: 'FRIDGE_ITEM_NOT_FOUND',
  F0005: 'FRIDGE_BATCH_NOT_FOUND',
  F0006: 'FRIDGE_INVALID_QUANTITY',
  F0007: 'FRIDGE_ITEM_DUPLICATE_IDENTITY',
  F0008: 'FRIDGE_END_RECORD_NOT_FOUND',
  C0001: 'GROCERY_IN_USE_IN_MEAL',
  H0001: 'HOUSEHOLD_INVITE_INVALID_OR_EXPIRED',
  H0002: 'HOUSEHOLD_ALREADY_MEMBER',
  H0003: 'HOUSEHOLD_INVITE_MAX_USES_REACHED',
  M0001: 'MEAL_STOCK_INSUFFICIENT',
  M0002: 'MEAL_NOT_FOUND',
  M0003: 'MEAL_DISH_NOT_FOUND',
  M0004: 'MEAL_INGREDIENT_UNIT_MISMATCH',
  I0001: 'INGREDIENT_CATEGORY_OTHER_DELETE_NOT_ALLOWED',
  I0002: 'INGREDIENT_CATEGORY_OTHER_NOT_FOUND',
  I0003: 'INGREDIENT_CATEGORY_ID_NOT_FOUND',
  I0004: 'INGREDIENT_CATEGORY_REPLACEMENT_NOT_FOUND',
  I0005: 'INGREDIENT_NOT_FOUND',
  I0006: 'INGREDIENT_UNIT_LOCKED_BY_MEAL',
  S0001: 'SUBDIVISION_INSUFFICIENT_STOCK',
  B0001: 'BUDGET_SCOPE_SUM_EXCEEDS_TOTAL',
  B0002: 'BUDGET_YEAR_MONTH_INVALID',
  B0003: 'BUDGET_AMOUNT_NEGATIVE',
  // 검색 도메인은 'S' 대역이 소분(Subdivision)에 선점돼 있어 'R'(seaRch)을 사용한다.
  R0001: 'SEARCH_SYNONYM_GROUP_CONFLICT',
  R0002: 'SEARCH_SYNONYM_TERM_EMPTY',
  R0003: 'SEARCH_SYNONYM_TERM_DUPLICATED',
};

/**
 * @description unknown 에러를 DB 에러 형태로 안전하게 변환합니다.
 */
function toDatabaseError(error: unknown) {
  return error as DatabaseErrorLike | null;
}

/**
 * @description PostgreSQL 커스텀 에러에서 도메인 에러 페이로드를 추출합니다.
 * hint 기반 lookup을 우선하고, 없으면 레거시 errcode 매핑으로 폴백합니다.
 */
function resolveDomainError(error: unknown): DomainErrorPayload | null {
  const dbError = toDatabaseError(error);
  if (!dbError) return null;

  // 1. hint 기반 lookup (권장: hint = 'FRIDGE_IN_USE_IN_MEAL')
  const domainHint = dbError.hint as DomainErrorCodeKey | null;
  if (domainHint && domainHint in DOMAIN_ERROR_CODE) {
    const mappedCode = DOMAIN_ERROR_CODE[domainHint];
    return {
      code: mappedCode,
      hint: domainHint,
      message: DOMAIN_ERROR_MESSAGE[mappedCode],
    };
  }

  // 2. 레거시 PostgreSQL errcode 폴백 (F0001 → FRG_001)
  const pgCode = dbError.code;
  if (pgCode && pgCode in POSTGRES_ERRCODE_TO_KEY) {
    const key = POSTGRES_ERRCODE_TO_KEY[pgCode]!;
    const mappedCode = DOMAIN_ERROR_CODE[key];
    return {
      code: mappedCode,
      hint: key,
      message: DOMAIN_ERROR_MESSAGE[mappedCode],
    };
  }

  return null;
}

export { DOMAIN_ERROR_CODE, DOMAIN_ERROR_MESSAGE, resolveDomainError };
