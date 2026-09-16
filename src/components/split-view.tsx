import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropZone } from "@/components/drop-zone";
import { PageGrid } from "@/components/page-grid";
import { addSample } from "@/lib/add-pdfs";
import {
  downloadBlob,
  downloadBytes,
  extractPages,
  parseRangeGroups,
  safeFilename,
  splitEvery,
  zipPdfs,
  type SplitMode,
} from "@/lib/pdf";
import { cn } from "@/lib/utils";
import { useActiveDoc, useWorkspace } from "@/store/workspace";

const MODES: Array<{ id: SplitMode; title: string; hint: string }> = [
  { id: "extract", title: "Extract selected", hint: "One new PDF from the pages you pick" },
  { id: "ranges", title: "Split by ranges", hint: "Each range becomes its own file" },
  { id: "every", title: "Every N pages", hint: "Chop the document into even parts" },
  { id: "each", title: "Each page", hint: "One PDF per page, packed as a zip" },
];

export function SplitView() {
  const docs = useWorkspace((s) => s.docs);
  const doc = useActiveDoc();
  const selectedMap = useWorkspace((s) => s.selected);
  const splitMode = useWorkspace((s) => s.splitMode);
  const rangeText = useWorkspace((s) => s.rangeText);
  const everyN = useWorkspace((s) => s.everyN);
  const outputName = useWorkspace((s) => s.outputName);
  const busy = useWorkspace((s) => s.busy);
  const setActive = useWorkspace((s) => s.setActive);
  const togglePage = useWorkspace((s) => s.togglePage);
  const selectAll = useWorkspace((s) => s.selectAll);
  const clearSelected = useWorkspace((s) => s.clearSelected);
  const setSplitMode = useWorkspace((s) => s.setSplitMode);
  const setRangeText = useWorkspace((s) => s.setRangeText);
  const setEveryN = useWorkspace((s) => s.setEveryN);
  const setOutputName = useWorkspace((s) => s.setOutputName);
  const setBusy = useWorkspace((s) => s.setBusy);

  const selected = doc ? (selectedMap[doc.id] ?? []) : [];
  const range = doc ? parseRangeGroups(rangeText, doc.pageCount) : { groups: [] as number[][] };

  async function onSplit() {
    if (!doc) return;
    if (splitMode === "extract" && selected.length === 0) {
      toast.error("Select at least one page.");
      return;
    }
    if (splitMode === "ranges" && (range.error || range.groups.length === 0)) {
      toast.error(range.error ?? "Enter a valid range.");
      return;
    }

    const base = safeFilename(outputName || `${doc.name}-split`);
    setBusy(true, "Splitting…");
    try {
      if (splitMode === "extract") {
        const bytes = await extractPages(doc.bytes, selected);
        downloadBytes(bytes, `${base}.pdf`);
        toast.success(`Saved ${selected.length} page${selected.length === 1 ? "" : "s"}`);
        return;
      }
      if (splitMode === "ranges") {
        const files = [];
        for (const [i, group] of range.groups.entries()) {
          const indices = group.map((n) => n - 1);
          const bytes = await extractPages(doc.bytes, indices);
          const first = group[0] ?? i + 1;
          const last = group[group.length - 1] ?? first;
          const label = group.length === 1 ? `p${first}` : `p${first}-${last}`;
          files.push({ name: `${base}-${label}.pdf`, bytes });
        }
        const only = files[0];
        if (files.length === 1 && only) {
          downloadBytes(only.bytes, only.name);
        } else {
          downloadBlob(await zipPdfs(files), `${base}.zip`);
        }
        toast.success(`Split into ${files.length} file${files.length === 1 ? "" : "s"}`);
        return;
      }
      const size = splitMode === "each" ? 1 : everyN;
      const parts = await splitEvery(doc.bytes, size);
      const files = parts.map((bytes, i) => ({
        name: `${base}-part-${String(i + 1).padStart(2, "0")}.pdf`,
        bytes,
      }));
      const only = files[0];
      if (files.length === 1 && only) {
        downloadBytes(only.bytes, only.name);
      } else {
        downloadBlob(await zipPdfs(files), `${base}.zip`);
      }
      toast.success(`Split into ${files.length} file${files.length === 1 ? "" : "s"}`);
    } catch (err) {
      console.error(err);
      toast.error("Couldn’t split that PDF.");
    } finally {
      setBusy(false);
    }
  }

  if (docs.length === 0) {
    return (
      <div className="stagger-in mx-auto flex w-full max-w-3xl flex-col gap-4">
        <DropZone
          multiple={false}
          title="Drop a PDF to split"
          hint="Extract pages, cut by range, or save every page as its own file. Nothing is uploaded."
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

  const canRun =
    splitMode === "extract"
      ? selected.length > 0
      : splitMode === "ranges"
        ? !range.error && range.groups.length > 0
        : splitMode === "every"
          ? everyN >= 1
          : true;

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <section className="min-w-0">
        <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Split</p>
            <h2 className="font-display text-3xl leading-tight">{doc.name}</h2>
            <p className="mt-1 text-sm tabular-nums text-muted-foreground">
              {doc.pageCount} pages
              {selected.length > 0 ? ` · ${selected.length} selected` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => selectAll(doc.id)}>
              Select all
            </Button>
            <Button variant="ghost" onClick={() => clearSelected(doc.id)}>
              Clear
            </Button>
          </div>
        </header>
        {docs.length > 1 && (
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {docs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActive(item.id)}
                className={cn(
                  "h-11 shrink-0 rounded-sm px-3 text-sm transition-[background-color] duration-150 ease-out",
                  item.id === doc.id ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground",
                )}
              >
                {item.name}
              </button>
            ))}
          </div>
        )}
        <PageGrid
          doc={doc}
          selected={selected}
          onToggle={(page, rangeFrom) => togglePage(doc.id, page, rangeFrom)}
        />
      </section>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
          <p className="mb-3 text-sm font-medium">How to split</p>
          <div className="flex flex-col gap-2">
            {MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setSplitMode(mode.id)}
                className={cn(
                  "rounded-md px-3 py-3 text-left transition-[background-color,box-shadow] duration-150 ease-out",
                  splitMode === mode.id ? "bg-primary text-primary-foreground" : "bg-desk hover:bg-secondary",
                )}
              >
                <span className="block text-sm font-medium">{mode.title}</span>
                <span
                  className={cn(
                    "mt-0.5 block text-xs",
                    splitMode === mode.id ? "text-primary-foreground/70" : "text-muted-foreground",
                  )}
                >
                  {mode.hint}
                </span>
              </button>
            ))}
          </div>

          {splitMode === "ranges" && (
            <label className="mt-4 flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Ranges
              <Input
                value={rangeText}
                onChange={(event) => setRangeText(event.target.value)}
                placeholder="1-3, 5, 8-10"
                aria-invalid={Boolean(range.error)}
              />
              <span className={range.error ? "text-destructive" : ""}>
                {range.error ?? "Comma-separated. Each range is a file."}
              </span>
            </label>
          )}

          {splitMode === "every" && (
            <label className="mt-4 flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Pages per file
              <Input
                type="number"
                min={1}
                max={doc.pageCount}
                value={everyN}
                onChange={(event) => setEveryN(Math.max(1, Number(event.target.value) || 1))}
              />
            </label>
          )}

          <label className="mt-4 flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            File name
            <Input
              value={outputName}
              placeholder={`${doc.name}-split`}
              onChange={(event) => setOutputName(event.target.value)}
            />
          </label>

          <Button className="mt-4 w-full" disabled={busy || !canRun} onClick={() => void onSplit()}>
            Split & download
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Shift-click to select a range of pages. Multiple files download as a zip.
        </p>
      </aside>
    </div>
  );
}
