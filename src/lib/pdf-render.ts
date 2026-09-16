type Pdfjs = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<Pdfjs> | null = null;

async function loadPdfjs(): Promise<Pdfjs> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import("pdfjs-dist");
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

export async function renderThumbnails(
  bytes: Uint8Array,
  onPage: (index: number, dataUrl: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (typeof window === "undefined") return;
  const pdfjs = await loadPdfjs();
  if (signal?.aborted) return;

  const data = new Uint8Array(bytes.byteLength);
  data.set(bytes);

  const task = pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true });
  if (signal) {
    const abort = () => {
      void task.destroy();
    };
    signal.addEventListener("abort", abort, { once: true });
  }

  const pdf = await task.promise;
  try {
    if (signal?.aborted) return;
    for (let i = 1; i <= pdf.numPages; i++) {
      if (signal?.aborted) return;
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 0.42 });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) {
        page.cleanup();
        continue;
      }
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      ctx.fillStyle = "#faf7f0";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      onPage(i - 1, canvas.toDataURL("image/jpeg", 0.76));
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }
}
