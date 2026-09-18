import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/utils";
import { extractPageLines, type TextBox, type TextFont, type TextLine } from "@/lib/pdf-text";
import { renderPageImage } from "@/lib/pdf-render";

interface PageStageProps {
  bytes: Uint8Array;
  page: number;
  fallback?: string;
  textMode: boolean;
  boxes: TextBox[];
  selectedId: string | null;
  font: TextFont;
  size: number;
  onSelect: (id: string | null) => void;
  onAdd: (box: TextBox) => void;
  onPatch: (id: string, patch: Partial<TextBox>) => void;
  onRemove: (id: string) => void;
}

export function PageStage({
  bytes,
  page,
  fallback,
  textMode,
  boxes,
  selectedId,
  font,
  size,
  onSelect,
  onAdd,
  onPatch,
  onRemove,
}: PageStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState(fallback ?? "");
  const [lines, setLines] = useState<TextLine[]>([]);
  const drag = useRef<{ id: string; ox: number; oy: number; nx: number; ny: number } | null>(null);

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
    if (!textMode) {
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
  }, [bytes, page, textMode]);

  const pageBoxes = boxes.filter((box) => box.page === page);
  const covered = new Set(
    pageBoxes.map((box) => box.sourceId).filter((id): id is string => Boolean(id)),
  );

  function pointFromEvent(event: { clientX: number; clientY: number }) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width < 1 || rect.height < 1) return null;
    return {
      nx: clamp01((event.clientX - rect.left) / rect.width),
      ny: clamp01((event.clientY - rect.top) / rect.height),
    };
  }

  function placeBox(event: React.MouseEvent<HTMLDivElement>) {
    if (!textMode) return;
    if (event.target !== event.currentTarget) return;
    const point = pointFromEvent(event);
    if (!point) return;
    const nh = Math.max(0.028, (size * 1.45) / 792);
    const nw = 0.4;
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
      replace: false,
    };
    onAdd(box);
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
      nw: Math.max(line.nw, 0.08),
      nh: Math.max(line.nh, 0.02),
      text: line.str,
      size: Math.round(line.size) || size,
      font: "serif",
      replace: true,
      sourceId: line.id,
    };
    onAdd(box);
  }

  function onBoxPointerDown(event: ReactPointerEvent<HTMLDivElement>, box: TextBox) {
    if (!textMode) return;
    if ((event.target as HTMLElement).tagName === "TEXTAREA") return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: box.id, ox: event.clientX, oy: event.clientY, nx: box.nx, ny: box.ny };
    onSelect(box.id);
  }

  function onBoxPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const active = drag.current;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!active || !rect) return;
    const dx = (event.clientX - active.ox) / rect.width;
    const dy = (event.clientY - active.oy) / rect.height;
    const box = pageBoxes.find((item) => item.id === active.id);
    if (!box) return;
    onPatch(active.id, {
      nx: clamp01(active.nx + dx, 1 - box.nw),
      ny: clamp01(active.ny + dy, 1 - box.nh),
    });
  }

  function onBoxPointerUp() {
    drag.current = null;
  }

  return (
    <div
      ref={stageRef}
      role="img"
      aria-label={`Page ${page + 1}`}
      onClick={placeBox}
      className={cn(
        "relative mx-auto max-h-[70vh] w-max max-w-full overflow-hidden rounded-md bg-card shadow-[var(--shadow-page)]",
        textMode ? "cursor-text" : "cursor-default",
      )}
    >
      {preview ? (
        <img
          src={preview}
          alt=""
          draggable={false}
          className="pointer-events-none block max-h-[70vh] w-auto max-w-full"
        />
      ) : (
        <div className="page-skeleton aspect-[8.5/11] h-[70vh] max-h-[70vh] w-auto" />
      )}

      {textMode &&
        lines.map((line) => {
          if (covered.has(line.id)) return null;
          return (
            <button
              key={line.id}
              type="button"
              title="Edit this text"
              onClick={(event) => {
                event.stopPropagation();
                editLine(line);
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
              <span className="sr-only">Edit “{line.str}”</span>
            </button>
          );
        })}

      {pageBoxes.map((box) => {
        const selected = box.id === selectedId;
        return (
          <div
            key={box.id}
            onPointerDown={(event) => onBoxPointerDown(event, box)}
            onPointerMove={onBoxPointerMove}
            onPointerUp={onBoxPointerUp}
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
                if ((event.key === "Backspace" || event.key === "Delete") && box.text === "") {
                  event.preventDefault();
                  onRemove(box.id);
                }
              }}
              className={cn(
                "size-full resize-none bg-card/80 px-1 py-0.5 leading-tight text-foreground outline-none placeholder:text-muted-foreground",
                box.font === "serif" ? "font-display" : "font-sans",
                box.size >= 28 ? "text-3xl" : box.size >= 20 ? "text-xl" : box.size >= 14 ? "text-base" : "text-sm",
              )}
            />
          </div>
        );
      })}
    </div>
  );
}

function clamp01(n: number, max = 1) {
  return Math.min(max, Math.max(0, n));
}
