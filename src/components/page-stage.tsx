import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { GripHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { extractPageLines, type HighlightMark, type SignatureStamp, type Stroke, type TextBox, type TextFont, type TextLine } from "@/lib/pdf-text";
import { renderPageImage } from "@/lib/pdf-render";

interface PageStageProps {
  bytes: Uint8Array;
  page: number;
  fallback?: string;
  textMode: boolean;
  highlightMode: boolean;
  drawMode: boolean;
  signMode: boolean;
  boxes: TextBox[];
  marks: HighlightMark[];
  strokes: Stroke[];
  stamps: SignatureStamp[];
  selectedId: string | null;
  selectedMarkId: string | null;
  selectedStampId: string | null;
  font: TextFont;
  size: number;
  bold: boolean;
  italic: boolean;
  penWidth: number;
  signature: { kind: "draw" | "type"; paths: Array<Array<{ nx: number; ny: number }>>; text: string } | null;
  onSelect: (id: string | null) => void;
  onAdd: (box: TextBox) => void;
  onPatch: (id: string, patch: Partial<TextBox>) => void;
  onRemove: (id: string) => void;
  onSelectMark: (id: string | null) => void;
  onAddMark: (mark: HighlightMark) => void;
  onPatchMark: (id: string, patch: Partial<HighlightMark>) => void;
  onRemoveMark: (id: string) => void;
  onAddStroke: (stroke: Stroke) => void;
  onSelectStamp: (id: string | null) => void;
  onAddStamp: (stamp: SignatureStamp) => void;
  onPatchStamp: (id: string, patch: Partial<SignatureStamp>) => void;
  onRemoveStamp: (id: string) => void;
}

type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

type Drag =
  | { kind: "move"; target: "box" | "stamp"; id: string; ox: number; oy: number; nx: number; ny: number; dragging: boolean }
  | {
      kind: "resize";
      target: "box" | "stamp";
      id: string;
      handle: Handle;
      ox: number;
      oy: number;
      nx: number;
      ny: number;
      nw: number;
      nh: number;
    };

const HANDLES: Array<{ id: Handle; label: string; className: string }> = [
  { id: "nw", label: "Resize from top left", className: "top-0 left-0 cursor-nwse-resize" },
  { id: "n", label: "Resize from top", className: "top-0 left-1/2 cursor-ns-resize" },
  { id: "ne", label: "Resize from top right", className: "top-0 left-full cursor-nesw-resize" },
  { id: "e", label: "Resize from right", className: "top-1/2 left-full cursor-ew-resize" },
  { id: "se", label: "Resize from bottom right", className: "top-full left-full cursor-nwse-resize" },
  { id: "s", label: "Resize from bottom", className: "top-full left-1/2 cursor-ns-resize" },
  { id: "sw", label: "Resize from bottom left", className: "top-full left-0 cursor-nesw-resize" },
  { id: "w", label: "Resize from left", className: "top-1/2 left-0 cursor-ew-resize" },
];

const MIN_W = 0.06;
const MIN_H = 0.024;

export function PageStage({
  bytes,
  page,
  fallback,
  textMode,
  highlightMode,
  drawMode,
  signMode,
  boxes,
  marks,
  strokes,
  stamps,
  selectedId,
  selectedMarkId,
  selectedStampId,
  font,
  size,
  bold,
  italic,
  penWidth,
  signature,
  onSelect,
  onAdd,
  onPatch,
  onRemove,
  onSelectMark,
  onAddMark,
  onPatchMark,
  onRemoveMark,
  onAddStroke,
  onSelectStamp,
  onAddStamp,
  onPatchStamp,
  onRemoveStamp,
}: PageStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState(fallback ?? "");
  const [lines, setLines] = useState<TextLine[]>([]);
  const drag = useRef<Drag | null>(null);
  const sweep = useRef<{ nx: number; ny: number } | null>(null);
  const [draft, setDraft] = useState<{ nx: number; ny: number; nw: number; nh: number } | null>(null);
  const liveStroke = useRef<Array<{ nx: number; ny: number }>>([]);
  const [livePoints, setLivePoints] = useState<Array<{ nx: number; ny: number }>>([]);

  useEffect(() => {
    let alive = true;
    setPreview(fallback ?? "");
    void renderPageImage(bytes, page)
      .then((url) => {
        if (alive && url) setPreview(url);
      })
      .catch(() => {
        /* keep fallback */
      });
    return () => {
      alive = false;
    };
  }, [bytes, page, fallback]);

  useEffect(() => {
    if (!textMode && !highlightMode) {
      setLines([]);
      return;
    }
    let alive = true;
    void extractPageLines(bytes, page).then((next) => {
      if (alive) setLines(next);
    });
    return () => {
      alive = false;
    };
  }, [bytes, page, textMode, highlightMode]);

  const pageBoxes = boxes.filter((box) => box.page === page);
  const pageMarks = marks.filter((mark) => mark.page === page);
  const pageStrokes = strokes.filter((stroke) => stroke.page === page);
  const pageStamps = stamps.filter((stamp) => stamp.page === page);
  const covered = new Set(
    pageBoxes.map((box) => box.sourceId).filter((id): id is string => Boolean(id)),
  );

  function pointFromEvent(event: { clientX: number; clientY: number }) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width < 1 || rect.height < 1) return null;
    return {
      nx: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      ny: clamp((event.clientY - rect.top) / rect.height, 0, 1),
    };
  }

  function placeBox(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    const point = pointFromEvent(event);
    if (!point) return;
    if (signMode) {
      placeStamp(point);
      return;
    }
    if (!textMode) return;
    const nh = Math.max(0.1, (size * 3.2) / 792);
    const nw = 0.42;
    const box: TextBox = {
      id: crypto.randomUUID(),
      page,
      nx: Math.min(point.nx, 1 - nw),
      ny: Math.min(point.ny, 1 - nh),
      nw,
      nh,
      text: "",
      size,
      font,
      bold,
      italic,
      replace: false,
    };
    onAdd(box);
  }

  function placeStamp(point: { nx: number; ny: number }) {
    if (!signature) return;
    const nw = 0.34;
    const nh = 0.1;
    onAddStamp({
      id: crypto.randomUUID(),
      page,
      nx: Math.min(point.nx, 1 - nw),
      ny: Math.min(point.ny, 1 - nh),
      nw,
      nh,
      kind: signature.kind,
      paths: signature.paths,
      text: signature.text,
    });
  }

  function editLine(line: TextLine) {
    const existing = pageBoxes.find(
      (box) => box.replace && Math.abs(box.nx - line.nx) < 0.01 && Math.abs(box.ny - line.ny) < 0.01,
    );
    if (existing) {
      onSelect(existing.id);
      return;
    }
    const box: TextBox = {
      id: crypto.randomUUID(),
      page,
      nx: line.nx,
      ny: line.ny,
      nw: Math.max(line.nw, MIN_W),
      nh: Math.max(line.nh, MIN_H),
      text: line.str,
      size: Math.round(line.size) || size,
      font: "serif",
      bold: false,
      italic: false,
      replace: true,
      sourceId: line.id,
    };
    onAdd(box);
  }

  function highlightLine(line: TextLine) {
    const existing = pageMarks.find(
      (mark) => Math.abs(mark.nx - line.nx) < 0.01 && Math.abs(mark.ny - line.ny) < 0.01,
    );
    if (existing) {
      onSelectMark(existing.id);
      return;
    }
    const padX = 0.006;
    const padY = 0.004;
    onAddMark({
      id: crypto.randomUUID(),
      page,
      nx: clamp(line.nx - padX, 0, 1),
      ny: clamp(line.ny - padY, 0, 1),
      nw: Math.min(1 - Math.max(0, line.nx - padX), line.nw + padX * 2),
      nh: Math.min(1 - Math.max(0, line.ny - padY), Math.max(line.nh + padY * 2, 0.014)),
    });
  }

  function onStagePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!highlightMode) return;
    if (event.target !== event.currentTarget) return;
    const point = pointFromEvent(event);
    if (!point) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    sweep.current = point;
    setDraft({ nx: point.nx, ny: point.ny, nw: 0, nh: 0 });
    onSelectMark(null);
  }

  function onStagePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const origin = sweep.current;
    if (!origin) return;
    const point = pointFromEvent(event);
    if (!point) return;
    const nx = Math.min(origin.nx, point.nx);
    const ny = Math.min(origin.ny, point.ny);
    setDraft({
      nx,
      ny,
      nw: Math.abs(point.nx - origin.nx),
      nh: Math.abs(point.ny - origin.ny),
    });
  }

  function onStagePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const origin = sweep.current;
    sweep.current = null;
    setDraft(null);
    if (!origin) return;
    const point = pointFromEvent(event);
    if (!point) return;
    const nx = Math.min(origin.nx, point.nx);
    const ny = Math.min(origin.ny, point.ny);
    const nw = Math.abs(point.nx - origin.nx);
    const nh = Math.abs(point.ny - origin.ny);
    if (nw < 0.02 || nh < 0.01) return;
    onAddMark({ id: crypto.randomUUID(), page, nx, ny, nw, nh });
  }

  function onDrawPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (!drawMode) return;
    const point = pointFromEvent(event);
    if (!point) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    liveStroke.current = [point];
    setLivePoints([point]);
  }

  function onDrawPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (!drawMode || liveStroke.current.length === 0) return;
    const point = pointFromEvent(event);
    if (!point) return;
    const last = liveStroke.current[liveStroke.current.length - 1];
    if (last && Math.hypot(point.nx - last.nx, point.ny - last.ny) < 0.003) return;
    liveStroke.current = [...liveStroke.current, point];
    setLivePoints(liveStroke.current);
  }

  function onDrawPointerUp() {
    const points = liveStroke.current;
    liveStroke.current = [];
    setLivePoints([]);
    if (points.length === 0) return;
    onAddStroke({ id: crypto.randomUUID(), page, points, width: penWidth });
  }

  function onBoxPointerDown(event: ReactPointerEvent<HTMLDivElement>, box: TextBox) {
    if (!textMode) return;
    if ((event.target as HTMLElement).closest("[data-handle],[data-move]")) return;
    if ((event.target as HTMLElement).tagName === "TEXTAREA") return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    beginMove(event, box);
  }

  function beginMove(event: ReactPointerEvent, box: TextBox) {
    drag.current = {
      kind: "move",
      target: "box",
      id: box.id,
      ox: event.clientX,
      oy: event.clientY,
      nx: box.nx,
      ny: box.ny,
      dragging: false,
    };
    onSelect(box.id);
  }

  function onMovePointerDown(event: ReactPointerEvent<HTMLButtonElement>, box: TextBox) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    beginMove(event, box);
    if (drag.current?.kind === "move") drag.current.dragging = true;
  }

  function onHandlePointerDown(event: ReactPointerEvent<HTMLButtonElement>, box: TextBox, handle: Handle) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      kind: "resize",
      target: "box",
      id: box.id,
      handle,
      ox: event.clientX,
      oy: event.clientY,
      nx: box.nx,
      ny: box.ny,
      nw: box.nw,
      nh: box.nh,
    };
    onSelect(box.id);
  }

  function onStampPointerDown(event: ReactPointerEvent<HTMLDivElement>, stamp: SignatureStamp) {
    if (!signMode) return;
    if ((event.target as HTMLElement).closest("[data-handle],[data-move]")) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      kind: "move",
      target: "stamp",
      id: stamp.id,
      ox: event.clientX,
      oy: event.clientY,
      nx: stamp.nx,
      ny: stamp.ny,
      dragging: false,
    };
    onSelectStamp(stamp.id);
  }

  function onStampHandlePointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
    stamp: SignatureStamp,
    handle: Handle,
  ) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      kind: "resize",
      target: "stamp",
      id: stamp.id,
      handle,
      ox: event.clientX,
      oy: event.clientY,
      nx: stamp.nx,
      ny: stamp.ny,
      nw: stamp.nw,
      nh: stamp.nh,
    };
    onSelectStamp(stamp.id);
  }

  function onDragMove(event: ReactPointerEvent) {
    const active = drag.current;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!active || !rect) return;
    const dx = (event.clientX - active.ox) / rect.width;
    const dy = (event.clientY - active.oy) / rect.height;
    if (active.kind === "move") {
      if (active.target === "stamp") {
        const stamp = pageStamps.find((item) => item.id === active.id);
        if (!stamp) return;
        const pixels = Math.hypot(event.clientX - active.ox, event.clientY - active.oy);
        if (!active.dragging && pixels < 6) return;
        active.dragging = true;
        onPatchStamp(active.id, {
          nx: clamp(active.nx + dx, 0, 1 - stamp.nw),
          ny: clamp(active.ny + dy, 0, 1 - stamp.nh),
        });
        return;
      }
      const box = pageBoxes.find((item) => item.id === active.id);
      if (!box) return;
      const pixels = Math.hypot(event.clientX - active.ox, event.clientY - active.oy);
      if (!active.dragging && pixels < 6) return;
      active.dragging = true;
      onPatch(active.id, {
        nx: clamp(active.nx + dx, 0, 1 - box.nw),
        ny: clamp(active.ny + dy, 0, 1 - box.nh),
      });
      return;
    }
    const next = resizeBox(active, dx, dy);
    if (active.target === "stamp") {
      onPatchStamp(active.id, { nx: next.nx, ny: next.ny, nw: next.nw, nh: next.nh });
      return;
    }
    onPatch(active.id, { nx: next.nx, ny: next.ny, nw: next.nw, nh: next.nh });
  }

  function onDragUp() {
    drag.current = null;
  }

  return (
    <div
      ref={stageRef}
      role="img"
      aria-label={`Page ${page + 1}`}
      onClick={placeBox}
      onPointerDown={onStagePointerDown}
      onPointerMove={onStagePointerMove}
      onPointerUp={onStagePointerUp}
      className={cn(
        "relative mx-auto max-h-[70vh] w-max max-w-full rounded-md bg-card shadow-[var(--shadow-page)]",
        highlightMode || signMode || drawMode
          ? "cursor-crosshair"
          : textMode
            ? "cursor-text"
            : "cursor-default",
      )}
    >
      {preview ? (
        <img
          src={preview}
          alt=""
          draggable={false}
          className="pointer-events-none block max-h-[70vh] w-auto max-w-full overflow-hidden rounded-md"
        />
      ) : (
        <div className="page-skeleton aspect-[8.5/11] h-[70vh] max-h-[70vh] w-auto rounded-md" />
      )}

      {pageMarks.map((mark) => {
        const selected = mark.id === selectedMarkId;
        return (
          <button
            key={mark.id}
            type="button"
            aria-label="Highlight"
            onClick={(event) => {
              event.stopPropagation();
              onSelectMark(mark.id);
            }}
            className={cn(
              "absolute bg-mark/50",
              selected ? "z-10 ring-2 ring-foreground" : "z-0",
            )}
            style={{
              left: `${mark.nx * 100}%`,
              top: `${mark.ny * 100}%`,
              width: `${mark.nw * 100}%`,
              height: `${mark.nh * 100}%`,
            }}
          />
        );
      })}
      {draft && draft.nw > 0 && draft.nh > 0 && (
        <div
          className="pointer-events-none absolute z-10 bg-mark/40 ring-1 ring-foreground/40"
          style={{
            left: `${draft.nx * 100}%`,
            top: `${draft.ny * 100}%`,
            width: `${draft.nw * 100}%`,
            height: `${draft.nh * 100}%`,
          }}
        />
      )}

      {(textMode || highlightMode) &&
        lines.map((line) => {
          if (textMode && covered.has(line.id)) return null;
          return (
            <button
              key={line.id}
              type="button"
              title={highlightMode ? "Highlight this line" : "Edit this text"}
              onClick={(event) => {
                event.stopPropagation();
                if (highlightMode) highlightLine(line);
                else editLine(line);
              }}
              className="absolute rounded-xs border border-transparent bg-accent/0 hover:border-accent hover:bg-accent/15"
              style={{
                left: `${line.nx * 100}%`,
                top: `${line.ny * 100}%`,
                width: `${line.nw * 100}%`,
                height: `${line.nh * 100}%`,
                minHeight: "1.1rem",
              }}
            >
              <span className="sr-only">
                {highlightMode ? "Highlight" : "Edit"} “{line.str}”
              </span>
            </button>
          );
        })}

      <svg
        className={cn(
          "absolute inset-0 size-full text-foreground",
          drawMode ? "z-20 touch-none" : "pointer-events-none",
        )}
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        aria-hidden={!drawMode}
        onPointerDown={onDrawPointerDown}
        onPointerMove={onDrawPointerMove}
        onPointerUp={onDrawPointerUp}
      >
        {pageStrokes.map((stroke) => (
          <path
            key={stroke.id}
            d={pointsToPath(stroke.points)}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            strokeWidth={Math.max(2, stroke.width)}
          />
        ))}
        {livePoints.length > 0 && (
          <path
            d={pointsToPath(livePoints)}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            strokeWidth={Math.max(2, penWidth)}
          />
        )}
      </svg>

      {pageStamps.map((stamp) => {
        const selected = stamp.id === selectedStampId;
        return (
          <div
            key={stamp.id}
            onPointerDown={(event) => onStampPointerDown(event, stamp)}
            onPointerMove={onDragMove}
            onPointerUp={onDragUp}
            onClick={(event) => event.stopPropagation()}
            className={cn(
              "absolute bg-card/40",
              selected ? "z-10 ring-2 ring-foreground" : "ring-1 ring-accent/40",
            )}
            style={{
              left: `${stamp.nx * 100}%`,
              top: `${stamp.ny * 100}%`,
              width: `${stamp.nw * 100}%`,
              height: `${stamp.nh * 100}%`,
            }}
          >
            {stamp.kind === "type" ? (
              <p className="flex size-full items-center justify-center px-2 font-display text-lg italic leading-none">
                {stamp.text}
              </p>
            ) : (
              <svg className="size-full text-foreground" viewBox="0 0 1 1" preserveAspectRatio="none">
                {stamp.paths.map((path, index) => (
                  <path
                    key={index}
                    d={pointsToPath(path)}
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    strokeWidth="2"
                  />
                ))}
              </svg>
            )}
            {selected && (
              <button
                type="button"
                data-move
                aria-label="Move signature"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  drag.current = {
                    kind: "move",
                    target: "stamp",
                    id: stamp.id,
                    ox: event.clientX,
                    oy: event.clientY,
                    nx: stamp.nx,
                    ny: stamp.ny,
                    dragging: true,
                  };
                  onSelectStamp(stamp.id);
                }}
                onPointerMove={onDragMove}
                onPointerUp={onDragUp}
                className="absolute -top-11 left-1/2 z-30 flex h-11 w-16 -translate-x-1/2 cursor-grab items-center justify-center touch-none active:cursor-grabbing"
              >
                <span className="flex items-center justify-center rounded-sm bg-primary px-2 py-1 text-primary-foreground shadow-[var(--shadow-border)]">
                  <GripHorizontal className="size-4" />
                </span>
              </button>
            )}
            {selected &&
              HANDLES.map((handle) => (
                <button
                  key={handle.id}
                  type="button"
                  data-handle={handle.id}
                  aria-label={handle.label}
                  onPointerDown={(event) => onStampHandlePointerDown(event, stamp, handle.id)}
                  onPointerMove={onDragMove}
                  onPointerUp={onDragUp}
                  className={cn(
                    "absolute z-20 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center touch-none",
                    handle.className,
                  )}
                >
                  <span className="block size-3 rounded-xs bg-primary shadow-[var(--shadow-border)] ring-2 ring-card" />
                </button>
              ))}
          </div>
        );
      })}

      {pageBoxes.map((box) => {
        const selected = box.id === selectedId;
        return (
          <div
            key={box.id}
            onPointerDown={(event) => onBoxPointerDown(event, box)}
            onPointerMove={onDragMove}
            onPointerUp={onDragUp}
            onClick={(event) => event.stopPropagation()}
            className={cn(
              "absolute",
              selected ? "z-10 ring-2 ring-foreground" : "ring-1 ring-accent/50",
            )}
            style={{
              left: `${box.nx * 100}%`,
              top: `${box.ny * 100}%`,
              width: `${box.nw * 100}%`,
              height: `${box.nh * 100}%`,
            }}
          >
            <textarea
              value={box.text}
              autoFocus={selected}
              placeholder="Type here"
              aria-label="Text box"
              onFocus={() => onSelect(box.id)}
              onChange={(event) => onPatch(box.id, { text: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Escape") onSelect(null);
                if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
                  event.preventDefault();
                  onPatch(box.id, { bold: !box.bold });
                }
                if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "i") {
                  event.preventDefault();
                  onPatch(box.id, { italic: !box.italic });
                }
                if ((event.key === "Backspace" || event.key === "Delete") && box.text === "") {
                  event.preventDefault();
                  onRemove(box.id);
                }
              }}
              className={cn(
                "size-full resize-none bg-card/80 px-1 py-0.5 leading-tight text-foreground outline-none placeholder:text-muted-foreground",
                box.font === "serif" ? "font-display" : "font-sans",
                box.bold && "font-bold",
                box.italic && "italic",
                box.size >= 28 ? "text-3xl" : box.size >= 20 ? "text-xl" : box.size >= 14 ? "text-base" : "text-sm",
                !selected && "pointer-events-none",
              )}
            />
            {selected && (
              <button
                type="button"
                data-move
                aria-label="Move text box"
                title="Drag to move"
                onPointerDown={(event) => onMovePointerDown(event, box)}
                onPointerMove={onDragMove}
                onPointerUp={onDragUp}
                className="absolute -top-11 left-1/2 z-30 flex h-11 w-16 -translate-x-1/2 cursor-grab items-center justify-center touch-none active:cursor-grabbing"
              >
                <span className="flex items-center justify-center rounded-sm bg-primary px-2 py-1 text-primary-foreground shadow-[var(--shadow-border)]">
                  <GripHorizontal className="size-4" />
                </span>
              </button>
            )}
            {selected &&
              HANDLES.map((handle) => (
                <button
                  key={handle.id}
                  type="button"
                  data-handle={handle.id}
                  aria-label={handle.label}
                  onPointerDown={(event) => onHandlePointerDown(event, box, handle.id)}
                  onPointerMove={onDragMove}
                  onPointerUp={onDragUp}
                  className={cn(
                    "absolute z-20 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center touch-none",
                    handle.className,
                  )}
                >
                  <span className="block size-3 rounded-xs bg-primary shadow-[var(--shadow-border)] ring-2 ring-card" />
                </button>
              ))}
          </div>
        );
      })}
    </div>
  );
}

