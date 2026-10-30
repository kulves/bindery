const { app, BrowserWindow, Menu } = require("electron");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const DIST = path.join(__dirname, "dist");
const RELEASE_API = "https://api.github.com/repos/kulves/bindery/releases/latest";

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

let pendingUpdate = null;

function compareVersions(left, right) {
  const a = String(left).replace(/^v/, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const b = String(right).replace(/^v/, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] || 0) - (b[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function assetName() {
  if (process.platform === "win32") return "Papyrus-win-x64.zip";
  if (process.platform === "darwin") return process.arch === "arm64" ? "Papyrus-mac-arm64.zip" : "Papyrus-mac-x64.zip";
  if (process.platform === "linux") return "Papyrus-linux-x64.tar.gz";
  return null;
}

function allowedDownload(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      (parsed.hostname === "github.com" ||
        parsed.hostname === "objects.githubusercontent.com" ||
        parsed.hostname === "release-assets.githubusercontent.com")
    );
  } catch {
    return false;
  }
}

async function lookForUpdate() {
  const response = await fetch(RELEASE_API, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "Papyrus" },
  });
  if (!response.ok) throw new Error("Could not check for updates.");
  const data = await response.json();
  const version = String(data.tag_name || "").replace(/^v/, "");
  const name = assetName();
  const asset = name ? (data.assets || []).find((item) => item.name === name) : null;
  const available = Boolean(version) && compareVersions(version, app.getVersion()) > 0 && Boolean(asset);
  pendingUpdate = available
    ? { version, url: asset.browser_download_url, name: asset.name }
    : null;
  return {
    papyrus: true,
    available,
    version: available ? version : app.getVersion(),
  };
}

function installFolder() {
  if (process.platform === "darwin") return path.resolve(process.execPath, "../../..");
  return path.dirname(process.execPath);
}

function extractedPayload(dir) {
  if (process.platform === "win32") {
    if (!fs.existsSync(path.join(dir, "Papyrus.exe"))) throw new Error("The update file was not a Papyrus app.");
    return dir;
  }
  if (process.platform === "darwin") {
    const bundle = path.join(dir, "Papyrus.app");
    if (!fs.existsSync(bundle)) throw new Error("The update file was not a Papyrus app.");
    return bundle;
  }
  const nested = path.join(dir, "Papyrus-linux-x64");
  const root = fs.existsSync(path.join(nested, "Papyrus")) ? nested : dir;
  if (!fs.existsSync(path.join(root, "Papyrus"))) throw new Error("The update file was not a Papyrus app.");
  return root;
}

function unpack(archive, dest) {
  const result =
    process.platform === "darwin"
      ? spawnSync("ditto", ["-xk", archive, dest], { stdio: "ignore" })
      : spawnSync("tar", ["-xf", archive, "-C", dest], { stdio: "ignore" });
  if (result.status !== 0) throw new Error("Could not open the update file.");
}

function writeHelper() {
  const base = path.join(os.tmpdir(), `papyrus-update-${Date.now()}`);
  if (process.platform === "win32") {
    const script = `${base}.ps1`;
    fs.writeFileSync(
      script,
      [
        "$pidToWait = [int]$env:PAPYRUS_PID",
        "while (Get-Process -Id $pidToWait -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 300 }",
        "Start-Sleep -Seconds 1",
        "Copy-Item -Path (Join-Path $env:PAPYRUS_SRC '*') -Destination $env:PAPYRUS_DEST -Recurse -Force",
        "Start-Process -FilePath $env:PAPYRUS_EXE",
        "",
      ].join("\r\n"),
    );
    return { command: "powershell.exe", args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script] };
  }
  const script = `${base}.sh`;
  fs.writeFileSync(
    script,
    [
      "#!/bin/sh",
      'while kill -0 "$PAPYRUS_PID" 2>/dev/null; do sleep 0.3; done',
      "sleep 1",
      'if [ "$PAPYRUS_PLATFORM" = "darwin" ]; then',
      '  rm -rf "$PAPYRUS_DEST"',
      '  cp -R "$PAPYRUS_SRC" "$PAPYRUS_DEST"',
      '  open "$PAPYRUS_DEST"',
      "else",
      '  cp -a "$PAPYRUS_SRC"/. "$PAPYRUS_DEST"/',
      '  chmod +x "$PAPYRUS_DEST/Papyrus"',
      '  "$PAPYRUS_DEST/Papyrus" >/dev/null 2>&1 &',
      "fi",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  return { command: script, args: [] };
}

async function applyUpdate() {
  if (!app.isPackaged) return { ok: false, error: "Install Papyrus before updating." };
  if (!pendingUpdate) await lookForUpdate();
  if (!pendingUpdate || !allowedDownload(pendingUpdate.url)) {
    return { ok: false, error: "No update is available." };
  }
  const archive = path.join(os.tmpdir(), pendingUpdate.name);
  const response = await fetch(pendingUpdate.url, { redirect: "follow" });
  if (!response.ok) return { ok: false, error: "Could not download the update." };
  if (response.url && !allowedDownload(response.url)) {
    return { ok: false, error: "The update link was not from GitHub." };
  }
  fs.writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
  const unpacked = fs.mkdtempSync(path.join(os.tmpdir(), "papyrus-"));
  unpack(archive, unpacked);
  const source = extractedPayload(unpacked);
  const helper = writeHelper();
  const child = spawn(helper.command, helper.args, {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      PAPYRUS_PID: String(process.pid),
      PAPYRUS_SRC: source,
      PAPYRUS_DEST: installFolder(),
      PAPYRUS_EXE: process.execPath,
      PAPYRUS_PLATFORM: process.platform,
    },
  });
  child.unref();
  return { ok: true };
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (url.pathname === "/__papyrus/update") {
        if (req.method === "GET") {
          lookForUpdate()
            .then((body) => sendJson(res, 200, body))
            .catch((error) => sendJson(res, 200, { papyrus: true, available: false, error: error.message }));
          return;
        }
        if (req.method === "POST") {
          applyUpdate()
            .then((body) => {
              sendJson(res, 200, body);
              if (body.ok) setTimeout(() => app.quit(), 700);
            })
            .catch((error) => sendJson(res, 200, { ok: false, error: error.message || "Could not install the update." }));
          return;
        }
      }
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
    icon: path.join(__dirname, "icon.png"),
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
