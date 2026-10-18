import { format } from 'date-fns';

import {
  isIngredientUnit,
  isVolumeUnit,
  isWeightUnit,
  normalizeAmountByUnit,
  parseProductSpec,
  type IngredientUnit,
} from '@/entities/ingredient';
import { type IngredientCategoryOption } from '@/entities/ingredient-category';

export interface StagedItem {
  id: string;
  name: string;
  brand: string;
  price: number;
  count: number;
  unit: IngredientUnit;
  store: string;
  date: string;
  category_code: string;
  category_id: string;
  /** 담기 목록에서 줄이 어디서 왔는지(직접 입력/영수증). 영수증 파싱 결과는 비워 두고 담을 때 채운다. */
  source?: 'direct' | 'receipt';
}

/**
 * @description 병합 키에 쓰일 문자열을 정규화한다.
 * DB 병합(add_ingredient_with_fridge)이 `lower(btrim(...))`으로 매칭하므로 같은 규칙을 적용해,
 * 스테이징 단계와 저장 단계의 중복 판정이 어긋나지 않도록 한다.
 */
function normalizeKeyPart(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * @description AI가 분해한 product/spec/unit을 냉장고 재고용 이름·수량·단위로 조립한다.
 * 규격 표기의 개수 부분과 용량 부분을 서로 다른 역할로 쓴다 — 개수는 언제나 수량 계산에 들어가고,
 * 용량은 단위로 채택되거나 그렇지 않으면 이름 뒤에 규격 구분자로 남는다.
 * 용량을 단위로 채택하는 경우는 둘이다.
 * 1) AI가 무게·부피 품목으로 판정했고 실제 용량 표기가 있을 때
 * 2) 최종 수량이 1일 때 — '1개'보다 '500g'이 정보량이 많으므로 용량을 단위로 올린다
 * 수량이 2 이상이면 개수로 세는 편이 자연스러우므로 용량은 이름에 남긴다.
 * 용량 표기가 없으면 언제나 'count'로 떨어뜨려 규격 없이 단위만 무게로 남는 모순을 막는다.
 * (예: '삼겹살' + '500g' ×1 → `삼겹살` 500g,
 *  '삼겹살' + '500g 2팩' + count → `삼겹살 500g` 2개,
 *  '사양벌꿀' + '1kg' ×2 → `사양벌꿀 1kg` 2개)
 */
function resolveNameAndAmount(
  product: string,
  specText: string,
  aiUnit: IngredientUnit,
  purchaseCount: number,
): { name: string; count: number; unit: IngredientUnit } {
  const { packCount, measure } = parseProductSpec(specText);
  const packs = packCount ?? 1;
  const totalCount = packs * purchaseCount;

  const isMeasureUnit = isWeightUnit(aiUnit) || isVolumeUnit(aiUnit);
  if (measure && (isMeasureUnit || totalCount === 1)) {
    return {
      name: product,
      count: normalizeAmountByUnit(measure.amount * totalCount, measure.unit),
      unit: measure.unit,
    };
  }

  return {
    name: [product, measure?.text].filter(Boolean).join(' ').trim(),
    count: totalCount,
    unit: 'count',
  };
}

/**
 * @description name + brand + price + store + date + category_code + unit이 모두 같은 항목을 하나로 병합하고
 * count와 price를 함께 합산한다.
 * price는 개당 단가가 아니라 해당 품목의 총 지출액이므로, 동일 항목이 여러 줄로 찍혀 병합될 때 지출액이 유실되지 않도록 price도 누적한다.
 * unit을 키에 포함해 표기 방식이 달라 단위가 갈린 항목이 잘못 합산되지 않도록 하고,
 * 문자열 키는 정규화해 대소문자·공백만 다른 항목('1KG' vs '1kg')이 중복으로 남지 않게 한다.
 */
