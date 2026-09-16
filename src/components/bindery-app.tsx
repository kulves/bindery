import { Loader2 } from "lucide-react";
import { Toaster } from "sonner";
import { EditorView } from "@/components/editor-view";
import { MergeView } from "@/components/merge-view";
import { SplitView } from "@/components/split-view";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ToolId } from "@/lib/pdf";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/store/workspace";

const TOOLS: Array<{ id: ToolId; label: string }> = [
  { id: "merge", label: "Merge" },
  { id: "split", label: "Split" },
  { id: "edit", label: "Edit" },
];

export function BinderyApp() {
  const tool = useWorkspace((s) => s.tool);
  const setTool = useWorkspace((s) => s.setTool);
  const busy = useWorkspace((s) => s.busy);
  const busyLabel = useWorkspace((s) => s.busyLabel);
  const docs = useWorkspace((s) => s.docs);
  const reset = useWorkspace((s) => s.reset);

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex min-h-dvh flex-col overflow-x-hidden bg-background text-foreground">
        <header className="sticky top-0 z-20 bg-primary text-primary-foreground">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-center gap-3">
              <Mark />
              <div>
                <p className="font-display text-2xl leading-none tracking-tight">Bindery</p>
                <p className="mt-1 text-xs text-primary-foreground/70">
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

        <main className="relative flex-1 px-4 py-6 sm:px-6 sm:py-10">
          {docs.length > 0 && (
            <p className="mx-auto mb-6 max-w-6xl text-xs text-muted-foreground">
              {docs.length} document{docs.length === 1 ? "" : "s"} in the bench · processed in your
              browser
            </p>
          )}
          {tool === "merge" && <MergeView />}
          {tool === "split" && <SplitView />}
          {tool === "edit" && <EditorView />}

          {busy && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70">
              <p className="flex items-center gap-2 rounded-md bg-card px-4 py-3 text-sm shadow-[var(--shadow-border)]">
                <Loader2 className="size-4 animate-spin" />
                {busyLabel || "Working…"}
              </p>
            </div>
          )}
        </main>
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
  return (
    <svg viewBox="0 0 32 32" className="size-10 shrink-0" aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-card" />
      <rect x="12" y="5" width="14" height="18" rx="2" className="fill-accent" />
      <rect x="5" y="9" width="14" height="18" rx="2" className="fill-foreground" />
      <rect x="7" y="13" width="3" height="10" rx="1" className="fill-card" />
    </svg>
  );
}
