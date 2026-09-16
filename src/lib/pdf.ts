import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import JSZip from "jszip";

export type ToolId = "merge" | "split" | "edit";
export type SplitMode = "extract" | "ranges" | "every" | "each";

export interface PdfDoc {
  id: string;
  name: string;
  filename: string;
  bytes: Uint8Array;
  pageCount: number;
  thumbs: Array<string | undefined>;
  rendering: boolean;
}

function isPdfHeader(bytes: Uint8Array) {
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

export function safeFilename(name: string) {
  const trimmed = name.replace(/[^\w.\- ]+/g, " ").replace(/\s+/g, " ").trim();
  return trimmed || "document";
}

export function bytesToBlob(bytes: Uint8Array, mime: string) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy], { type: mime });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function downloadBytes(bytes: Uint8Array, filename: string, mime = "application/pdf") {
  downloadBlob(bytesToBlob(bytes, mime), filename);
}

export async function loadPdfFile(file: File): Promise<PdfDoc> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (!isPdfHeader(bytes)) {
    throw new Error("Not a PDF");
  }
  const pdf = await PDFDocument.load(bytes);
  const pageCount = pdf.getPageCount();
  if (pageCount < 1) {
    throw new Error("Empty PDF");
  }
  const base = file.name.replace(/\.pdf$/i, "");
  return {
    id: crypto.randomUUID(),
    name: base || "Untitled",
    filename: file.name.toLowerCase().endsWith(".pdf") ? file.name : `${file.name}.pdf`,
    bytes,
    pageCount,
    thumbs: Array.from({ length: pageCount }),
    rendering: true,
  };
}

