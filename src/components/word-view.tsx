import { useRef, useState } from "react";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { hydrateThumbs } from "@/lib/add-pdfs";
import { downloadBytes, loadPdfBytes, safeFilename } from "@/lib/pdf";
import { isWordFile, wordFileToPdf } from "@/lib/word-to-pdf";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/store/workspace";

export function WordView() {
  const docs = useWorkspace((s) => s.docs);
  const setBusy = useWorkspace((s) => s.setBusy);
  const addDocs = useWorkspace((s) => s.addDocs);
  const setActive = useWorkspace((s) => s.setActive);
  const setTool = useWorkspace((s) => s.setTool);
  const inputRef = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const [over, setOver] = useState(false);

  async function convert(list: FileList | File[]) {
    const files = Array.from(list);
    const words = files.filter(isWordFile);
    if (words.length === 0) {
      toast.error("Drop a Word document (.docx).");
      return;
    }
    setBusy(true, "Converting to PDF…");
    const made = [];
    try {
      for (const file of words) {
        try {
          const bytes = await wordFileToPdf(file);
          const base = file.name.replace(/\.docx?$/i, "") || "Document";
          made.push(await loadPdfBytes(bytes, `${base}.pdf`));
        } catch (err) {
          console.error(err);
          toast.error(err instanceof Error ? err.message : `Couldn’t convert ${file.name}.`);
        }
      }
      if (made.length === 0) return;
      addDocs(made);
      setActive(made[0]!.id);
      for (const doc of made) hydrateThumbs(doc);
      toast.success(made.length === 1 ? `Converted ${made[0]!.name}` : `Converted ${made.length} documents`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
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
          if (event.dataTransfer.files.length) void convert(event.dataTransfer.files);
        }}
        className={cn(
          "relative flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center transition-[border-color,background-color] duration-150 ease-out",
          over ? "border-foreground bg-card" : "border-border bg-desk/80",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".doc,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
          multiple
          className="sr-only"
          aria-label="Choose a Word document"
          onChange={(event) => {
            if (event.target.files) void convert(event.target.files);
            event.target.value = "";
          }}
        />
        <span className="mb-4 flex size-14 items-center justify-center rounded-md bg-secondary text-foreground">
          <FileText className="size-6" />
        </span>
        <p className="font-display text-2xl text-foreground">Drop a Word document</p>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          .docx turns into a PDF on this device. Then edit it, split it, or merge it with the other tools.
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-5 h-11 rounded-sm bg-primary px-4 text-sm font-medium text-primary-foreground transition-[scale,background-color] duration-150 ease-out hover:bg-ink-soft active:scale-[0.96]"
        >
          Choose Word files
        </button>
      </div>

      {docs.length > 0 && (
        <ol className="flex flex-col gap-2">
          {docs.map((doc) => (
            <li key={doc.id} className="flex items-center gap-3 rounded-lg bg-card p-3 shadow-[var(--shadow-border)]">
              <span className="relative h-16 w-12 shrink-0 overflow-hidden rounded-xs bg-muted">
                {doc.thumbs[0] ? (
                  <img src={doc.thumbs[0]} alt="" className="size-full object-cover" />
                ) : (
                  <span className="page-skeleton absolute inset-0" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{doc.name}</p>
                <p className="text-sm tabular-nums text-muted-foreground">
                  {doc.pageCount} page{doc.pageCount === 1 ? "" : "s"}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setActive(doc.id);
                  setTool("edit");
                }}
              >
                Edit
              </Button>
              <Button onClick={() => downloadBytes(doc.bytes, `${safeFilename(doc.name)}.pdf`)}>Save PDF</Button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
