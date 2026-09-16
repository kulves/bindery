import { useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronUp,
  Highlighter,
  ImageIcon,
  PenTool,
  RotateCw,
  Stamp,
  Trash2,
  Type,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropZone } from "@/components/drop-zone";
import { addSample, rehydrate } from "@/lib/add-pdfs";
import {
  downloadBytes,
  getPageCount,
  removePages,
  reorderPages,
  rotatePage,
  safeFilename,
} from "@/lib/pdf";
import { cn } from "@/lib/utils";
import { useActiveDoc, useWorkspace } from "@/store/workspace";

const COMING = [
  { icon: Type, label: "Text" },
  { icon: Highlighter, label: "Highlight" },
  { icon: PenTool, label: "Draw" },
  { icon: ImageIcon, label: "Image" },
  { icon: Stamp, label: "Sign" },
];

export function EditorView() {
  const docs = useWorkspace((s) => s.docs);
  const doc = useActiveDoc();
  const outputName = useWorkspace((s) => s.outputName);
  const busy = useWorkspace((s) => s.busy);
  const setActive = useWorkspace((s) => s.setActive);
  const setOutputName = useWorkspace((s) => s.setOutputName);
  const setBusy = useWorkspace((s) => s.setBusy);
  const replaceDoc = useWorkspace((s) => s.replaceDoc);
  const [focus, setFocus] = useState(0);

  if (docs.length === 0) {
    return (
      <div className="stagger-in mx-auto flex w-full max-w-3xl flex-col gap-4">
        <DropZone
          multiple={false}
          title="Drop a PDF to edit pages"
          hint="Reorder, rotate, and remove pages now. Annotating, type, and images ship in the full editor."
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
  const thumb = doc.thumbs[page];

  async function mutate(label: string, nextBytes: Promise<Uint8Array>, nextFocus = page) {
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

  function move(dir: -1 | 1) {
    const next = page + dir;
    if (next < 0 || next >= doc.pageCount) return;
    const order = Array.from({ length: doc.pageCount }, (_, i) => i);
    const [item] = order.splice(page, 1);
    order.splice(next, 0, item);
    void mutate("Reordering…", reorderPages(doc.bytes, order), next);
  }

  function onSave() {
    const name = safeFilename(outputName || `${doc.name}-edited`) + ".pdf";
    downloadBytes(doc.bytes, name);
    toast.success(`Saved ${name}`);
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
            label="Rotate 90°"
            onClick={() => void mutate("Rotating…", rotatePage(doc.bytes, page))}
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
              void mutate("Removing page…", removePages(doc.bytes, [page]), Math.max(0, page - 1))
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
                onClick={() => setFocus(index)}
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
                <span className="absolute bottom-1 left-1 rounded-full bg-primary/90 px-1.5 font-mono text-[10px] tabular-nums text-primary-foreground">
                  {index + 1}
                </span>
              </button>
            </li>
          ))}
        </ol>

        <figure className="flex min-h-[50vh] items-center justify-center rounded-xl bg-desk p-4 shadow-[var(--shadow-border)] sm:p-8">
          <div className="relative w-full max-w-xl overflow-hidden rounded-md bg-card shadow-[var(--shadow-page)]">
            <div className="relative aspect-[8.5/11]">
              {thumb ? (
                <img
                  src={thumb}
                  alt={`Page ${page + 1}`}
                  className="absolute inset-0 size-full object-contain outline outline-1 -outline-offset-1 outline-foreground/10"
                />
              ) : (
                <span className="page-skeleton absolute inset-0" />
              )}
            </div>
          </div>
        </figure>
      </div>

      <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-xl bg-card p-4 shadow-[var(--shadow-border)] sm:flex-row sm:items-center">
        <p className="text-sm tabular-nums text-muted-foreground sm:flex-1">
          Page {page + 1} of {doc.pageCount}
        </p>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
          File name
          <Input
            value={outputName}
            placeholder={`${doc.name}-edited`}
            onChange={(event) => setOutputName(event.target.value)}
          />
        </label>
        <Button size="lg" className="w-full sm:w-auto" disabled={busy} onClick={onSave}>
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
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button variant="ghost" disabled={disabled} onClick={onClick} aria-label={label} className="px-3">
      {children}
    </Button>
  );
}
