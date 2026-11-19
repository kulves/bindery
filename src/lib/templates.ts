import { PDFDocument, rgb } from "pdf-lib";
import { loadPdfBytes, type PdfDoc } from "@/lib/pdf";
import type { TextBox, TextColor, TextFill, TextFont } from "@/lib/pdf-text";

export type TemplateKind = "registration" | "invoice" | "letter";

const PAGE_W = 612;
const PAGE_H = 792;
const RULE = rgb(0.75, 0.72, 0.66);
const NAVY = rgb(0.102, 0.18, 0.243);

export async function createTemplate(kind: TemplateKind): Promise<{ doc: PdfDoc; boxes: TextBox[] }> {
  const built = kind === "invoice" ? invoice() : kind === "letter" ? letter() : registration();
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: rgb(1, 1, 1) });
  for (const band of built.bands) {
    page.drawRectangle({
      x: band.x,
      y: PAGE_H - band.top - band.height,
      width: band.width,
      height: band.height,
      color: band.color === "navy" ? NAVY : RULE,
    });
  }
  for (const line of built.lines) {
    const y = PAGE_H - line.top;
    page.drawLine({
      start: { x: line.x, y },
      end: { x: line.x + line.width, y },
      thickness: 0.7,
      color: RULE,
    });
  }
  const filename = built.filename;
  const doc = await loadPdfBytes(await pdf.save(), filename);
  return { doc, boxes: built.boxes };
}

function registration() {
  const boxes: TextBox[] = [
    words(54, 16, 420, 32, "Registration form", { size: 22, font: "serif", bold: true, color: "white" }),
    words(54, 78, 480, 16, "Click a line to change it.", { size: 11, color: "gray" }),
  ];
  const lines: Line[] = [];
  const fields = ["Name", "Email", "Phone", "Address", "City", "Date"];
  fields.forEach((label, index) => {
    const top = 112 + index * 46;
    boxes.push(words(54, top, 130, 18, label, { size: 12, bold: true }));
    boxes.push(words(190, top - 2, 360, 22, "", { size: 12, fill: "white", border: "navy" }));
    lines.push({ x: 190, top: top + 24, width: 360 });
  });
  boxes.push(words(54, 400, 130, 18, "Notes", { size: 12, bold: true }));
  boxes.push(words(190, 396, 360, 120, "", { size: 12, fill: "gray", border: "navy" }));
  return { filename: "Registration form.pdf", boxes, lines, bands: [band(0, 0, PAGE_W, 58)] };
}

function invoice() {
  const boxes: TextBox[] = [
    words(54, 16, 240, 32, "Invoice", { size: 22, font: "serif", bold: true, color: "white" }),
    words(54, 78, 80, 16, "From", { size: 11, bold: true, color: "gray" }),
    words(54, 96, 230, 64, "Your name\nStreet\nCity", { size: 12 }),
    words(320, 78, 80, 16, "Bill to", { size: 11, bold: true, color: "gray" }),
    words(320, 96, 230, 64, "Client name\nStreet\nCity", { size: 12 }),
    words(54, 180, 90, 16, "Invoice no.", { size: 11, bold: true }),
    words(150, 178, 120, 20, "001", { size: 12, border: "navy", fill: "white" }),
    words(290, 180, 50, 16, "Date", { size: 11, bold: true }),
    words(340, 178, 200, 20, "", { size: 12, border: "navy", fill: "white" }),
    words(54, 230, 250, 16, "Description", { size: 11, bold: true }),
    words(330, 230, 60, 16, "Qty", { size: 11, bold: true }),
    words(400, 230, 70, 16, "Price", { size: 11, bold: true }),
    words(480, 230, 70, 16, "Amount", { size: 11, bold: true }),
  ];
  const lines: Line[] = [{ x: 54, top: 252, width: 504 }];
  for (let index = 0; index < 6; index++) {
    const top = 262 + index * 32;
    boxes.push(words(54, top, 260, 22, "", { size: 12 }));
    boxes.push(words(330, top, 50, 22, "", { size: 12 }));
    boxes.push(words(400, top, 70, 22, "", { size: 12 }));
    boxes.push(words(480, top, 78, 22, "", { size: 12 }));
    lines.push({ x: 54, top: top + 26, width: 504 });
  }
  boxes.push(words(360, 470, 80, 18, "Total", { size: 13, bold: true }));
  boxes.push(words(450, 466, 108, 24, "", { size: 13, bold: true, border: "navy", fill: "yellow" }));
  boxes.push(words(54, 530, 80, 16, "Note", { size: 11, bold: true }));
  boxes.push(words(54, 550, 504, 70, "Thank you.", { size: 12, fill: "gray" }));
  return { filename: "Invoice.pdf", boxes, lines, bands: [band(0, 0, PAGE_W, 58)] };
}

function letter() {
  const boxes: TextBox[] = [
    words(54, 54, 240, 22, "Date", { size: 12, color: "gray" }),
    words(54, 100, 80, 16, "To", { size: 11, bold: true, color: "gray" }),
    words(54, 118, 360, 48, "Name\nStreet\nCity", { size: 12 }),
    words(54, 184, 70, 16, "Subject", { size: 11, bold: true }),
    words(130, 182, 420, 22, "", { size: 12, border: "navy", fill: "white" }),
    words(54, 230, 504, 280, "Start the letter here.", { size: 12 }),
    words(54, 540, 200, 22, "Sincerely,", { size: 12, italic: true, font: "serif" }),
    words(54, 590, 240, 22, "Your name", { size: 12 }),
  ];
  return {
    filename: "Letter.pdf",
    boxes,
    lines: [
      { x: 54, top: 80, width: 180 },
      { x: 54, top: 210, width: 504 },
    ],
    bands: [] as Band[],
  };
}

function words(
  x: number,
  top: number,
  width: number,
  height: number,
  text: string,
  options: {
    size?: number;
    font?: TextFont;
    bold?: boolean;
    italic?: boolean;
    color?: TextColor;
    fill?: TextFill;
    border?: TextColor | "none";
  } = {},
): TextBox {
  return {
    id: crypto.randomUUID(),
    page: 0,
    nx: x / PAGE_W,
    ny: top / PAGE_H,
    nw: width / PAGE_W,
    nh: height / PAGE_H,
    text,
    size: options.size ?? 12,
    font: options.font ?? "sans",
    bold: Boolean(options.bold),
    italic: Boolean(options.italic),
    fill: options.fill ?? "none",
    color: options.color ?? "ink",
    border: options.border ?? "none",
    borderWeight: options.border && options.border !== "none" ? 1 : undefined,
    replace: false,
  };
}

type Line = { x: number; top: number; width: number };
type Band = { x: number; top: number; width: number; height: number; color: "navy" | "rule" };

function band(x: number, top: number, width: number, height: number): Band {
  return { x, top, width, height, color: "navy" };
}
