const { app, BrowserWindow, Menu } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const DIST = path.join(__dirname, "dist");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".json": "application/json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".map": "application/json; charset=utf-8",
};

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      let name = decodeURIComponent(url.pathname);
      if (name.endsWith("/")) name += "index.html";
      const root = DIST.endsWith(path.sep) ? DIST : DIST + path.sep;
      const file = path.normalize(path.join(DIST, name));
      if (file !== DIST && !file.startsWith(root)) {
        res.writeHead(403).end();
        return;
      }
      fs.readFile(file, (err, data) => {
        if (err) {
          res.writeHead(404).end("Not found");
          return;
        }
        res.writeHead(200, {
          "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
          "Cache-Control": "no-cache",
        });
        res.end(data);
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Papyrus could not open a local port"));
        return;
      }
      resolve({ server, port: address.port });
    });
    server.on("error", reject);
  });
}

async function openWindow() {
  const { port } = await startServer();
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 880,
    minHeight: 640,
    title: "Papyrus",
    backgroundColor: "#f3efe6",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  await window.loadURL(`http://127.0.0.1:${port}/`);
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  return openWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});
