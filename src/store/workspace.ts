import { create } from "zustand";
import type { PdfDoc, SplitMode, ToolId } from "@/lib/pdf";
import type { TextBox } from "@/lib/pdf-text";

interface WorkspaceState {
  tool: ToolId;
  docs: PdfDoc[];
  activeId: string | null;
  selected: Record<string, number[]>;
  textBoxes: Record<string, TextBox[]>;
  splitMode: SplitMode;
  rangeText: string;
  everyN: number;
  outputName: string;
  busy: boolean;
  busyLabel: string;
  setTool: (tool: ToolId) => void;
  addDocs: (docs: PdfDoc[]) => void;
  removeDoc: (id: string) => void;
  moveDoc: (id: string, dir: -1 | 1) => void;
  reorderDoc: (fromId: string, toId: string) => void;
  setActive: (id: string) => void;
  setThumb: (id: string, index: number, url: string) => void;
  setRendering: (id: string, rendering: boolean) => void;
  replaceDoc: (id: string, patch: Partial<PdfDoc>) => void;
  togglePage: (id: string, page: number, rangeFrom?: number | null) => void;
  selectAll: (id: string) => void;
  clearSelected: (id: string) => void;
  addTextBox: (docId: string, box: TextBox) => void;
  patchTextBox: (docId: string, id: string, patch: Partial<TextBox>) => void;
  removeTextBox: (docId: string, id: string) => void;
  clearTextBoxes: (docId: string) => void;
  setSplitMode: (mode: SplitMode) => void;
  setRangeText: (value: string) => void;
  setEveryN: (n: number) => void;
  setOutputName: (name: string) => void;
  setBusy: (busy: boolean, label?: string) => void;
  reset: () => void;
}

const INITIAL = {
  tool: "merge" as ToolId,
  docs: [] as PdfDoc[],
  activeId: null as string | null,
  selected: {} as Record<string, number[]>,
  textBoxes: {} as Record<string, TextBox[]>,
  splitMode: "extract" as SplitMode,
  rangeText: "1-3, 4-6",
  everyN: 2,
  outputName: "",
  busy: false,
  busyLabel: "",
};

export const useWorkspace = create<WorkspaceState>((set) => ({
  ...INITIAL,
  setTool: (tool) => set({ tool }),
  addDocs: (incoming) =>
    set((state) => {
      const docs = [...state.docs, ...incoming];
      const selected = { ...state.selected };
      const textBoxes = { ...state.textBoxes };
      for (const doc of incoming) {
        if (!selected[doc.id]) selected[doc.id] = [];
        if (!textBoxes[doc.id]) textBoxes[doc.id] = [];
      }
      return {
        docs,
        selected,
        textBoxes,
        activeId: state.activeId ?? incoming[0]?.id ?? null,
      };
    }),
  removeDoc: (id) =>
    set((state) => {
      const docs = state.docs.filter((d) => d.id !== id);
      const selected = { ...state.selected };
      const textBoxes = { ...state.textBoxes };
      delete selected[id];
      delete textBoxes[id];
      return {
        docs,
        selected,
        textBoxes,
        activeId: state.activeId === id ? (docs[0]?.id ?? null) : state.activeId,
      };
    }),
  moveDoc: (id, dir) =>
    set((state) => {
      const index = state.docs.findIndex((d) => d.id === id);
      if (index < 0) return state;
      const next = index + dir;
      if (next < 0 || next >= state.docs.length) return state;
      const docs = [...state.docs];
      const [item] = docs.splice(index, 1);
      docs.splice(next, 0, item);
      return { docs };
    }),
  reorderDoc: (fromId, toId) =>
    set((state) => {
      if (fromId === toId) return state;
      const from = state.docs.findIndex((d) => d.id === fromId);
      const to = state.docs.findIndex((d) => d.id === toId);
      if (from < 0 || to < 0) return state;
      const docs = [...state.docs];
      const [item] = docs.splice(from, 1);
      docs.splice(to, 0, item);
      return { docs };
    }),
  setActive: (id) => set({ activeId: id }),
  setThumb: (id, index, url) =>
    set((state) => ({
      docs: state.docs.map((doc) => {
        if (doc.id !== id) return doc;
        const thumbs = doc.thumbs.slice();
        thumbs[index] = url;
        return { ...doc, thumbs };
      }),
    })),
  setRendering: (id, rendering) =>
    set((state) => ({
      docs: state.docs.map((doc) => (doc.id === id ? { ...doc, rendering } : doc)),
    })),
  replaceDoc: (id, patch) =>
    set((state) => ({
      docs: state.docs.map((doc) => (doc.id === id ? { ...doc, ...patch } : doc)),
      selected:
        patch.pageCount !== undefined
          ? {
              ...state.selected,
              [id]: (state.selected[id] ?? []).filter((page) => page < (patch.pageCount ?? 0)),
            }
          : state.selected,
    })),
  togglePage: (id, page, rangeFrom) =>
    set((state) => {
      const current = new Set(state.selected[id] ?? []);
      if (rangeFrom != null && rangeFrom !== page) {
        const start = Math.min(rangeFrom, page);
        const end = Math.max(rangeFrom, page);
        for (let i = start; i <= end; i++) current.add(i);
      } else if (current.has(page)) {
        current.delete(page);
      } else {
        current.add(page);
      }
      return { selected: { ...state.selected, [id]: [...current].sort((a, b) => a - b) } };
    }),
  selectAll: (id) =>
    set((state) => {
      const doc = state.docs.find((d) => d.id === id);
      if (!doc) return state;
      return {
        selected: {
          ...state.selected,
          [id]: Array.from({ length: doc.pageCount }, (_, i) => i),
        },
      };
    }),
  clearSelected: (id) => set((state) => ({ selected: { ...state.selected, [id]: [] } })),
  addTextBox: (docId, box) =>
    set((state) => ({
      textBoxes: { ...state.textBoxes, [docId]: [...(state.textBoxes[docId] ?? []), box] },
    })),
  patchTextBox: (docId, id, patch) =>
    set((state) => ({
      textBoxes: {
        ...state.textBoxes,
        [docId]: (state.textBoxes[docId] ?? []).map((box) => (box.id === id ? { ...box, ...patch } : box)),
      },
    })),
  removeTextBox: (docId, id) =>
    set((state) => ({
      textBoxes: {
        ...state.textBoxes,
        [docId]: (state.textBoxes[docId] ?? []).filter((box) => box.id !== id),
      },
    })),
  clearTextBoxes: (docId) =>
    set((state) => ({
      textBoxes: { ...state.textBoxes, [docId]: [] },
    })),
  setSplitMode: (splitMode) => set({ splitMode }),
  setRangeText: (rangeText) => set({ rangeText }),
  setEveryN: (everyN) => set({ everyN }),
  setOutputName: (outputName) => set({ outputName }),
  setBusy: (busy, busyLabel = "") => set({ busy, busyLabel }),
  reset: () => set({ ...INITIAL }),
}));

export function useActiveDoc() {
  return useWorkspace((s) => s.docs.find((d) => d.id === s.activeId) ?? s.docs[0] ?? null);
}
