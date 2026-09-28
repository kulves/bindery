import { PDFDocument, StandardFonts, rgb, BlendMode, LineCapStyle, type PDFFont } from "pdf-lib";
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
  bold: boolean;
  italic: boolean;
  replace: boolean;
  sourceId?: string;
}

export interface HighlightMark {
  id: string;
  page: number;
  nx: number;
  ny: number;
  nw: number;
  nh: number;
}

export interface Stroke {
  id: string;
  page: number;
  points: Array<{ nx: number; ny: number }>;
  width: number;
}

export interface SignatureStamp {
  id: string;
  page: number;
  nx: number;
  ny: number;
  nw: number;
  nh: number;
  kind: "draw" | "type";
  paths: Array<Array<{ nx: number; ny: number }>>;
  text: string;
  signedAt: string;
  ip: string;
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
const META = rgb(0.43, 0.4, 0.36);
const COVER = rgb(0.98, 0.969, 0.941);
const MARK = rgb(0.91, 0.77, 0.28);
const SIGN_META = 0.32;

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
  const faces = {
    sans: await pdf.embedFont(StandardFonts.Helvetica),
    sansB: await pdf.embedFont(StandardFonts.HelveticaBold),
    sansI: await pdf.embedFont(StandardFonts.HelveticaOblique),
    sansBi: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
    serif: await pdf.embedFont(StandardFonts.TimesRoman),
    serifB: await pdf.embedFont(StandardFonts.TimesRomanBold),
    serifI: await pdf.embedFont(StandardFonts.TimesRomanItalic),
    serifBi: await pdf.embedFont(StandardFonts.TimesRomanBoldItalic),
  };

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
        const font = pickFace(faces, box.font, Boolean(box.bold), Boolean(box.italic));
        const size = Math.max(6, Math.min(72, box.size));
        const lines = wrapText(winAnsi(box.text), font, size, width - 2);

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
          if (baseline < y) break;
          if (line) {
            page.drawText(line, { x, y: baseline, size, font, color: INK });
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

export async function applyHighlights(bytes: Uint8Array, marks: HighlightMark[]): Promise<Uint8Array> {
  if (marks.length === 0) return bytes;
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(bytes.byteLength);
  data.set(bytes);
  const js = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise;
  const pdf = await PDFDocument.load(bytes);

  try {
    const byPage = new Map<number, HighlightMark[]>();
    for (const mark of marks) {
      const list = byPage.get(mark.page) ?? [];
      list.push(mark);
      byPage.set(mark.page, list);
    }

    for (const [pageIndex, pageMarks] of byPage) {
      const page = pdf.getPages()[pageIndex];
      const jsPage = await js.getPage(pageIndex + 1);
      if (!page || !jsPage) continue;
      const viewport = jsPage.getViewport({ scale: 1 });

      for (const mark of pageMarks) {
        const rect = visualToPdf(viewport, mark);
        page.drawRectangle({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          color: MARK,
          opacity: 0.42,
          blendMode: BlendMode.Multiply,
        });
      }
      jsPage.cleanup();
    }
  } finally {
    await js.destroy();
  }

  return pdf.save();
}

export async function applyStrokes(bytes: Uint8Array, strokes: Stroke[]): Promise<Uint8Array> {
  const pending = strokes.filter((stroke) => stroke.points.length > 0);
  if (pending.length === 0) return bytes;
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(bytes.byteLength);
  data.set(bytes);
  const js = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise;
  const pdf = await PDFDocument.load(bytes);

  try {
    const byPage = new Map<number, Stroke[]>();
    for (const stroke of pending) {
      const list = byPage.get(stroke.page) ?? [];
      list.push(stroke);
      byPage.set(stroke.page, list);
    }

    for (const [pageIndex, pageStrokes] of byPage) {
      const page = pdf.getPages()[pageIndex];
      const jsPage = await js.getPage(pageIndex + 1);
      if (!page || !jsPage) continue;
      const viewport = jsPage.getViewport({ scale: 1 });

      for (const stroke of pageStrokes) {
        const pts = stroke.points.map((point) => visualPointToPdf(viewport, point.nx, point.ny));
        if (pts.length === 1 && pts[0]) {
          pts.push({ x: pts[0].x + 0.4, y: pts[0].y });
        }
        const start = pts[0];
        if (!start) continue;
        const path = pts
          .map((pt, index) => `${index === 0 ? "M" : "L"} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`)
          .join(" ");
        page.drawSvgPath(path, {
          borderColor: INK,
          borderWidth: Math.max(1, stroke.width),
          borderOpacity: 1,
          borderLineCap: LineCapStyle.Round,
        });
      }
      jsPage.cleanup();
    }
  } finally {
    await js.destroy();
  }

  return pdf.save();
}

export async function applySignatures(bytes: Uint8Array, stamps: SignatureStamp[]): Promise<Uint8Array> {
  const pending = stamps.filter((stamp) =>
    stamp.kind === "type" ? stamp.text.trim().length > 0 : stamp.paths.some((path) => path.length > 0),
  );
  if (pending.length === 0) return bytes;
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(bytes.byteLength);
  data.set(bytes);
  const js = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise;
  const pdf = await PDFDocument.load(bytes);
  const script = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const label = await pdf.embedFont(StandardFonts.Helvetica);

  try {
    const byPage = new Map<number, SignatureStamp[]>();
    for (const stamp of pending) {
      const list = byPage.get(stamp.page) ?? [];
      list.push(stamp);
      byPage.set(stamp.page, list);
    }

    for (const [pageIndex, pageStamps] of byPage) {
      const page = pdf.getPages()[pageIndex];
      const jsPage = await js.getPage(pageIndex + 1);
      if (!page || !jsPage) continue;
      const viewport = jsPage.getViewport({ scale: 1 });

      for (const stamp of pageStamps) {
        const rect = visualToPdf(viewport, stamp);
        const band = rect.height * SIGN_META;
        const inkH = Math.max(8, rect.height - band);
        if (stamp.kind === "type") {
          const text = winAnsi(stamp.text.trim());
          let size = Math.max(10, inkH * 0.55);
          while (size > 8 && script.widthOfTextAtSize(text, size) > rect.width - 4) size -= 0.5;
          const width = script.widthOfTextAtSize(text, size);
          page.drawText(text, {
            x: rect.x + Math.max(0, (rect.width - width) / 2),
            y: rect.y + band + Math.max(2, (inkH - size) * 0.35),
            size,
            font: script,
            color: INK,
          });
        } else {
          const weight = Math.max(1.2, Math.min(4, inkH * 0.08));
          const scale = 1 - SIGN_META;
          for (const path of stamp.paths) {
            if (path.length === 0) continue;
            const pts = path.map((point) =>
              visualPointToPdf(viewport, stamp.nx + point.nx * stamp.nw, stamp.ny + point.ny * stamp.nh * scale),
            );
            if (pts.length === 1 && pts[0]) pts.push({ x: pts[0].x + 0.4, y: pts[0].y });
            const d = pts
              .map((pt, index) => `${index === 0 ? "M" : "L"} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`)
              .join(" ");
            page.drawSvgPath(d, {
              borderColor: INK,
              borderWidth: weight,
              borderOpacity: 1,
              borderLineCap: LineCapStyle.Round,
            });
          }
        }
        const metaSize = Math.max(6, Math.min(8, rect.width * 0.04));
        const lines = signMetaLines(stamp);
        lines.forEach((line, index) => {
          page.drawText(winAnsi(line), {
            x: rect.x + 2,
            y: rect.y + 3 + (lines.length - 1 - index) * (metaSize + 1.5),
            size: metaSize,
            font: label,
            color: META,
          });
        });
      }
      jsPage.cleanup();
    }
  } finally {
    await js.destroy();
  }

  return pdf.save();
}

function visualPointToPdf(
  viewport: { width: number; height: number; convertToPdfPoint: (x: number, y: number) => unknown[] },
  nx: number,
  ny: number,
) {
  const point = viewport.convertToPdfPoint(nx * viewport.width, ny * viewport.height);
  return { x: Number(point[0]), y: Number(point[1]) };
}

function visualToPdf(
  viewport: { width: number; height: number; convertToPdfPoint: (x: number, y: number) => unknown[] },
  box: { nx: number; ny: number; nw: number; nh: number },
) {
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
  return {
    x,
    y,
    width: Math.max(4, Math.max(...xs) - x),
    height: Math.max(4, Math.max(...ys) - y),
  };
}

function pickFace(
  faces: {
    sans: PDFFont;
    sansB: PDFFont;
    sansI: PDFFont;
    sansBi: PDFFont;
    serif: PDFFont;
    serifB: PDFFont;
    serifI: PDFFont;
    serifBi: PDFFont;
  },
  font: TextFont,
  bold: boolean,
  italic: boolean,
) {
  if (font === "serif") {
    if (bold && italic) return faces.serifBi;
    if (bold) return faces.serifB;
    if (italic) return faces.serifI;
    return faces.serif;
  }
  if (bold && italic) return faces.sansBi;
  if (bold) return faces.sansB;
  if (italic) return faces.sansI;
  return faces.sans;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const width = Math.max(8, maxWidth);
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) {
        line = next;
        continue;
      }
      if (line) out.push(line);
      if (font.widthOfTextAtSize(word, size) <= width) {
        line = word;
        continue;
      }
      let chunk = "";
      for (const ch of word) {
        const trial = chunk + ch;
        if (font.widthOfTextAtSize(trial, size) <= width) {
          chunk = trial;
        } else {
          if (chunk) out.push(chunk);
          chunk = ch;
        }
      }
      line = chunk;
    }
    if (line) out.push(line);
  }
  return out;
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

export function formatSignTime(iso = new Date().toISOString()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export function signMetaLines(stamp: Pick<SignatureStamp, "signedAt" | "ip">) {
  const when = formatSignTime(stamp.signedAt);
  const ip = stamp.ip?.trim() ? `IP ${stamp.ip.trim()}` : "IP unavailable";
  return when ? [when, ip] : [ip];
}

export async function fetchPublicIp(): Promise<string> {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), 4000);
  try {
    const res = await fetch("https://api.ipify.org?format=json", { signal: control.signal });
    if (!res.ok) return "";
    const data = (await res.json()) as { ip?: unknown };
    return typeof data.ip === "string" ? data.ip : "";
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}
