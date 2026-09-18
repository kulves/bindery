# Bindery

A local PDF workshop: **merge**, **split**, and **edit pages** in the browser. Files never leave your machine.

On the Edit tab you can add text boxes, rewrite existing lines, rotate, and reorder pages.

Free to download, share, and remix under the [MIT License](LICENSE).

## Download

**[Download Bindery (zip)](https://github.com/kulves/bindery/releases/latest)** · or grab **Source code (zip)** from that page.

You can also clone the repo:

```bash
git clone https://github.com/kulves/bindery.git
```

Share that GitHub link with friends — the project is public.

## Run it on your PC

You need [Node.js 22+](https://nodejs.org/) (the LTS installer is fine) and npm, which comes with it.

**From the zip**

1. Unzip `Bindery-v1.0.0.zip`
2. Open a terminal in the unzipped folder
3. Run:

```bash
npm install
npm run dev
```

4. Open [http://localhost:8080](http://localhost:8080)

**From git**

```bash
cd bindery
npm install
npm run dev
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server (edit, save, refresh) |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript check |

## Open in your IDE

Open the `bindery` folder in VS Code, Cursor, WebStorm, or whatever you use. After `npm install`, TypeScript and Tailwind should resolve normally.

This is also the starting point for a fuller PDF editor (text, highlight, draw, images, signatures). Those tools are stubbed in the Edit tab today.

### Where to extend the full editor

| What you want | Start here |
|---|---|
| Page tools UI (rotate, delete, coming-soon tools) | `src/components/editor-view.tsx` |
| PDF operations (merge, split, rotate, extract) | `src/lib/pdf.ts` |
| Page thumbnails | `src/lib/pdf-render.ts` |
| Documents on the bench | `src/store/workspace.ts` |
| Merge / split screens | `src/components/merge-view.tsx`, `src/components/split-view.tsx` |
| App chrome (Merge / Split / Edit) | `src/components/bindery-app.tsx` |

The Edit tab already rotates, reorders, and deletes pages. The **Soon** buttons (Text, Highlight, Draw, Image, Sign) are the placeholders to implement next.

Stack: React 19, TanStack Start, Tailwind v4, [pdf-lib](https://pdf-lib.js.org/) (write), [PDF.js](https://mozilla.github.io/pdf.js/) (preview).

## Notes

- Auth and a database are **off**. Everything lives in memory in the tab.
- Encrypted PDFs cannot be opened.
- `npm run dev` listens on port **8080**. Change `server.port` in `vite.config.ts` if that port is taken.
