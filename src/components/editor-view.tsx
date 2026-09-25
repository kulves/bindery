import { useState, type ReactNode } from "react";
import {
  Bold,
  ChevronDown,
  ChevronUp,
  Highlighter,
  ImageIcon,
  Italic,
  PenTool,
  RotateCw,
  Stamp,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropZone } from "@/components/drop-zone";
import { PageStage } from "@/components/page-stage";
import { addSample, rehydrate } from "@/lib/add-pdfs";
import {
  downloadBytes,
  getPageCount,
  removePages,
  reorderPages,
  rotatePage,
  safeFilename,
} from "@/lib/pdf";
import { applyHighlights, applyStrokes, applyTextBoxes, type TextBox, type TextFont } from "@/lib/pdf-text";
import { cn } from "@/lib/utils";
import { useActiveDoc, useWorkspace } from "@/store/workspace";

const COMING = [
  { icon: ImageIcon, label: "Image" },
  { icon: Stamp, label: "Sign" },
];

const PEN = [
  { id: "fine", label: "Fine", width: 1.8 },
  { id: "medium", label: "Medium", width: 3.2 },
  { id: "heavy", label: "Heavy", width: 6 },
] as const;

export function EditorView() {
  const docs = useWorkspace((s) => s.docs);
  const doc = useActiveDoc();
  const outputName = useWorkspace((s) => s.outputName);
  const busy = useWorkspace((s) => s.busy);
  const textBoxes = useWorkspace((s) => s.textBoxes);
  const highlights = useWorkspace((s) => s.highlights);
  const strokes = useWorkspace((s) => s.strokes);
  const setActive = useWorkspace((s) => s.setActive);
  const setOutputName = useWorkspace((s) => s.setOutputName);
  const setBusy = useWorkspace((s) => s.setBusy);
  const replaceDoc = useWorkspace((s) => s.replaceDoc);
  const addTextBox = useWorkspace((s) => s.addTextBox);
  const patchTextBox = useWorkspace((s) => s.patchTextBox);
  const removeTextBox = useWorkspace((s) => s.removeTextBox);
  const clearTextBoxes = useWorkspace((s) => s.clearTextBoxes);
  const addHighlight = useWorkspace((s) => s.addHighlight);
  const patchHighlight = useWorkspace((s) => s.patchHighlight);
  const removeHighlight = useWorkspace((s) => s.removeHighlight);
  const clearHighlights = useWorkspace((s) => s.clearHighlights);
  const addStroke = useWorkspace((s) => s.addStroke);
  const undoStroke = useWorkspace((s) => s.undoStroke);
  const clearStrokes = useWorkspace((s) => s.clearStrokes);
  const [focus, setFocus] = useState(0);
  const [textMode, setTextMode] = useState(false);
  const [highlightMode, setHighlightMode] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedMarkId, setSelectedMarkId] = useState<string | null>(null);
  const [font, setFont] = useState<TextFont>("sans");
  const [size, setSize] = useState(14);
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [penWidth, setPenWidth] = useState(3.2);

  if (docs.length === 0) {
    return (
      <div className="stagger-in mx-auto flex w-full max-w-3xl flex-col gap-4">
        <DropZone
          multiple={false}
          title="Drop a PDF to edit"
          hint="Add text, highlight, draw, rotate, and reorder pages. Files never leave this device."
        />
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => void addSample("report")}>
            Try a 6-page sample
          </Button>
        </div>
      </div>
    );
  }

  if (!doc) return null;
  const page = Math.min(focus, Math.max(0, doc.pageCount - 1));
  const boxes = textBoxes[doc.id] ?? [];
  const marks = highlights[doc.id] ?? [];
  const ink = strokes[doc.id] ?? [];
  const selected = boxes.find((box) => box.id === selectedId) ?? null;
  const selectedMark = marks.find((mark) => mark.id === selectedMarkId) ?? null;

  async function bake(bytes: Uint8Array) {
    const state = useWorkspace.getState();
    const currentBoxes = state.textBoxes[doc.id] ?? [];
    const currentMarks = state.highlights[doc.id] ?? [];
    const currentInk = state.strokes[doc.id] ?? [];
    let next = bytes;
    if (currentMarks.length) next = await applyHighlights(next, currentMarks);
    if (currentInk.length) next = await applyStrokes(next, currentInk);
    if (currentBoxes.length) next = await applyTextBoxes(next, currentBoxes);
    if (currentMarks.length) clearHighlights(doc.id);
    if (currentInk.length) clearStrokes(doc.id);
    if (currentBoxes.length) clearTextBoxes(doc.id);
    setSelectedId(null);
    setSelectedMarkId(null);
    return next;
  }

  async function commit(label: string, nextBytes: Promise<Uint8Array>, nextFocus = page) {
    setBusy(true, label);
    try {
      const bytes = await nextBytes;
      const pageCount = await getPageCount(bytes);
      replaceDoc(doc.id, {
        bytes,
        pageCount,
        thumbs: Array.from({ length: pageCount }),
        rendering: true,
      });
      rehydrate({ ...doc, bytes, pageCount, thumbs: Array.from({ length: pageCount }), rendering: true });
      setFocus(Math.min(nextFocus, pageCount - 1));
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Couldn’t edit that page.");
    } finally {
      setBusy(false);
    }
  }

  async function mutate(label: string, op: (bytes: Uint8Array) => Promise<Uint8Array>, nextFocus = page) {
    await commit(label, bake(doc.bytes).then(op), nextFocus);
  }

  function move(dir: -1 | 1) {
    const next = page + dir;
    if (next < 0 || next >= doc.pageCount) return;
    const order = Array.from({ length: doc.pageCount }, (_, i) => i);
    const [item] = order.splice(page, 1);
    order.splice(next, 0, item);
    void mutate("Reordering…", (bytes) => reorderPages(bytes, order), next);
  }

  async function onSave() {
    setBusy(true, "Saving…");
    try {
      const bytes = await bake(doc.bytes);
      if (bytes !== doc.bytes) {
        const pageCount = await getPageCount(bytes);
        replaceDoc(doc.id, {
          bytes,
          pageCount,
          thumbs: Array.from({ length: pageCount }),
          rendering: true,
        });
        rehydrate({ ...doc, bytes, pageCount, thumbs: Array.from({ length: pageCount }), rendering: true });
      }
      const name = safeFilename(outputName || `${doc.name}-edited`) + ".pdf";
      downloadBytes(bytes, name);
      toast.success(`Saved ${name}`);
    } catch (err) {
      console.error(err);
      toast.error("Couldn’t save that PDF.");
    } finally {
      setBusy(false);
    }
  }

  function onAddBox(box: TextBox) {
    addTextBox(doc.id, box);
    setSelectedId(box.id);
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <header className="flex flex-col gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Page editor
          </p>
          <h2 className="font-display text-3xl leading-tight">{doc.name}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-card p-2 shadow-[var(--shadow-border)]">
          <ToolButton
            label="Add or edit text"
            pressed={textMode}
            onClick={() => {
              setTextMode((on) => !on);
              setHighlightMode(false);
              setDrawMode(false);
              setSelectedId(null);
              setSelectedMarkId(null);
            }}
          >
            <Type />
            Text
          </ToolButton>
          <ToolButton
            label="Highlight text"
            pressed={highlightMode}
            onClick={() => {
              setHighlightMode((on) => !on);
              setTextMode(false);
              setDrawMode(false);
              setSelectedId(null);
              setSelectedMarkId(null);
            }}
          >
            <Highlighter />
            Highlight
          </ToolButton>
          <ToolButton
            label="Draw on the page"
            pressed={drawMode}
            onClick={() => {
              setDrawMode((on) => !on);
              setTextMode(false);
              setHighlightMode(false);
              setSelectedId(null);
              setSelectedMarkId(null);
            }}
          >
            <PenTool />
            Draw
          </ToolButton>
          <ToolButton
            label="Rotate 90°"
            onClick={() => void mutate("Rotating…", (bytes) => rotatePage(bytes, page))}
          >
            <RotateCw />
            Rotate
          </ToolButton>
          <ToolButton label="Move page up" disabled={page === 0} onClick={() => move(-1)}>
            <ChevronUp />
            Up
          </ToolButton>
          <ToolButton
            label="Move page down"
            disabled={page === doc.pageCount - 1}
            onClick={() => move(1)}
          >
            <ChevronDown />
            Down
          </ToolButton>
          <ToolButton
            label="Delete page"
            onClick={() =>
              void mutate("Removing page…", (bytes) => removePages(bytes, [page]), Math.max(0, page - 1))
            }
          >
            <Trash2 />
            Delete
          </ToolButton>
          <span className="mx-2 hidden h-8 w-px bg-border sm:block" />
          {COMING.map((item) => (
            <Tooltip key={item.label}>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <button
                    type="button"
                    disabled
                    className="inline-flex h-11 items-center gap-2 rounded-sm px-3 text-sm text-muted-foreground opacity-55"
                  >
                    <item.icon className="size-4" />
                    <span className="hidden sm:inline">{item.label}</span>
                    <Badge variant="soon" className="hidden md:inline-flex">
                      Soon
                    </Badge>
                  </button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Coming in the full editor</TooltipContent>
            </Tooltip>
          ))}
        </div>
        {highlightMode && (
          <div className="flex flex-col gap-3 rounded-lg bg-secondary p-3 sm:flex-row sm:flex-wrap sm:items-center">
            <p className="text-sm text-muted-foreground sm:flex-1">
              Click a line to highlight it, or drag to mark a region.
            </p>
            {selectedMark && (
              <Button
                variant="ghost"
                onClick={() => {
                  removeHighlight(doc.id, selectedMark.id);
                  setSelectedMarkId(null);
                }}
              >
                <Trash2 />
                Remove highlight
              </Button>
            )}
          </div>
        )}
        {drawMode && (
          <div className="flex flex-col gap-3 rounded-lg bg-secondary p-3 sm:flex-row sm:flex-wrap sm:items-center">
            <p className="text-sm text-muted-foreground sm:flex-1">
              Draw on the page. Undo takes back the last stroke.
            </p>
            <div className="flex rounded-full bg-card p-1">
              {PEN.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPenWidth(item.width)}
                  className={cn(
                    "h-11 rounded-full px-3 text-sm",
                    penWidth === item.width
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <Button variant="ghost" disabled={ink.length === 0} onClick={() => undoStroke(doc.id)}>
              <Undo2 />
              Undo
            </Button>
          </div>
        )}
        {textMode && (
          <div className="flex flex-col gap-3 rounded-lg bg-secondary p-3 sm:flex-row sm:flex-wrap sm:items-center">
            <p className="text-sm text-muted-foreground sm:flex-1">
              Click a line to rewrite it, or click empty space to add a box. Drag the grip to move, a corner to resize.
            </p>
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              Size
              <Input
                type="number"
                min={8}
                max={72}
                value={selected?.size ?? size}
                aria-label="Font size"
                className="w-20"
                onChange={(event) => {
                  const next = Math.max(8, Math.min(72, Number(event.target.value) || 14));
                  setSize(next);
                  if (selected) patchTextBox(doc.id, selected.id, { size: next });
                }}
              />
            </label>
            <div className="flex rounded-full bg-card p-1">
              {(["sans", "serif"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setFont(item);
                    if (selected) patchTextBox(doc.id, selected.id, { font: item });
                  }}
                  className={cn(
                    "h-11 min-w-16 rounded-full px-3 text-sm capitalize",
                    (selected?.font ?? font) === item
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted",
                  )}
                >
                  {item === "sans" ? "Sans" : "Serif"}
                </button>
              ))}
            </div>
            <div className="flex rounded-full bg-card p-1">
              <button
                type="button"
                aria-label="Bold"
                aria-pressed={selected?.bold ?? bold}
                onClick={() => {
                  const next = !(selected?.bold ?? bold);
                  setBold(next);
                  if (selected) patchTextBox(doc.id, selected.id, { bold: next });
                }}
                className={cn(
                  "inline-flex size-11 items-center justify-center rounded-full",
                  (selected?.bold ?? bold)
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-muted",
                )}
              >
                <Bold className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Italic"
                aria-pressed={selected?.italic ?? italic}
                onClick={() => {
                  const next = !(selected?.italic ?? italic);
                  setItalic(next);
                  if (selected) patchTextBox(doc.id, selected.id, { italic: next });
                }}
                className={cn(
                  "inline-flex size-11 items-center justify-center rounded-full",
                  (selected?.italic ?? italic)
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-muted",
                )}
              >
                <Italic className="size-4" />
              </button>
            </div>
            {selected && (
              <Button
                variant="ghost"
                onClick={() => {
                  removeTextBox(doc.id, selected.id);
                  setSelectedId(null);
                }}
              >
                <Trash2 />
                Remove box
              </Button>
            )}
          </div>
        )}
      </header>

      {docs.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {docs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActive(item.id);
                setFocus(0);
                setSelectedId(null);
              }}
              className={cn(
                "h-11 shrink-0 rounded-sm px-3 text-sm",
                item.id === doc.id ? "bg-primary text-primary-foreground" : "bg-secondary",
              )}
            >
              {item.name}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[112px_minmax(0,1fr)]">
        <ol className="flex gap-2 overflow-x-auto pr-1 lg:max-h-[70vh] lg:flex-col lg:overflow-y-auto">
          {Array.from({ length: doc.pageCount }, (_, index) => (
            <li key={index} className="w-16 shrink-0 lg:w-auto">
              <button
                type="button"
                onClick={() => {
                  setFocus(index);
                  setSelectedId(null);
                }}
                className={cn(
                  "relative block w-full overflow-hidden rounded-xs bg-muted shadow-[var(--shadow-page)]",
                  index === page && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
                )}
                aria-label={`Show page ${index + 1}`}
                aria-current={index === page}
              >
                <span className="relative block aspect-[8.5/11]">
                  {doc.thumbs[index] ? (
                    <img src={doc.thumbs[index]} alt="" className="size-full object-cover" />
                  ) : (
                    <span className="page-skeleton absolute inset-0" />
                  )}
                </span>
                <span className="absolute bottom-1 left-1 rounded-full bg-primary/90 px-1.5 font-mono text-xs tabular-nums text-primary-foreground">
                  {index + 1}
                </span>
              </button>
            </li>
          ))}
        </ol>

        <figure className="flex min-h-[50vh] items-center justify-center rounded-xl bg-desk p-4 shadow-[var(--shadow-border)] sm:p-8">
          <PageStage
            bytes={doc.bytes}
            page={page}
            fallback={doc.thumbs[page]}
            textMode={textMode}
            highlightMode={highlightMode}
            drawMode={drawMode}
            boxes={boxes}
            marks={marks}
            strokes={ink}
            selectedId={selectedId}
            selectedMarkId={selectedMarkId}
            font={font}
            size={size}
            bold={bold}
            italic={italic}
            penWidth={penWidth}
            onSelect={setSelectedId}
            onAdd={onAddBox}
            onPatch={(id, patch) => patchTextBox(doc.id, id, patch)}
            onRemove={(id) => {
              removeTextBox(doc.id, id);
              if (selectedId === id) setSelectedId(null);
            }}
            onSelectMark={setSelectedMarkId}
            onAddMark={(mark) => {
              addHighlight(doc.id, mark);
              setSelectedMarkId(mark.id);
            }}
            onPatchMark={(id, patch) => patchHighlight(doc.id, id, patch)}
            onRemoveMark={(id) => {
              removeHighlight(doc.id, id);
              if (selectedMarkId === id) setSelectedMarkId(null);
            }}
            onAddStroke={(stroke) => addStroke(doc.id, stroke)}
          />
        </figure>
      </div>

      <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-xl bg-card p-4 shadow-[var(--shadow-border)] sm:flex-row sm:items-center">
        <p className="text-sm tabular-nums text-muted-foreground sm:flex-1">
          Page {page + 1} of {doc.pageCount}
          {boxes.length > 0
            ? ` · ${boxes.length} text change${boxes.length === 1 ? "" : "s"}`
            : ""}
          {marks.length > 0
            ? ` · ${marks.length} highlight${marks.length === 1 ? "" : "s"}`
            : ""}
          {ink.length > 0 ? ` · ${ink.length} stroke${ink.length === 1 ? "" : "s"}` : ""}
        </p>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
          File name
          <Input
            value={outputName}
            placeholder={`${doc.name}-edited`}
            onChange={(event) => setOutputName(event.target.value)}
          />
        </label>
        <Button size="lg" className="w-full sm:w-auto" disabled={busy} onClick={() => void onSave()}>
          Save PDF
        </Button>
      </div>
    </div>
  );
}

function ToolButton({
  children,
  label,
  onClick,
  disabled,
  pressed,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
}) {
  return (
    <Button
      variant={pressed ? "default" : "ghost"}
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      className="px-3"
    >
      {children}
    </Button>
  );
}