export async function loadPdfBytes(bytes: Uint8Array, filename: string): Promise<PdfDoc> {
  const pdf = await PDFDocument.load(bytes);
  const pageCount = pdf.getPageCount();
  const name = filename.replace(/\.pdf$/i, "") || "Untitled";
  return {
    id: crypto.randomUUID(),
    name,
    filename: filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`,
    bytes,
    pageCount,
    thumbs: Array.from({ length: pageCount }),
    rendering: true,
  };
}

export async function mergeDocuments(docs: Array<{ bytes: Uint8Array }>): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const doc of docs) {
    const src = await PDFDocument.load(doc.bytes);
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const page of pages) out.addPage(page);
  }
  return out.save();
}

export async function extractPages(bytes: Uint8Array, indices: number[]): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, indices);
  for (const page of pages) out.addPage(page);
  return out.save();
}

export async function splitEvery(bytes: Uint8Array, n: number): Promise<Uint8Array[]> {
  const size = Math.max(1, Math.floor(n));
  const src = await PDFDocument.load(bytes);
  const count = src.getPageCount();
  const parts: Uint8Array[] = [];
  for (let i = 0; i < count; i += size) {
    const indices = Array.from({ length: Math.min(size, count - i) }, (_, k) => i + k);
    const out = await PDFDocument.create();
    const pages = await out.copyPages(src, indices);
    for (const page of pages) out.addPage(page);
    parts.push(await out.save());
  }
  return parts;
}

export async function rotatePage(bytes: Uint8Array, index: number, delta = 90): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes);
  const page = src.getPages()[index];
  if (!page) return bytes;
  const current = page.getRotation().angle;
  page.setRotation(degrees((((current + delta) % 360) + 360) % 360));
  return src.save();
}

export async function removePages(bytes: Uint8Array, indices: number[]): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes);
  const drop = new Set(indices);
  const keep = src.getPageIndices().filter((i) => !drop.has(i));
  if (keep.length === 0) {
    throw new Error("A PDF needs at least one page");
  }
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, keep);
  for (const page of pages) out.addPage(page);
  return out.save();
}

export async function reorderPages(bytes: Uint8Array, order: number[]): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, order);
  for (const page of pages) out.addPage(page);
  return out.save();
}

export function parseRangeGroups(
  input: string,
  pageCount: number,
): { groups: number[][]; error?: string } {
  const trimmed = input.trim();
  if (!trimmed) return { groups: [], error: "Enter a page range" };

  const parts = trimmed.split(/[,;]+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { groups: [], error: "Enter a page range" };

  const groups: number[][] = [];
  for (const part of parts) {
    const m = /^(\d+)(?:\s*[-–—]\s*(\d+))?$/.exec(part);
    if (!m) return { groups: [], error: `Cannot read “${part}”` };
    let start = Number(m[1]);
    let end = m[2] ? Number(m[2]) : start;
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      return { groups: [], error: `Cannot read “${part}”` };
    }
    if (start < 1 || end < 1) return { groups: [], error: "Pages start at 1" };
    if (start > pageCount || end > pageCount) {
      return { groups: [], error: `This file has ${pageCount} pages` };
    }
    if (start > end) [start, end] = [end, start];
    const pages: number[] = [];
    for (let i = start; i <= end; i++) pages.push(i);
    groups.push(pages);
  }
  return { groups };
}

export async function getPageCount(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes);
  return pdf.getPageCount();
}

export async function zipPdfs(files: Array<{ name: string; bytes: Uint8Array }>): Promise<Blob> {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.name, file.bytes);
  }
  return zip.generateAsync({ type: "blob" });
}

type SampleKind = "report" | "appendix";

const REPORT_PAGES = [
  { kicker: "Q3 · Internal", title: "Quarterly report", folio: "Cover" },
  { kicker: "01", title: "Contents", folio: "i" },
  { kicker: "02", title: "Highlights", folio: "1" },
  { kicker: "03", title: "Revenue", folio: "2" },
  { kicker: "04", title: "Outlook", folio: "3" },
  { kicker: "05", title: "Notes", folio: "4" },
];

const APPENDIX_PAGES = [
  { kicker: "A", title: "Appendix", folio: "A-1" },
  { kicker: "B", title: "Figures", folio: "A-2" },
  { kicker: "C", title: "Sources", folio: "A-3" },
];

export async function createSampleDocument(kind: SampleKind): Promise<PdfDoc> {
  const pages = kind === "report" ? REPORT_PAGES : APPENDIX_PAGES;
  const filename = kind === "report" ? "Quarterly Report.pdf" : "Appendix.pdf";
  const bytes = await drawSample(kind === "report" ? "Northwind Press" : "Northwind Press", pages);
  return loadPdfBytes(bytes, filename);
}

async function drawSample(
  press: string,
  pages: Array<{ kicker: string; title: string; folio: string }>,
) {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.TimesRoman);
  const italic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const ink = rgb(0.11, 0.1, 0.09);
  const paper = rgb(0.96, 0.94, 0.9);
  const rule = rgb(0.78, 0.74, 0.68);
  const band = rgb(0.11, 0.1, 0.09);
  const bandText = rgb(0.96, 0.94, 0.9);

  for (const [index, spec] of pages.entries()) {
    const page = doc.addPage([612, 792]);
    page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: paper });
    page.drawRectangle({ x: 0, y: 732, width: 612, height: 60, color: band });
    page.drawText(press.toUpperCase(), {
      x: 54,
      y: 756,
      size: 10,
      font: italic,
      color: bandText,
    });
    page.drawText(`${index + 1} / ${pages.length}`, {
      x: 520,
      y: 756,
      size: 10,
      font: regular,
      color: bandText,
    });

    page.drawText(spec.kicker, {
      x: 54,
      y: 660,
      size: 11,
      font: italic,
      color: ink,
    });
    page.drawText(spec.title, {
      x: 54,
      y: 612,
      size: 32,
      font: regular,
      color: ink,
    });
    page.drawLine({
      start: { x: 54, y: 592 },
      end: { x: 240, y: 592 },
      thickness: 0.75,
      color: ink,
    });

    let y = 540;
    const widths = [420, 390, 440, 360, 410, 300, 430, 370, 400, 280];
    for (const width of widths) {
      page.drawRectangle({
        x: 54,
        y,
        width,
        height: 9,
        color: rule,
      });
      y -= 22;
    }

    page.drawLine({
      start: { x: 54, y: 54 },
      end: { x: 558, y: 54 },
      thickness: 0.5,
      color: rule,
    });
    page.drawText(spec.folio, {
      x: 54,
      y: 32,
      size: 11,
      font: regular,
      color: ink,
    });
    page.drawText("Sample for Bindery — not a live document", {
      x: 330,
      y: 32,
      size: 9,
      font: italic,
      color: ink,
    });
  }

  return doc.save();
}