function mergeDuplicates(items: StagedItem[]): StagedItem[] {
  const seen = new Map<string, StagedItem>();

  for (const item of items) {
    const key = [
      normalizeKeyPart(item.name),
      normalizeKeyPart(item.brand),
      item.price,
      normalizeKeyPart(item.store),
      item.date,
      item.category_code,
      item.unit,
    ].join('|');

    const existing = seen.get(key);
    if (existing) {
      existing.count += item.count;
      existing.price += item.price;
    } else {
      seen.set(key, { ...item });
    }
  }

  return Array.from(seen.values());
}

/**
 * @description Claude AI 응답 텍스트를 파싱해 StagedItem 배열로 변환한다.
 * JSON 블록 추출 → 유효성 검사 → category_code를 category_id로 매핑 → product/spec/unit 조립 → 중복 항목 병합 순으로 처리한다.
 * AI가 돌려준 unit은 신뢰하지 않고 IngredientUnit으로 좁힌 뒤, 실패하면 'count'로 강등한다.
 * 날짜를 특정할 수 없는 항목은 today로 보정한다. 서버 실행 시 타임존이 어긋나지 않도록
 * 호출자(클라이언트 로컬 날짜)가 today를 주입할 수 있으며, 미주입 시 실행 환경의 오늘로 폴백한다.
 * 파싱 실패 시 사용자에게 보여줄 한국어 에러 메시지와 함께 throw한다.
 */
export function parseAiResponse(
  text: string,
  categories: IngredientCategoryOption[],
  today: string = format(new Date(), 'yyyy-MM-dd'),
): StagedItem[] {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch)
    throw new Error('JSON 형식을 찾을 수 없습니다. Claude 답변을 그대로 붙여넣어 주세요.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error('올바른 JSON 형식이 아닙니다. Claude 답변을 그대로 붙여넣어 주세요.');
  }

  if (typeof parsed !== 'object' || parsed === null || !('items' in parsed)) {
    throw new Error('items 키가 없습니다. 프롬프트를 다시 확인해 주세요.');
  }

  const { items } = parsed as { items: unknown };
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('분석된 품목이 없습니다.');
  }

  const categoryMap = new Map(categories.map((c) => [c.code, c.id]));
  const validCodes = new Set(categories.map((c) => c.code));
  const otherId = categories.find((c) => c.code === 'other')?.id ?? '';

  const mapped = items
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => {
      const code =
        typeof item['category_code'] === 'string' && validCodes.has(item['category_code'])
          ? item['category_code']
          : 'other';

      const product = typeof item['product'] === 'string' ? item['product'].trim() : '';
      const specText = typeof item['spec'] === 'string' ? item['spec'] : '';
      const aiUnit = isIngredientUnit(item['unit']) ? item['unit'] : 'count';
      const rawCount = typeof item['count'] === 'number' ? item['count'] : 1;
      const purchaseCount = Number.isFinite(rawCount) && rawCount > 0 ? rawCount : 1;

      const { name, count, unit } = resolveNameAndAmount(product, specText, aiUnit, purchaseCount);

      return {
        id: crypto.randomUUID(),
        name,
        brand: typeof item['brand'] === 'string' ? item['brand'].trim() : '',
        price: typeof item['price'] === 'number' ? Math.round(item['price']) : 0,
        count,
        unit,
        store: typeof item['store'] === 'string' ? item['store'].trim() : '',
        date:
          typeof item['date'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item['date'])
            ? item['date']
            : today,
        category_code: code,
        category_id: categoryMap.get(code) ?? otherId,
      };
    })
    .filter((item) => item.name.length > 0);

  // items는 있는데 전부 걸러졌다면 응답 형식이 계약과 어긋난 것이다(예: product 없이 name만 온 경우).
  // 빈 배열을 성공으로 돌려주면 사용자는 원인 없이 빈 스테이징 화면만 보게 되므로 실패로 처리한다.
  if (mapped.length === 0) {
    throw new Error('품목을 읽지 못했습니다. 사진이 선명한지 확인하고 다시 시도해 주세요.');
  }

  return mergeDuplicates(mapped);
}
