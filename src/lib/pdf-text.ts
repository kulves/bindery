import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { loadPdfjs } from "@/lib/pdf-render";

export type TextFont = "sans" | "serif";

export interface TextBox {
  id: string;
  page: number;
  nx: number;
  ny: number;
  nw: number;
  nh: number;
  text: string;
  size: number;
  font: TextFont;
  replace: boolean;
  sourceId?: string;
}

export interface TextLine {
  id: string;
  str: string;
  nx: number;
  ny: number;
  nw: number;
  nh: number;
  size: number;
}

const INK = rgb(0.11, 0.1, 0.09);
const COVER = rgb(0.98, 0.969, 0.941);

const WINANSI: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201C": '"',
  "\u201D": '"',
  "\u2013": "-",
  "\u2014": "-",
  "\u2026": "...",
  "\u00A0": " ",
};

export function winAnsi(text: string) {
  let out = "";
  for (const ch of text) {
    if (WINANSI[ch]) {
      out += WINANSI[ch];
      continue;
    }
    out += ch.charCodeAt(0) <= 255 ? ch : "?";
  }
  return out;
}

export async function extractPageLines(bytes: Uint8Array, pageIndex: number): Promise<TextLine[]> {
  if (typeof window === "undefined") return [];
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(bytes.byteLength);
  data.set(bytes);
  const pdf = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise;
  try {
    const page = await pdf.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const runs: TextLine[] = [];
    for (const [index, raw] of content.items.entries()) {
      if (!("str" in raw) || typeof raw.str !== "string" || !raw.str.trim()) continue;
      const tr = raw.transform as number[];
      const size = Math.max(6, Math.hypot(tr[0] ?? 0, tr[1] ?? 0));
      const x = tr[4] ?? 0;
      const y = tr[5] ?? 0;
      const width = typeof raw.width === "number" && raw.width > 0 ? raw.width : size * raw.str.length * 0.5;
      const [x0, y0] = viewport.convertToViewportPoint(x, y);
      const [x1, y1] = viewport.convertToViewportPoint(x + width, y + size);
      const left = Math.min(x0, x1) / viewport.width;
      const top = Math.min(y0, y1) / viewport.height;
      const nw = Math.abs(x1 - x0) / viewport.width;
      const nh = Math.abs(y1 - y0) / viewport.height;
      runs.push({
        id: `run-${index}`,
        str: raw.str,
        nx: clamp01(left),
        ny: clamp01(top),
        nw: Math.max(0.01, nw),
        nh: Math.max(0.008, nh),
        size,
      });
    }
    page.cleanup();
    return clusterLines(runs);
  } finally {
    await pdf.destroy();
  }
}

function clusterLines(items: TextLine[]): TextLine[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => a.ny - b.ny || a.nx - b.nx);
  const groups: TextLine[][] = [];
  for (const item of sorted) {
    const last = groups[groups.length - 1];
    const seed = last?.[0];
    if (last && seed && Math.abs(item.ny - seed.ny) < Math.max(item.nh, seed.nh) * 0.55) {
      last.push(item);
    } else {
      groups.push([item]);
    }
  }
  return groups.map((group, index) => {
    const parts = [...group].sort((a, b) => a.nx - b.nx);
    let str = parts[0]?.str ?? "";
    for (let i = 1; i < parts.length; i++) {
      const prev = parts[i - 1];
      const next = parts[i];
      if (!prev || !next) continue;
      const gap = next.nx - (prev.nx + prev.nw);
      str += gap > Math.max(prev.nh, next.nh) * 0.18 ? " " : "";
      str += next.str;
    }
    const nx = Math.min(...parts.map((p) => p.nx));
    const ny = Math.min(...parts.map((p) => p.ny));
    const right = Math.max(...parts.map((p) => p.nx + p.nw));
    const bottom = Math.max(...parts.map((p) => p.ny + p.nh));
    const size = parts.reduce((sum, p) => sum + p.size, 0) / parts.length;
    return {
      id: `line-${index}`,
      str: str.replace(/\s+/g, " ").trim(),
      nx,
      ny,
      nw: Math.max(0.02, right - nx),
      nh: Math.max(0.01, bottom - ny),
      size,
    };
  });
}

export async function applyTextBoxes(bytes: Uint8Array, boxes: TextBox[]): Promise<Uint8Array> {
  const pending = boxes.filter((box) => box.replace || box.text.trim().length > 0);
  if (pending.length === 0) return bytes;

  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(bytes.byteLength);
  data.set(bytes);
  const js = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise;
  const pdf = await PDFDocument.load(bytes);
  const helvetica = await pdf.embedFont(StandardFonts.Helvetica);
  const times = await pdf.embedFont(StandardFonts.TimesRoman);

  try {
    const byPage = new Map<number, TextBox[]>();
    for (const box of pending) {
      const list = byPage.get(box.page) ?? [];
      list.push(box);
      byPage.set(box.page, list);
    }

    for (const [pageIndex, pageBoxes] of byPage) {
      const page = pdf.getPages()[pageIndex];
      const jsPage = await js.getPage(pageIndex + 1);
      if (!page || !jsPage) continue;
      const viewport = jsPage.getViewport({ scale: 1 });

      for (const box of pageBoxes) {
        const corners = [
          [box.nx, box.ny],
          [box.nx + box.nw, box.ny],
          [box.nx, box.ny + box.nh],
          [box.nx + box.nw, box.ny + box.nh],
        ].map(([nx, ny]) => {
          const point = viewport.convertToPdfPoint(nx * viewport.width, ny * viewport.height);
          return [Number(point[0]), Number(point[1])] as const;
        });
        const xs = corners.map((c) => c[0]);
        const ys = corners.map((c) => c[1]);
        const x = Math.min(...xs);
        const y = Math.min(...ys);
        const width = Math.max(8, Math.max(...xs) - x);
        const height = Math.max(box.size, Math.max(...ys) - y);
        const font = box.font === "serif" ? times : helvetica;
        const lines = winAnsi(box.text).split("\n");
        const size = Math.max(6, Math.min(72, box.size));

        if (box.replace) {
          page.drawRectangle({
            x: x - 1,
            y: y - 1,
            width: width + 2,
            height: height + 2,
            color: COVER,
          });
        }

        let baseline = y + height - size;
        for (const line of lines) {
          const drawn = line.trimEnd();
          if (drawn) {
            page.drawText(drawn, { x, y: baseline, size, font, color: INK });
          }
          baseline -= size * 1.25;
        }
      }
      jsPage.cleanup();
    }
  } finally {
    await js.destroy();
  }

  return pdf.save();
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}
