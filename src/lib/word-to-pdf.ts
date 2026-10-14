import JSZip from "jszip";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const LETTER_W = 612;
const LETTER_H = 792;

type Align = "left" | "center" | "right";

type StyledRun = {
  text: string;
  bold: boolean;
  italic: boolean;
  size: number;
};

type ParagraphBlock = {
  kind: "p";
  align: Align;
  indent: number;
  gapBefore: number;
  runs: StyledRun[];
};

type TableBlock = {
  kind: "table";
  rows: string[][];
};

type ImageBlock = {
  kind: "image";
  bytes: Uint8Array;
  kindImage: "png" | "jpg";
  width: number;
  height: number;
};

type Block = ParagraphBlock | TableBlock | ImageBlock;

function localChildren(el: Element, name: string) {
  return [...el.children].filter((child) => child.localName === name);
}

function firstChild(el: Element, name: string) {
  return localChildren(el, name)[0] ?? null;
}

function attr(el: Element | null, name: string) {
  if (!el) return "";
  return el.getAttribute(name) || el.getAttributeNS(el.namespaceURI, name) || "";
}

function flag(el: Element | null, name: string) {
  const node = el ? firstChild(el, name) : null;
  if (!node) return false;
  const value = attr(node, "val").toLowerCase();
  return value !== "0" && value !== "false" && value !== "off";
}

function twips(value: string, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n / 20;
}

function emuToPt(value: string) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return (n * 72) / 914400;
}

function isWordName(name: string) {
  return /\.docx?$/i.test(name);
}

export function isWordFile(file: File) {
  return isWordName(file.name);
}

function cleanChar(font: PDFFont, char: string, size: number, bad: Set<string>) {
  if (bad.has(char)) return "";
  try {
    font.widthOfTextAtSize(char, size);
    return char;
  } catch {
    bad.add(char);
    return "";
  }
}

function cleanText(font: PDFFont, text: string, size: number, bad: Set<string>) {
  const mapped = text
    .replace(/\u00a0/g, " ")
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u2022/g, "-");
  let out = "";
  for (const char of mapped) out += cleanChar(font, char, size, bad);
  return out;
}

function headingSize(style: string) {
  const name = style.toLowerCase();
  if (name.includes("heading1") || name === "title") return 20;
  if (name.includes("heading2")) return 16;
  if (name.includes("heading3")) return 13;
  return 0;
}

function parseRels(xml: string) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const map = new Map<string, string>();
  for (const node of doc.getElementsByTagName("*")) {
    if (node.localName !== "Relationship") continue;
    const id = node.getAttribute("Id");
    const target = node.getAttribute("Target");
    if (id && target) map.set(id, target);
  }
  return map;
}

function imageKind(bytes: Uint8Array): "png" | "jpg" | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50) return "png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  return null;
}

function runStyle(run: Element, fallbackSize: number) {
  const props = firstChild(run, "rPr");
  const sizeRaw = props ? attr(firstChild(props, "sz"), "val") : "";
  const size = sizeRaw ? Math.min(28, Math.max(8, Number(sizeRaw) / 2)) : fallbackSize;
  return {
    bold: flag(props, "b") || flag(props, "bCs"),
    italic: flag(props, "i") || flag(props, "iCs"),
    size: Number.isFinite(size) ? size : fallbackSize,
  };
}

function textOf(node: Element) {
  let text = "";
  for (const child of node.getElementsByTagName("*")) {
    if (child.parentElement !== node) continue;
    if (child.localName === "t") text += child.textContent ?? "";
    if (child.localName === "tab") text += "    ";
    if (child.localName === "br") text += "\n";
  }
  return text;
}

function blipId(run: Element) {
  for (const node of run.getElementsByTagName("*")) {
    if (node.localName !== "blip") continue;
    return (
      node.getAttribute("r:embed") ||
      node.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "embed") ||
      ""
    );
  }
  return "";
}

function extentOf(run: Element) {
  for (const node of run.getElementsByTagName("*")) {
    if (node.localName !== "extent") continue;
    return { width: emuToPt(node.getAttribute("cx") || ""), height: emuToPt(node.getAttribute("cy") || "") };
  }
  return { width: 0, height: 0 };
}