function resizeBox(
  start: Extract<Drag, { kind: "resize" }>,
  dx: number,
  dy: number,
) {
  let nx = start.nx;
  let ny = start.ny;
  let nw = start.nw;
  let nh = start.nh;
  const { handle } = start;

  if (handle.includes("e")) nw = start.nw + dx;
  if (handle.includes("s")) nh = start.nh + dy;
  if (handle.includes("w")) {
    nw = start.nw - dx;
    nx = start.nx + dx;
  }
  if (handle.includes("n")) {
    nh = start.nh - dy;
    ny = start.ny + dy;
  }

  if (nw < MIN_W) {
    if (handle.includes("w")) nx = start.nx + start.nw - MIN_W;
    nw = MIN_W;
  }
  if (nh < MIN_H) {
    if (handle.includes("n")) ny = start.ny + start.nh - MIN_H;
    nh = MIN_H;
  }
  if (nx < 0) {
    nw += nx;
    nx = 0;
  }
  if (ny < 0) {
    nh += ny;
    ny = 0;
  }
  if (nx + nw > 1) nw = 1 - nx;
  if (ny + nh > 1) nh = 1 - ny;
  return {
    nx,
    ny,
    nw: Math.max(MIN_W, nw),
    nh: Math.max(MIN_H, nh),
  };
}

function pointsToPath(points: Array<{ nx: number; ny: number }>) {
  if (points.length === 0) return "";
  if (points.length === 1 && points[0]) {
    return `M ${points[0].nx} ${points[0].ny} L ${points[0].nx + 0.0008} ${points[0].ny}`;
  }
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.nx} ${point.ny}`).join(" ");
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
