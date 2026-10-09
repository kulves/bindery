import { create } from "zustand";
import type { PdfDoc, SplitMode, ToolId } from "@/lib/pdf";
import type { HighlightMark, PagePicture, SignatureStamp, Stroke, TextBox } from "@/lib/pdf-text";

interface WorkspaceState {
  tool: ToolId;
  docs: PdfDoc[];
  activeId: string | null;
  selected: Record<string, number[]>;
  textBoxes: Record<string, TextBox[]>;
  highlights: Record<string, HighlightMark[]>;
  strokes: Record<string, Stroke[]>;
  stamps: Record<string, SignatureStamp[]>;
  pictures: Record<string, PagePicture[]>;
  splitMode: SplitMode;
  rangeText: string;
  everyN: number;
  outputName: string;
  busy: boolean;
  busyLabel: string;
  past: Record<string, LayerSnap[]>;
  future: Record<string, LayerSnap[]>;
  gesture: string | null;
  gestureSaved: boolean;
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
  addHighlight: (docId: string, mark: HighlightMark) => void;
  patchHighlight: (docId: string, id: string, patch: Partial<HighlightMark>) => void;
  removeHighlight: (docId: string, id: string) => void;
  clearHighlights: (docId: string) => void;
  addStroke: (docId: string, stroke: Stroke) => void;
  undoStroke: (docId: string) => void;
  clearStrokes: (docId: string) => void;
  addStamp: (docId: string, stamp: SignatureStamp) => void;
  patchStamp: (docId: string, id: string, patch: Partial<SignatureStamp>) => void;
  removeStamp: (docId: string, id: string) => void;
  clearStamps: (docId: string) => void;
  addPicture: (docId: string, picture: PagePicture) => void;
  patchPicture: (docId: string, id: string, patch: Partial<PagePicture>) => void;
  removePicture: (docId: string, id: string) => void;
  clearPictures: (docId: string) => void;
  setSplitMode: (mode: SplitMode) => void;
  setRangeText: (value: string) => void;
  setEveryN: (n: number) => void;
  setOutputName: (name: string) => void;
  setBusy: (busy: boolean, label?: string) => void;
  beginGesture: (docId: string) => void;
  endGesture: () => void;
  undo: (docId: string) => void;
  redo: (docId: string) => void;
  reset: () => void;
}

const INITIAL = {
  tool: "merge" as ToolId,
  docs: [] as PdfDoc[],
  activeId: null as string | null,
  selected: {} as Record<string, number[]>,
  textBoxes: {} as Record<string, TextBox[]>,
  highlights: {} as Record<string, HighlightMark[]>,
  strokes: {} as Record<string, Stroke[]>,
  stamps: {} as Record<string, SignatureStamp[]>,
  pictures: {} as Record<string, PagePicture[]>,
  splitMode: "extract" as SplitMode,
  rangeText: "1-3, 4-6",
  everyN: 2,
  outputName: "",
  busy: false,
  busyLabel: "",
  past: {} as Record<string, LayerSnap[]>,
  future: {} as Record<string, LayerSnap[]>,
  gesture: null as string | null,
  gestureSaved: false,
};

type LayerSnap = {
  textBoxes: TextBox[];
  highlights: HighlightMark[];
  strokes: Stroke[];
  stamps: SignatureStamp[];
  pictures: PagePicture[];
};

function readLayers(state: { textBoxes: Record<string, TextBox[]>; highlights: Record<string, HighlightMark[]>; strokes: Record<string, Stroke[]>; stamps: Record<string, SignatureStamp[]>; pictures: Record<string, PagePicture[]> }, docId: string): LayerSnap {
  return {
    textBoxes: state.textBoxes[docId] ?? [],
    highlights: state.highlights[docId] ?? [],
    strokes: state.strokes[docId] ?? [],
    stamps: state.stamps[docId] ?? [],
    pictures: state.pictures[docId] ?? [],
  };
}

function checkpoint<T extends { past: Record<string, LayerSnap[]>; future: Record<string, LayerSnap[]>; gesture: string | null; gestureSaved: boolean; textBoxes: Record<string, TextBox[]>; highlights: Record<string, HighlightMark[]>; strokes: Record<string, Stroke[]>; stamps: Record<string, SignatureStamp[]>; pictures: Record<string, PagePicture[]> }>(state: T, docId: string) {
  if (state.gesture === docId && state.gestureSaved) {
    return { past: state.past, future: state.future };
  }
  const snap = readLayers(state, docId);
  return {
    past: { ...state.past, [docId]: [...(state.past[docId] ?? []).slice(-39), snap] },
    future: { ...state.future, [docId]: [] },
    gestureSaved: state.gesture === docId,
  };
}

