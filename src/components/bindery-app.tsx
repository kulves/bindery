import { Download, Loader2 } from "lucide-react";
import { Toaster } from "sonner";
import { EditorView } from "@/components/editor-view";
import { MergeView } from "@/components/merge-view";
import { SplitView } from "@/components/split-view";
import { WordView } from "@/components/word-view";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ToolId } from "@/lib/pdf";
import { cn } from "@/lib/utils";
import { UpdateNotice } from "@/components/update-notice";
import { useWorkspace } from "@/store/workspace";

const TOOLS: Array<{ id: ToolId; label: string }> = [
  { id: "merge", label: "Merge" },
  { id: "split", label: "Split" },
  { id: "edit", label: "Edit" },
  { id: "word", label: "Word" },
];

const DOWNLOAD_URL = "https://github.com/kulves/bindery/releases/latest";

export function BinderyApp() {
  const tool = useWorkspace((s) => s.tool);
  const setTool = useWorkspace((s) => s.setTool);
  const busy = useWorkspace((s) => s.busy);
  const busyLabel = useWorkspace((s) => s.busyLabel);
  const docs = useWorkspace((s) => s.docs);
  const reset = useWorkspace((s) => s.reset);
  const inDesktopApp = typeof navigator !== "undefined" && /Electron/i.test(navigator.userAgent);

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
        <header className="z-20 shrink-0 bg-primary text-primary-foreground">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-center gap-3">
              <Mark />
              <div>
                <div className="flex items-baseline gap-2">
                  <p className="font-display text-2xl leading-none tracking-tight">Papyrus</p>
                  <p className="text-[11px] tracking-wide text-primary-foreground/70">Patina Lite</p>
                </div>
                <p className="mt-1 text-xs text-ember">
                  Split, merge, and shape PDFs on this device
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {docs.length > 0 && (
                <Button
                  variant="ghost"
                  className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                  onClick={() => reset()}
                >
                  Clear bench
                </Button>
              )}
              {!inDesktopApp && (
                <a
                  href={DOWNLOAD_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-11 items-center gap-2 rounded-full px-3 text-sm font-medium text-primary-foreground hover:bg-primary-foreground/10"
                >
                  <Download className="size-4" />
                  Download
                </a>
              )}
              <nav aria-label="Tools" className="flex rounded-full bg-primary-foreground/10 p-1">
                {TOOLS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTool(item.id)}
                    className={cn(
                      "h-11 min-w-20 rounded-full px-4 text-sm font-medium transition-[background-color,color] duration-150 ease-out",
                      tool === item.id
                        ? "bg-card text-foreground"
                        : "text-primary-foreground/80 hover:text-primary-foreground",
                    )}
                    aria-current={tool === item.id ? "page" : undefined}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
            </div>
          </div>
        </header>

        <main
          className={cn(
            "relative min-h-0 flex-1 px-4 sm:px-6",
            tool === "edit" && docs.length > 0
              ? "flex flex-col overflow-hidden pt-3"
              : "overflow-y-auto py-6 sm:py-10",
          )}
        >
          {tool === "merge" && <MergeView />}
          {tool === "split" && <SplitView />}
          {tool === "edit" && <EditorView />}
          {tool === "word" && <WordView />}

          {docs.length > 0 && tool !== "edit" && (
            <p className="mx-auto mt-8 max-w-6xl text-xs text-muted-foreground">
              {docs.length} document{docs.length === 1 ? "" : "s"} in the bench · processed in your
              browser
            </p>
          )}

          {busy && (
            <div className="fixed inset-0 z-30 flex items-center justify-center bg-background/70">
              <p className="flex items-center gap-2 rounded-md bg-card px-4 py-3 text-sm shadow-[var(--shadow-border)]">
                <Loader2 className="size-4 animate-spin" />
                {busyLabel || "Working…"}
              </p>
            </div>
          )}
        </main>
        <UpdateNotice />
      </div>
      <Toaster
        position="bottom-center"
        theme="light"
        toastOptions={{
          className: "font-sans",
          style: {
            background: "var(--color-card)",
            color: "var(--color-foreground)",
            border: "1px solid var(--color-border)",
          },
        }}
      />
    </TooltipProvider>
  );
}

function Mark() {
  return <img src="/papyrus-logo.png" alt="" className="size-10 shrink-0 rounded-lg" />;
}
