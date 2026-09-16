import { useRef } from "react";
import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropZone } from "@/components/drop-zone";
import { addPdfFiles, addSample } from "@/lib/add-pdfs";
import { downloadBytes, mergeDocuments, safeFilename } from "@/lib/pdf";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/store/workspace";

export function MergeView() {
  const docs = useWorkspace((s) => s.docs);
  const outputName = useWorkspace((s) => s.outputName);
  const busy = useWorkspace((s) => s.busy);
  const setOutputName = useWorkspace((s) => s.setOutputName);
  const setBusy = useWorkspace((s) => s.setBusy);
  const removeDoc = useWorkspace((s) => s.removeDoc);
  const moveDoc = useWorkspace((s) => s.moveDoc);
  const reorderDoc = useWorkspace((s) => s.reorderDoc);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragId = useRef<string | null>(null);

  const pageTotal = docs.reduce((sum, doc) => sum + doc.pageCount, 0);

  async function onMerge() {
    if (docs.length < 2) {
      toast.error("Add at least two PDFs to bind.");
      return;
    }
    setBusy(true, "Binding documents…");
    try {
      const bytes = await mergeDocuments(docs);
      const name = safeFilename(outputName || "bound") + ".pdf";
      downloadBytes(bytes, name);
      toast.success(`Saved ${name} · ${pageTotal} pages`);
    } catch (err) {
      console.error(err);
      toast.error("Couldn’t merge those files.");
    } finally {
      setBusy(false);
    }
  }

  if (docs.length === 0) {
    return (
      <div className="stagger-in mx-auto flex w-full max-w-3xl flex-col gap-4">
        <DropZone
          title="Drop PDFs to bind"
          hint="Files stay on this device. Reorder them after they land, then download one bound document."
        />
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="outline" onClick={() => void addSample("report")}>
            Try a 6-page sample
          </Button>
          <Button variant="ghost" onClick={() => void addSample("appendix")}>
            Add a 3-page appendix
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Merge
          </p>
          <h2 className="font-display text-3xl leading-tight text-foreground">Documents to bind</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {docs.length} file{docs.length === 1 ? "" : "s"} · {pageTotal} pages in order
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="sr-only"
            onChange={(event) => {
              if (event.target.files) void addPdfFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <Button variant="outline" onClick={() => inputRef.current?.click()}>
            <Plus />
            Add PDFs
          </Button>
          <Button variant="outline" onClick={() => void addSample("appendix")}>
            Add sample
          </Button>
        </div>
      </header>

      <ol className="flex flex-col gap-2">
        {docs.map((doc, index) => (
          <li
            key={doc.id}
            draggable
            onDragStart={() => {
              dragId.current = doc.id;
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (dragId.current) reorderDoc(dragId.current, doc.id);
              dragId.current = null;
            }}
            className="flex items-center gap-3 rounded-lg bg-card p-3 shadow-[var(--shadow-border)]"
          >
            <span className="hidden text-muted-foreground sm:flex" aria-hidden="true">
              <GripVertical className="size-4" />
            </span>
            <span className="relative hidden h-16 w-12 shrink-0 overflow-hidden rounded-xs bg-muted sm:block">
              {doc.thumbs[0] ? (
                <img
                  src={doc.thumbs[0]}
                  alt=""
                  className="size-full object-cover outline outline-1 -outline-offset-1 outline-foreground/10"
                />
              ) : (
                <span className="page-skeleton absolute inset-0" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{doc.name}</p>
              <p className="text-sm tabular-nums text-muted-foreground">
                {index + 1} of {docs.length} · {doc.pageCount} page{doc.pageCount === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Move up"
                disabled={index === 0}
                onClick={() => moveDoc(doc.id, -1)}
              >
                <ChevronUp />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Move down"
                disabled={index === docs.length - 1}
                onClick={() => moveDoc(doc.id, 1)}
              >
                <ChevronDown />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${doc.name}`}
                onClick={() => removeDoc(doc.id)}
              >
                <Trash2 />
              </Button>
            </div>
          </li>
        ))}
      </ol>

      <BoundStrip />

      <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-xl bg-card p-4 shadow-[var(--shadow-border)] sm:flex-row sm:items-center">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
          File name
          <Input
            value={outputName}
            placeholder="bound"
            onChange={(event) => setOutputName(event.target.value)}
            aria-label="Output file name"
          />
        </label>
        <Button
          size="lg"
          className="w-full sm:w-auto"
          disabled={busy || docs.length < 2}
          onClick={() => void onMerge()}
        >
          Merge & download
        </Button>
      </div>
    </div>
  );
}

function BoundStrip() {
  const docs = useWorkspace((s) => s.docs);
  const pages = docs.flatMap((doc) =>
    Array.from({ length: doc.pageCount }, (_, i) => ({
      key: `${doc.id}-${i}`,
      thumb: doc.thumbs[i],
      label: `${doc.name} · ${i + 1}`,
    })),
  );

  return (
    <section>
      <h3 className="mb-3 text-sm font-medium text-muted-foreground">Bound sequence</h3>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {pages.map((page, index) => (
          <figure key={page.key} className="w-16 shrink-0">
            <div
              className={cn(
                "relative aspect-[8.5/11] overflow-hidden rounded-xs bg-muted shadow-[var(--shadow-page)]",
              )}
            >
              {page.thumb ? (
                <img src={page.thumb} alt="" className="size-full object-cover" />
              ) : (
                <span className="page-skeleton absolute inset-0" />
              )}
            </div>
            <figcaption className="mt-1 truncate text-center font-mono text-[10px] tabular-nums text-muted-foreground">
              {index + 1}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
