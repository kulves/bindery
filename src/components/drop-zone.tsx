import { useRef, useState } from "react";
import { FilePlus2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { addPdfFiles } from "@/lib/add-pdfs";

interface DropZoneProps {
  compact?: boolean;
  multiple?: boolean;
  title: string;
  hint: string;
  className?: string;
}

export function DropZone({ compact, multiple = true, title, hint, className }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const [over, setOver] = useState(false);

  return (
    <div
      onDragEnter={(event) => {
        event.preventDefault();
        depth.current += 1;
        setOver(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        event.preventDefault();
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        depth.current = 0;
        setOver(false);
        void addPdfFiles(event.dataTransfer.files);
      }}
      className={cn(
        "relative flex flex-col items-center justify-center text-center rounded-xl border border-dashed transition-[border-color,background-color,box-shadow] duration-150 ease-out",
        over ? "border-foreground bg-card" : "border-border bg-desk/80",
        compact ? "min-h-36 px-5 py-6" : "min-h-72 px-6 py-12",
        className,
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple={multiple}
        className="sr-only"
        onChange={(event) => {
          if (event.target.files) void addPdfFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <span
        className={cn(
          "mb-4 flex items-center justify-center rounded-md bg-secondary text-foreground",
          compact ? "size-11" : "size-14",
        )}
      >
        <FilePlus2 className={compact ? "size-5" : "size-6"} />
      </span>
      <p className={cn("font-display text-foreground", compact ? "text-lg" : "text-2xl")}>{title}</p>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{hint}</p>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="mt-5 h-11 rounded-sm bg-primary px-4 text-sm font-medium text-primary-foreground transition-[scale,background-color] duration-150 ease-out hover:bg-ink-soft active:scale-[0.96]"
      >
        Choose PDFs
      </button>
    </div>
  );
}
