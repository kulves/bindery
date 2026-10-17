# Papyrus

A local PDF workshop: **merge**, **split**, and **edit pages** in the browser. The editor is **Patina Lite**. Files never leave your machine.

On the Edit tab you can add text boxes, rewrite existing lines, rotate, and reorder pages.

Free to download, share, and remix under the [MIT License](LICENSE).

## Download

Papyrus is a free program. No account, and your PDFs stay on the computer.

**[Download Papyrus](https://github.com/kulves/bindery/releases/latest)**

| Computer | File | How to open it |
|---|---|---|
| Windows | `Papyrus-win-x64.zip` | Unzip, then double-click `Papyrus.exe` |
| Mac (Apple silicon) | `Papyrus-mac-arm64.zip` | Unzip, then open `Papyrus.app` |
| Mac (Intel) | `Papyrus-mac-x64.zip` | Unzip, then open `Papyrus.app` |
| Linux | `Papyrus-linux-x64.tar.gz` | Unpack, then run `Papyrus` |

The first time Windows warns about an unknown app, choose **More info**, then **Run anyway**. On a Mac, right-click Papyrus and choose **Open**.

You can still use Papyrus in a browser, or clone this repo to change it:

```bash
git clone https://github.com/kulves/bindery.git
```

## Run the source on your PC

You need [Node.js 22+](https://nodejs.org/).

```bash
npm install
npm run dev
```

Then open http://localhost:8080

| Script | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production web build |
| `npm run build:desktop` | Windowed app files |
| `npm run pack:desktop` | Windows, Mac, and Linux downloads |
| `npm run typecheck` | TypeScript check |

## Open in your IDE

Open the `bindery` folder in VS Code, Cursor, or WebStorm. After `npm install`, TypeScript and Tailwind should resolve.

### Where to extend the editor

| What you want | Start here |
|---|---|
| Page tools | `src/components/editor-view.tsx` |
| PDF operations | `src/lib/pdf.ts` |
| Page thumbnails | `src/lib/pdf-render.ts` |
| Documents on the bench | `src/store/workspace.ts` |
| Merge / split / Word screens | `src/components/merge-view.tsx`, `src/components/split-view.tsx`, `src/components/word-view.tsx` |
| App chrome | `src/components/bindery-app.tsx` |
| Desktop window | `desktop/electron.cjs` |

Stack: React 19, TanStack Start, Tailwind v4, [pdf-lib](https://pdf-lib.js.org/), [PDF.js](https://mozilla.github.io/pdf.js/). The downloadable program is an Electron window around the same editor.

## Notes

- Auth and a database are **off**. Documents stay in memory until you save a PDF.
- Encrypted PDFs cannot be opened.
- `npm run dev` listens on port **8080**.
