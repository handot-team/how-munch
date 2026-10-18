import { type StagedItem } from '../lib/parseAiResponse';

type EditCallback = (updates: Partial<StagedItem>) => void;

let pendingCallback: EditCallback | null = null;

/**
 * @description 스테이징 항목 편집 완료 콜백을 등록한다.
 * Stackflow params는 함수 직렬화가 불가하므로 모듈 스코프에 단일 콜백을 보관한다.
 */
export function setPendingPromptEditCallback(callback: EditCallback) {
  pendingCallback = callback;
}

/**
 * @description 등록된 편집 콜백을 실행하고 초기화한다.
 */
export function resolvePendingPromptEditCallback(updates: Partial<StagedItem>) {
  pendingCallback?.(updates);
  pendingCallback = null;
}

/**
 * @description 등록된 편집 콜백을 실행하지 않고 초기화한다 (취소 시).
 */
export function clearPendingPromptEditCallback() {
  pendingCallback = null;
  pendingRemove = null;
}

let pendingRemove: (() => void) | null = null;

/**
 * @description 시안 v7 C안: 품목 고치기 화면의 삭제가 담기 화면 목록에서 그 품목을 지우도록 콜백을 맡겨 둔다.
 */
export function setPendingPromptRemoveCallback(callback: (() => void) | null) {
  pendingRemove = callback;
}

/**
 * @description 맡겨 둔 삭제 콜백을 실행하고 편집 콜백과 함께 비운다.
 */
export function resolvePendingPromptRemoveCallback() {
  pendingRemove?.();
  pendingRemove = null;
  pendingCallback = null;
}
