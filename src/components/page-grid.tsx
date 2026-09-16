import { useRef } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PdfDoc } from "@/lib/pdf";

interface PageGridProps {
  doc: PdfDoc;
  selected: number[];
  onToggle: (page: number, rangeFrom: number | null) => void;
  selectable?: boolean;
}

export function PageGrid({ doc, selected, onToggle, selectable = true }: PageGridProps) {
  const last = useRef<number | null>(null);
  const chosen = new Set(selected);

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: doc.pageCount }, (_, index) => {
        const isOn = chosen.has(index);
        const thumb = doc.thumbs[index];
        return (
          <li key={`${doc.id}-${index}`}>
            <button
              type="button"
              disabled={!selectable}
              aria-pressed={isOn}
              aria-label={`Page ${index + 1}${isOn ? ", selected" : ""}`}
              onClick={(event) => {
                const rangeFrom = event.shiftKey ? last.current : null;
                onToggle(index, rangeFrom);
                last.current = index;
              }}
              className={cn(
                "group relative w-full overflow-hidden rounded-md bg-card text-left shadow-[var(--shadow-page)] transition-[box-shadow,transform] duration-150 ease-out active:scale-[0.98]",
                isOn && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
              )}
            >
              <span className="relative block aspect-[8.5/11] bg-muted">
                {thumb ? (
                  <img
                    src={thumb}
                    alt=""
                    draggable={false}
                    className="absolute inset-0 size-full object-cover outline outline-1 -outline-offset-1 outline-foreground/10"
                  />
                ) : (
                  <span className="page-skeleton absolute inset-0" />
                )}
                <span className="absolute bottom-2 left-2 rounded-full bg-primary/90 px-2 py-0.5 font-mono text-xs tabular-nums text-primary-foreground">
                  {index + 1}
                </span>
                {selectable && (
                  <span
                    className={cn(
                      "absolute top-2 right-2 flex size-6 items-center justify-center rounded-full border transition-[background-color,opacity,border-color] duration-150 ease-out",
                      isOn
                        ? "border-foreground bg-primary text-primary-foreground"
                        : "border-foreground/20 bg-card/80 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
                    )}
                  >
                    {isOn ? <Check className="size-3.5" /> : null}
                  </span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