function restore<T extends { textBoxes: Record<string, TextBox[]>; highlights: Record<string, HighlightMark[]>; strokes: Record<string, Stroke[]>; stamps: Record<string, SignatureStamp[]>; pictures: Record<string, PagePicture[]> }>(state: T, docId: string, snap: LayerSnap) {
  return {
    textBoxes: { ...state.textBoxes, [docId]: snap.textBoxes },
    highlights: { ...state.highlights, [docId]: snap.highlights },
    strokes: { ...state.strokes, [docId]: snap.strokes },
    stamps: { ...state.stamps, [docId]: snap.stamps },
    pictures: { ...state.pictures, [docId]: snap.pictures },
  };
}

export const useWorkspace = create<WorkspaceState>((set) => ({
  ...INITIAL,
  setTool: (tool) => set({ tool }),
  addDocs: (incoming) =>
    set((state) => {
      const docs = [...state.docs, ...incoming];
      const selected = { ...state.selected };
      const textBoxes = { ...state.textBoxes };
      const highlights = { ...state.highlights };
      const strokes = { ...state.strokes };
      const stamps = { ...state.stamps };
      const pictures = { ...state.pictures };
      for (const doc of incoming) {
        if (!selected[doc.id]) selected[doc.id] = [];
        if (!textBoxes[doc.id]) textBoxes[doc.id] = [];
        if (!highlights[doc.id]) highlights[doc.id] = [];
        if (!strokes[doc.id]) strokes[doc.id] = [];
        if (!stamps[doc.id]) stamps[doc.id] = [];
        if (!pictures[doc.id]) pictures[doc.id] = [];
      }
      return {
        docs,
        selected,
        textBoxes,
        highlights,
        strokes,
        stamps,
        pictures,
        activeId: state.activeId ?? incoming[0]?.id ?? null,
      };
    }),
  removeDoc: (id) =>
    set((state) => {
      const docs = state.docs.filter((d) => d.id !== id);
      const selected = { ...state.selected };
      const textBoxes = { ...state.textBoxes };
      const highlights = { ...state.highlights };
      const strokes = { ...state.strokes };
      const stamps = { ...state.stamps };
      const pictures = { ...state.pictures };
      delete selected[id];
      delete textBoxes[id];
      delete highlights[id];
      delete strokes[id];
      delete stamps[id];
      delete pictures[id];
      return {
        docs,
        selected,
        textBoxes,
        highlights,
        strokes,
        stamps,
        pictures,
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
      ...checkpoint(state, docId),
      textBoxes: { ...state.textBoxes, [docId]: [...(state.textBoxes[docId] ?? []), box] },
    })),
  patchTextBox: (docId, id, patch) =>
    set((state) => ({
      ...checkpoint(state, docId),
      textBoxes: {
        ...state.textBoxes,
        [docId]: (state.textBoxes[docId] ?? []).map((box) => (box.id === id ? { ...box, ...patch } : box)),
      },
    })),
  removeTextBox: (docId, id) =>
    set((state) => ({
      ...checkpoint(state, docId),
      textBoxes: {
        ...state.textBoxes,
        [docId]: (state.textBoxes[docId] ?? []).filter((box) => box.id !== id),
      },
    })),
  clearTextBoxes: (docId) =>
    set((state) => ({
      textBoxes: { ...state.textBoxes, [docId]: [] },
    })),
  addHighlight: (docId, mark) =>
    set((state) => ({
      ...checkpoint(state, docId),
      highlights: { ...state.highlights, [docId]: [...(state.highlights[docId] ?? []), mark] },
    })),
  patchHighlight: (docId, id, patch) =>
    set((state) => ({
      ...checkpoint(state, docId),
      highlights: {
        ...state.highlights,
        [docId]: (state.highlights[docId] ?? []).map((mark) => (mark.id === id ? { ...mark, ...patch } : mark)),
      },
    })),
  removeHighlight: (docId, id) =>
    set((state) => ({
      ...checkpoint(state, docId),
      highlights: {
        ...state.highlights,
        [docId]: (state.highlights[docId] ?? []).filter((mark) => mark.id !== id),
      },
    })),
  clearHighlights: (docId) =>
    set((state) => ({
      highlights: { ...state.highlights, [docId]: [] },
    })),
  addStroke: (docId, stroke) =>
    set((state) => ({
      ...checkpoint(state, docId),
      strokes: { ...state.strokes, [docId]: [...(state.strokes[docId] ?? []), stroke] },
    })),
  undoStroke: (docId) =>
    set((state) => ({
      ...checkpoint(state, docId),
      strokes: { ...state.strokes, [docId]: (state.strokes[docId] ?? []).slice(0, -1) },
    })),
  clearStrokes: (docId) =>
    set((state) => ({
      strokes: { ...state.strokes, [docId]: [] },
    })),
  addStamp: (docId, stamp) =>
    set((state) => ({
      ...checkpoint(state, docId),
      stamps: { ...state.stamps, [docId]: [...(state.stamps[docId] ?? []), stamp] },
    })),
  patchStamp: (docId, id, patch) =>
    set((state) => ({
      ...checkpoint(state, docId),
      stamps: {
        ...state.stamps,
        [docId]: (state.stamps[docId] ?? []).map((stamp) => (stamp.id === id ? { ...stamp, ...patch } : stamp)),
      },
    })),
  removeStamp: (docId, id) =>
    set((state) => ({
      ...checkpoint(state, docId),
      stamps: {
        ...state.stamps,
        [docId]: (state.stamps[docId] ?? []).filter((stamp) => stamp.id !== id),
      },
    })),
  clearStamps: (docId) =>
    set((state) => ({
      stamps: { ...state.stamps, [docId]: [] },
    })),
  addPicture: (docId, picture) =>
    set((state) => ({
      ...checkpoint(state, docId),
      pictures: { ...state.pictures, [docId]: [...(state.pictures[docId] ?? []), picture] },
    })),
  patchPicture: (docId, id, patch) =>
    set((state) => ({
      ...checkpoint(state, docId),
      pictures: {
        ...state.pictures,
        [docId]: (state.pictures[docId] ?? []).map((picture) =>
          picture.id === id ? { ...picture, ...patch } : picture,
        ),
      },
    })),
  removePicture: (docId, id) =>
    set((state) => ({
      ...checkpoint(state, docId),
      pictures: {
        ...state.pictures,
        [docId]: (state.pictures[docId] ?? []).filter((picture) => picture.id !== id),
      },
    })),
  clearPictures: (docId) =>
    set((state) => ({
      pictures: { ...state.pictures, [docId]: [] },
    })),
  setSplitMode: (splitMode) => set({ splitMode }),
  setRangeText: (rangeText) => set({ rangeText }),
  setEveryN: (everyN) => set({ everyN }),
  setOutputName: (outputName) => set({ outputName }),
  setBusy: (busy, busyLabel = "") => set({ busy, busyLabel }),
  beginGesture: (docId) =>
    set((state) => (state.gesture === docId ? state : { gesture: docId, gestureSaved: false })),
  endGesture: () => set({ gesture: null, gestureSaved: false }),
  undo: (docId) =>
    set((state) => {
      const stack = state.past[docId] ?? [];
      const prev = stack[stack.length - 1];
      if (!prev) return { gesture: null, gestureSaved: false };
      const current = readLayers(state, docId);
      return {
        ...restore(state, docId, prev),
        past: { ...state.past, [docId]: stack.slice(0, -1) },
        future: { ...state.future, [docId]: [...(state.future[docId] ?? []), current].slice(-40) },
        gesture: null,
        gestureSaved: false,
      };
    }),
  redo: (docId) =>
    set((state) => {
      const stack = state.future[docId] ?? [];
      const next = stack[stack.length - 1];
      if (!next) return state;
      const current = readLayers(state, docId);
      return {
        ...restore(state, docId, next),
        future: { ...state.future, [docId]: stack.slice(0, -1) },
        past: { ...state.past, [docId]: [...(state.past[docId] ?? []), current].slice(-40) },
        gesture: null,
        gestureSaved: false,
      };
    }),
  reset: () => set({ ...INITIAL }),
}));

export function useActiveDoc() {
  return useWorkspace((s) => s.docs.find((d) => d.id === s.activeId) ?? s.docs[0] ?? null);
}
