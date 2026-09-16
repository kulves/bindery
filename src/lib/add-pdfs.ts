import { toast } from "sonner";
import { createSampleDocument, loadPdfFile, type PdfDoc } from "@/lib/pdf";
import { renderThumbnails } from "@/lib/pdf-render";
import { useWorkspace } from "@/store/workspace";

const controllers = new Map<string, AbortController>();

export function hydrateThumbs(doc: PdfDoc) {
  controllers.get(doc.id)?.abort();
  const controller = new AbortController();
  controllers.set(doc.id, controller);
  const { setThumb, setRendering } = useWorkspace.getState();
  void renderThumbnails(
    doc.bytes,
    (index, url) => {
      if (controller.signal.aborted) return;
      if (!useWorkspace.getState().docs.some((d) => d.id === doc.id)) return;
      setThumb(doc.id, index, url);
    },
    controller.signal,
  )
    .catch((err) => {
      if (controller.signal.aborted) return;
      console.error(err);
      toast.error(`Couldn’t render pages in ${doc.name}.`);
    })
    .finally(() => {
      if (!controller.signal.aborted) setRendering(doc.id, false);
    });
}

export async function addPdfFiles(fileList: FileList | File[] | File) {
  const files = Array.isArray(fileList)
    ? fileList
    : fileList instanceof File
      ? [fileList]
      : Array.from(fileList);
  const pdfs = files.filter(
    (file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"),
  );
  if (pdfs.length === 0) {
    toast.error("Drop PDF files — other types are ignored.");
    return;
  }

  const loaded: PdfDoc[] = [];
  for (const file of pdfs) {
    try {
      loaded.push(await loadPdfFile(file));
    } catch {
      toast.error(`Couldn’t open ${file.name}. It may be encrypted or damaged.`);
    }
  }
  if (loaded.length === 0) return;
  useWorkspace.getState().addDocs(loaded);
  for (const doc of loaded) hydrateThumbs(doc);
}

export async function addSample(kind: "report" | "appendix") {
  try {
    const doc = await createSampleDocument(kind);
    useWorkspace.getState().addDocs([doc]);
    hydrateThumbs(doc);
  } catch (err) {
    console.error(err);
    toast.error("Couldn’t build the sample PDF.");
  }
}

export function rehydrate(doc: PdfDoc) {
  useWorkspace.getState().setRendering(doc.id, true);
  hydrateThumbs(doc);
}
