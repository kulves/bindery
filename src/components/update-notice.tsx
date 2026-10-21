import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  APP_VERSION,
  assetForBrowser,
  compareVersions,
  RELEASES_URL,
  type ReleaseAsset,
} from "@/lib/app-version";

const DISMISS_KEY = "papyrus-update-dismissed";

interface UpdateOffer {
  version: string;
  desktop: boolean;
  url: string | null;
}

export function UpdateNotice() {
  const [offer, setOffer] = useState<UpdateOffer | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const preview = import.meta.env.DEV && new URLSearchParams(window.location.search).has("update");
    let cancel = false;
    void findUpdate(preview).then((next) => {
      if (!cancel) setOffer(next);
    });
    return () => {
      cancel = true;
    };
  }, []);

  if (!offer) return null;

  async function download() {
    if (!offer) return;
    setBusy(true);
    try {
      if (offer.desktop) {
        const response = await fetch("/__papyrus/update", { method: "POST" });
        const data = (await response.json()) as { ok?: boolean; error?: string };
        if (!data.ok) throw new Error(data.error || "Could not install the update.");
        toast.success("Papyrus will restart with the update.");
        return;
      }
      if (import.meta.env.DEV && offer.version === "preview") {
        toast.message("Papyrus would download and install the update.");
        return;
      }
      window.open(offer.url || RELEASES_URL, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not download the update.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="status"
      className="fixed right-4 bottom-4 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-border/80 bg-card/75 p-4 pr-12 shadow-[var(--shadow-border)] backdrop-blur-md"
    >
      <button
        type="button"
        aria-label="Close updates"
        onClick={() => {
          try {
            localStorage.setItem(DISMISS_KEY, offer.version);
          } catch {
            /* ignore */
          }
          setOffer(null);
        }}
        className="absolute top-1 right-1 inline-flex size-11 items-center justify-center rounded-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
      >
        <X />
      </button>
      <p className="text-sm leading-relaxed text-foreground">
        Updates available; download the latest updates. Click the button.
      </p>
      <Button className="mt-3" disabled={busy} onClick={() => void download()}>
        {busy ? "Downloading…" : "Download Updates"}
      </Button>
    </div>
  );
}

async function findUpdate(preview: boolean): Promise<UpdateOffer | null> {
  if (preview) return { version: "preview", desktop: false, url: null };
  try {
    const local = await fetch("/__papyrus/update", { headers: { Accept: "application/json" } });
    if (local.ok) {
      const data = (await local.json()) as { papyrus?: boolean; available?: boolean; version?: string };
      if (data.papyrus) {
        if (!data.available || !data.version || dismissed(data.version)) return null;
        return { version: data.version, desktop: true, url: null };
      }
    }
  } catch {
    /* The website has no local updater. */
  }

  try {
    const response = await fetch("https://api.github.com/repos/kulves/bindery/releases/latest", {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { tag_name?: string; assets?: ReleaseAsset[] };
    const version = (data.tag_name || "").replace(/^v/, "");
    if (!version || compareVersions(version, APP_VERSION) <= 0 || dismissed(version)) return null;
    const asset = assetForBrowser(data.assets ?? []);
    return { version, desktop: false, url: asset?.browser_download_url ?? RELEASES_URL };
  } catch {
    return null;
  }
}

function dismissed(version: string) {
  try {
    return localStorage.getItem(DISMISS_KEY) === version;
  } catch {
    return false;
  }
}
