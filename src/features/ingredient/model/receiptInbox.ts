import { create } from 'zustand';

interface ReceiptInboxState {
  files: File[];
  put: (files: File[]) => void;
  take: () => File[];
}

/**
 * @description 시안 v6: 식비 탭 + 시트에서 고른 영수증 사진을 장보기 담기 화면으로 넘기는 우편함.
 * 사진 고르기 창은 + 시트의 행을 누른 그 순간에 열려야 해서(브라우저는 사용자 누름 안에서만 연다) 식비 탭이 열고,
 * 읽기는 담기 화면이 맡는다. File은 화면 파라미터(주소·기록)에 실을 수 없어 메모리에만 둔다.
 */
const useReceiptInbox = create<ReceiptInboxState>((set, get) => ({
  files: [],
  put(files) {
    set((state) => ({ files: [...state.files, ...files] }));
  },
  take() {
    const { files } = get();
    set({ files: [] });
    return files;
  },
}));

/** 고른 영수증 사진을 담기 화면이 읽도록 넘긴다. */
export function queueReceiptFiles(files: File[]) {
  useReceiptInbox.getState().put(files);
}

export { useReceiptInbox };
