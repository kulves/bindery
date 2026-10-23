export const APP_VERSION = "1.2.2";

export const RELEASES_URL = "https://github.com/kulves/bindery/releases/latest";

export function compareVersions(left: string, right: string) {
  const a = left.replace(/^v/, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const b = right.replace(/^v/, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

export function assetForDesktop(assets: ReleaseAsset[], platform: string, arch: string) {
  const name =
    platform === "win32"
      ? "Papyrus-win-x64.zip"
      : platform === "darwin"
        ? arch === "arm64"
          ? "Papyrus-mac-arm64.zip"
          : "Papyrus-mac-x64.zip"
        : platform === "linux"
          ? "Papyrus-linux-x64.tar.gz"
          : null;
  if (!name) return null;
  return assets.find((asset) => asset.name === name) ?? null;
}

export function assetForBrowser(assets: ReleaseAsset[]) {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return assets.find((asset) => asset.name === "Papyrus-win-x64.zip") ?? null;
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) {
    return assets.find((asset) => asset.name === "Papyrus-linux-x64.tar.gz") ?? null;
  }
  return null;
}
