import { packager } from "@electron/packager";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const archArgIndex = process.argv.indexOf("--arch");
const arch = archArgIndex >= 0 ? process.argv[archArgIndex + 1] : process.env.ELECTRON_ARCH || "arm64";
const shouldSign = process.env.SIGN_MAC === "true";
const bundleId = process.env.MAC_APP_BUNDLE_ID || "app.lovable.plan-magic-buddy.sylva-calendar";
const entitlements = path.join(root, "electron", "entitlements.mac.plist");

if (shouldSign && process.platform !== "darwin") {
  throw new Error("macOS 签名和 notarization 必须在 macOS 上运行。请使用 .github/workflows/macos-signed-release.yml 或在本机 Mac 执行。");
}

const osxSign = shouldSign
  ? {
      identity: process.env.APPLE_SIGNING_IDENTITY || undefined,
      keychain: process.env.KEYCHAIN_PATH || undefined,
      optionsForFile: () => ({
        hardenedRuntime: true,
        entitlements,
        signatureFlags: "library",
      }),
    }
  : undefined;

const osxNotarize = shouldSign
  ? {
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    }
  : undefined;

if (shouldSign) {
  const missing = ["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"].filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`缺少 Apple notarization 环境变量: ${missing.join(", ")}`);
  }
}

const paths = await packager({
  dir: root,
  name: "Sylva 日历",
  platform: "darwin",
  arch,
  out: path.join(root, "electron-release"),
  overwrite: true,
  asar: true,
  appBundleId: bundleId,
  helperBundleId: `${bundleId}.helper`,
  appCategoryType: "public.app-category.productivity",
  darwinDarkModeSupport: true,
  osxSign,
  osxNotarize,
  ignore: (file) => {
    const rel = path.relative(root, file);
    if (!rel || rel.startsWith("..")) return false;
    return [
      /^\.git($|\/)/,
      /^\.github($|\/)/,
      /^\.lovable($|\/)/,
      /^\.tanstack($|\/)/,
      /^\.wrangler($|\/)/,
      /^docs($|\/)/,
      /^dist($|\/)/,
      /^electron-release($|\/)/,
      /^node_modules($|\/)/,
      /^public($|\/)/,
      /^src($|\/)/,
      /^supabase($|\/)/,
      /^\.env/,
      /^.*\.log$/,
      /^tsconfig\.tsbuildinfo$/,
    ].some((rule) => rule.test(rel));
  },
});

console.log(paths.join("\n"));