import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { type StagedItem } from '../lib/parseAiResponse';

/**
 * 줄마다의 저장 상태.
 * - error: 서버가 저장 전에 거절했다(사유가 있다). 다시 저장 대상이다.
 * - unknown: 응답이 끊겨 저장됐는지 모른다. 다시 저장하면 두 번 들어갈 수 있어 다시 저장에서 뺀다.
 */
export type SaveState = 'idle' | 'saving' | 'success' | 'error' | 'unknown';

interface PromptIngredientState {
  items: StagedItem[];
  checkedIds: string[];
  saveStates: Record<string, SaveState>;
  errors: Record<string, string>;
  /** 이번 묶음에서 지금까지 저장한 줄 수(결과 띠와 끝 알림에 보여 준다) */
  lastSavedCount: number;
  setItems: (items: StagedItem[]) => void;
  addItems: (items: StagedItem[]) => void;
  updateItem: (id: string, updates: Partial<StagedItem>) => void;
  toggleCheck: (id: string) => void;
  toggleAll: () => void;
  setSaveState: (id: string, state: SaveState, error?: string) => void;
  removeItems: (ids: string[]) => void;
  addSavedCount: (count: number) => void;
  reset: () => void;
}

/**
 * @description 담기 목록 전역 스토어. 영수증 인식 줄과 장보기 직접 입력에서 "담기"한 줄이 같은 목록에 모인다.
 * 마트에서 다른 앱을 보고 돌아오면 페이지가 새로 뜰 수 있어 기기(localStorage)에 남긴다.
 */
export const usePromptIngredientStore = create<PromptIngredientState>()(
  persist(
    (set, get) => ({
      items: [],
      checkedIds: [],
      saveStates: {},
      errors: {},
      lastSavedCount: 0,

      setItems(items) {
        set({
          items,
          checkedIds: items.map((i) => i.id),
          saveStates: Object.fromEntries(items.map((i) => [i.id, 'idle'])),
          errors: {},
          lastSavedCount: 0,
        });
      },

      addItems(items) {
        set((state) => ({
          items: [...state.items, ...items],
          checkedIds: [...state.checkedIds, ...items.map((i) => i.id)],
          saveStates: {
            ...state.saveStates,
            ...Object.fromEntries(items.map((i) => [i.id, 'idle' as const])),
          },
          lastSavedCount: 0,
        }));
      },

      updateItem(id, updates) {
        set((state) => ({
          items: state.items.map((item) => (item.id === id ? { ...item, ...updates } : item)),
        }));
      },

      toggleCheck(id) {
        const { checkedIds } = get();
        const next = checkedIds.includes(id)
          ? checkedIds.filter((cid) => cid !== id)
          : [...checkedIds, id];
        set({ checkedIds: next });
      },

      toggleAll() {
        const { items, checkedIds } = get();
        const allChecked = items.every((i) => checkedIds.includes(i.id));
        set({ checkedIds: allChecked ? [] : items.map((i) => i.id) });
      },

      setSaveState(id, state, error) {
        set((prev) => {
          const errors = { ...prev.errors };
          if (error) errors[id] = error;
          else delete errors[id];
          return { saveStates: { ...prev.saveStates, [id]: state }, errors };
        });
      },

      removeItems(ids) {
        const drop = new Set(ids);
        set((state) => ({
          items: state.items.filter((i) => !drop.has(i.id)),
          checkedIds: state.checkedIds.filter((id) => !drop.has(id)),
          saveStates: Object.fromEntries(
            Object.entries(state.saveStates).filter(([id]) => !drop.has(id)),
          ),
          errors: Object.fromEntries(Object.entries(state.errors).filter(([id]) => !drop.has(id))),
        }));
      },

      addSavedCount(count) {
        set((state) => ({ lastSavedCount: state.lastSavedCount + count }));
      },

      reset() {
        set({ items: [], checkedIds: [], saveStates: {}, errors: {}, lastSavedCount: 0 });
      },
    }),
    {
      name: 'howmunch-basket',
      storage: createJSONStorage(() => localStorage),
      partialize: ({ items, checkedIds, saveStates, errors }) => ({
        items,
        checkedIds,
        saveStates,
        errors,
      }),
      // 저장 중에 페이지가 닫혔으면 그 줄은 결과를 모르는 줄이다.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<PromptIngredientState>;
        const saveStates = Object.fromEntries(
          Object.entries(saved.saveStates ?? {}).map(([id, s]) => [
            id,
            s === 'saving' ? 'unknown' : s,
          ]),
        ) as Record<string, SaveState>;
        return { ...current, ...saved, saveStates };
      },
    },
  ),
);