async function readImage(zip: JSZip, rels: Map<string, string>, id: string, extent: { width: number; height: number }) {
  const target = rels.get(id);
  if (!target) return null;
  const path = target.startsWith("/") ? target.slice(1) : `word/${target.replace(/^\.\//, "")}`;
  const file = zip.file(path) || zip.file(target.replace(/^\//, ""));
  if (!file) return null;
  const bytes = new Uint8Array(await file.async("uint8array"));
  const kindImage = imageKind(bytes);
  if (!kindImage) return null;
  return {
    kind: "image" as const,
    bytes,
    kindImage,
    width: extent.width || 240,
    height: extent.height || 180,
  };
}

function paragraphFrom(p: Element, fallbackSize: number): ParagraphBlock | null {
  const props = firstChild(p, "pPr");
  const style = props ? attr(firstChild(props, "pStyle"), "val") : "";
  const styled = headingSize(style);
  const size = styled || fallbackSize;
  const alignRaw = props ? attr(firstChild(props, "jc"), "val") : "left";
  const align: Align = alignRaw === "center" || alignRaw === "right" ? alignRaw : "left";
  const num = props ? firstChild(props, "numPr") : null;
  const level = num ? Number(attr(firstChild(num, "ilvl"), "val") || "0") : 0;
  const runs: StyledRun[] = [];
  if (num) runs.push({ text: "- ", bold: false, italic: false, size });

  for (const node of p.children) {
    const runsIn = node.localName === "hyperlink" ? [...node.children] : [node];
    for (const run of runsIn) {
      if (run.localName !== "r") continue;
      if ([...run.getElementsByTagName("*")].some((item) => item.localName === "drawing")) continue;
      const text = textOf(run);
      if (!text) continue;
      const look = runStyle(run, size);
      runs.push({ text, bold: look.bold || styled > 0, italic: look.italic, size: look.size });
    }
  }
  if (runs.every((run) => !run.text.trim())) return null;
  return {
    kind: "p",
    align,
    indent: num ? 12 + Math.max(0, level) * 14 : 0,
    gapBefore: styled ? 10 : 6,
    runs,
  };
}

async function blocksFromBody(body: Element, zip: JSZip, rels: Map<string, string>) {
  const blocks: Block[] = [];
  for (const node of body.children) {
    if (node.localName === "p") {
      const images: ImageBlock[] = [];
      for (const run of node.getElementsByTagName("*")) {
        if (run.localName !== "r" || run.parentElement !== node && run.parentElement?.localName !== "hyperlink") continue;
        const id = blipId(run);
        if (!id) continue;
        const image = await readImage(zip, rels, id, extentOf(run));
        if (image) images.push(image);
      }
      blocks.push(...images);
      const paragraph = paragraphFrom(node, 11);
      if (paragraph) blocks.push(paragraph);
    }
    if (node.localName === "tbl") {
      const rows: string[][] = [];
      for (const row of localChildren(node, "tr")) {
        const cells: string[] = [];
        for (const cell of localChildren(row, "tc")) {
          const parts: string[] = [];
          for (const p of cell.getElementsByTagName("*")) {
            if (p.localName !== "p") continue;
            const paragraph = paragraphFrom(p, 10);
            if (paragraph) parts.push(paragraph.runs.map((run) => run.text).join("").replace(/\s+/g, " ").trim());
          }
          cells.push(parts.filter(Boolean).join(" "));
        }
        if (cells.some(Boolean)) rows.push(cells);
      }
      if (rows.length) blocks.push({ kind: "table", rows });
    }
  }
  return blocks;
}

type Face = { regular: PDFFont; bold: PDFFont; italic: PDFFont; both: PDFFont };

function faceFor(run: StyledRun, faces: Face) {
  if (run.bold && run.italic) return faces.both;
  if (run.bold) return faces.bold;
  if (run.italic) return faces.italic;
  return faces.regular;
}

type Piece = { text: string; font: PDFFont; size: number };

function wrapPieces(pieces: Piece[], maxWidth: number) {
  const lines: Piece[][] = [];
  let line: Piece[] = [];
  let width = 0;
  const push = () => {
    if (line.length) lines.push(line);
    line = [];
    width = 0;
  };
  for (const piece of pieces) {
    const parts = piece.text.split(/(\s+)/).filter((part) => part.length > 0);
    for (const part of parts) {
      if (part === "\n") {
        push();
        continue;
      }
      const wordWidth = piece.font.widthOfTextAtSize(part, piece.size);
      const broken = width + wordWidth > maxWidth && line.length > 0 && part.trim();
      if (broken) push();
      if (!part.trim() && line.length === 0) continue;
      line.push({ text: part, font: piece.font, size: piece.size });
      width += wordWidth;
    }
  }
  push();
  return lines.length ? lines : [[]];
}

export async function wordFileToPdf(file: File): Promise<Uint8Array> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf) {
    throw new Error(`${file.name} is an older .doc file. In Word, choose Save As → .docx, then drop it here.`);
  }
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new Error(`${file.name} isn’t a Word document Papyrus can open.`);
  }
  const documentXml = await zip.file("word/document.xml")?.async("string");
  if (!documentXml) {
    throw new Error(`${file.name} doesn’t look like a Word document.`);
  }
  const relsXml = await zip.file("word/_rels/document.xml.rels")?.async("string");
  const rels = relsXml ? parseRels(relsXml) : new Map<string, string>();
  const xml = new DOMParser().parseFromString(documentXml, "application/xml");
  if (xml.getElementsByTagName("parsererror").length) {
    throw new Error(`${file.name} couldn’t be read.`);
  }
  const body = [...xml.getElementsByTagName("*")].find((node) => node.localName === "body");
  if (!body) throw new Error(`${file.name} has no pages.`);

  const sect = [...body.children].find((node) => node.localName === "sectPr") ?? null;
  const pageW = sect ? twips(attr(firstChild(sect, "pgSz"), "w"), LETTER_W) : LETTER_W;
  const pageH = sect ? twips(attr(firstChild(sect, "pgSz"), "h"), LETTER_H) : LETTER_H;
  const mar = sect ? firstChild(sect, "pgMar") : null;
  const marginL = mar ? twips(attr(mar, "left"), 54) : 54;
  const marginR = mar ? twips(attr(mar, "right"), 54) : 54;
  const marginT = mar ? twips(attr(mar, "top"), 54) : 54;
  const marginB = mar ? twips(attr(mar, "bottom"), 54) : 54;
  const contentW = Math.max(120, pageW - marginL - marginR);

  const blocks = await blocksFromBody(body, zip, rels);
  if (blocks.length === 0) throw new Error(`${file.name} has nothing to put on a page.`);

  const pdf = await PDFDocument.create();
  const faces: Face = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    both: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
  };
  const bad = new Set<string>();
  let page = pdf.addPage([pageW, pageH]);
  let y = pageH - marginT;

  const newPage = () => {
    page = pdf.addPage([pageW, pageH]);
    y = pageH - marginT;
  };
  const room = (height: number) => {
    if (y - height < marginB) newPage();
  };

  const drawPieces = (lines: Piece[][], align: Align, indent: number) => {
    for (const line of lines) {
      const size = line.reduce((max, piece) => Math.max(max, piece.size), 11);
      const lineHeight = size * 1.35;
      room(lineHeight);
      const lineWidth = line.reduce((sum, piece) => sum + piece.font.widthOfTextAtSize(piece.text, piece.size), 0);
      let x = marginL + indent;
      if (align === "center") x = marginL + Math.max(0, (contentW - lineWidth) / 2);
      if (align === "right") x = pageW - marginR - lineWidth;
      const baseline = y - size;
      for (const piece of line) {
        if (piece.text) {
          page.drawText(piece.text, {
            x,
            y: baseline,
            size: piece.size,
            font: piece.font,
            color: rgb(0.12, 0.12, 0.12),
          });
        }
        x += piece.font.widthOfTextAtSize(piece.text, piece.size);
      }
      y -= lineHeight;
    }
  };

  for (const block of blocks) {
    if (block.kind === "p") {
      y -= block.gapBefore;
      const pieces: Piece[] = [];
      for (const run of block.runs) {
        const font = faceFor(run, faces);
        const text = cleanText(font, run.text, run.size, bad);
        if (text) pieces.push({ text, font, size: run.size });
      }
      const lines = wrapPieces(pieces, Math.max(80, contentW - block.indent));
      drawPieces(lines, block.align, block.indent);
      continue;
    }
    if (block.kind === "image") {
      try {
        const embedded =
          block.kindImage === "png" ? await pdf.embedPng(block.bytes) : await pdf.embedJpg(block.bytes);
        const scale = Math.min(contentW / embedded.width, 1);
        let width = embedded.width * scale;
        let height = embedded.height * scale;
        const maxH = pageH - marginT - marginB;
        if (height > maxH) {
          const fit = maxH / height;
          width *= fit;
          height *= fit;
        }
        room(height + 8);
        page.drawImage(embedded, { x: marginL, y: y - height, width, height });
        y -= height + 8;
      } catch (err) {
        console.error(err);
      }
      continue;
    }
    const cols = Math.max(1, ...block.rows.map((row) => row.length));
    const colW = contentW / cols;
    for (const row of block.rows) {
      const wrapped = row.map((cell) =>
        wrapPieces(
          [
            {
              text: cleanText(faces.regular, cell || " ", 10, bad) || " ",
              font: faces.regular,
              size: 10,
            },
          ],
          colW - 8,
        ),
      );
      while (wrapped.length < cols) wrapped.push([[{ text: "", font: faces.regular, size: 10 }]]);
      const rowHeight = Math.max(
        16,
        ...wrapped.map((lines) => lines.length * 13 + 8),
      );
      room(rowHeight);
      const top = y;
      wrapped.forEach((lines, index) => {
        const x = marginL + index * colW;
        page.drawRectangle({
          x,
          y: top - rowHeight,
          width: colW,
          height: rowHeight,
          borderColor: rgb(0.75, 0.75, 0.75),
          borderWidth: 0.6,
        });
        let textY = top - 14;
        for (const line of lines) {
          const text = line.map((piece) => piece.text).join("");
          if (text.trim()) {
            page.drawText(text, { x: x + 4, y: textY, size: 10, font: faces.regular, color: rgb(0.12, 0.12, 0.12) });
          }
          textY -= 13;
        }
      });
      y -= rowHeight;
    }
    y -= 8;
  }

  if (pdf.getPageCount() < 1) {
    pdf.addPage([pageW, pageH]);
  }
  void (page satisfies PDFPage);
  return pdf.save();
}
