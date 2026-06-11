const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const fs = require("fs");

const config = getDefaultConfig(__dirname);

config.transformer.babelTransformerPath = require.resolve(
  "react-native-svg-transformer"
);

config.resolver.assetExts = config.resolver.assetExts.filter(
  (ext) => ext !== "svg"
);
config.resolver.sourceExts.push("svg");

// Prevent Metro from crashing when Replit cleans up temporary files in
// .local/skills (skill runner), .local/secondary_skills (secondary skills),
// and .local/state/workflow-logs (runner logs).
config.resolver.blockList = [
  /\.local[/\\]skills[/\\]/,
  /\.local[/\\]secondary_skills[/\\]/,
  /\.local[/\\]state[/\\]/,
];

// @clerk/shared is not installed at root level — it lives only inside
// @clerk/expo's own node_modules. Add that directory to watchFolders so
// Metro can hash the files it finds there.
const CLERK_EXPO_NM = path.resolve(
  __dirname,
  "node_modules/@clerk/expo/node_modules"
);
if (fs.existsSync(CLERK_EXPO_NM)) {
  config.watchFolders = [...(config.watchFolders ?? []), CLERK_EXPO_NM];
}

// The canonical root for the nested @clerk/shared package.
const CLERK_SHARED_ROOT = path.resolve(CLERK_EXPO_NM, "@clerk/shared");

// Packages that must be deduplicated to a single instance in the app.
// @clerk/clerk-js ships its own node_modules/react (19.2.5) which causes
// "Invalid hook call" when mixed with the app's React (19.1.0). We force
// every `require('react')` to resolve to the project-root copy.
const DEDUP_MODULES = {
  react: require.resolve("react"),
  "react/jsx-runtime": require.resolve("react/jsx-runtime"),
  "react/jsx-dev-runtime": require.resolve("react/jsx-dev-runtime"),
  "react-dom": require.resolve("react-dom"),
  "react-native": require.resolve("react-native"),
};

// react-native-worklets@0.5.1 sets "react-native": "./src/index" in its
// package.json but ships no src/index file — only the compiled lib/module/.
// Redirect all requires of this package to the built output.
const WORKLETS_BUILT = require.resolve("react-native-worklets/lib/module/index");

function isFile(p) {
  try { return fs.statSync(p).isFile(); } catch (_) { return false; }
}

function resolveClerkShared(subPath) {
  // subPath is "" (bare import) or "/dist/runtime/react" etc.
  const candidates = subPath
    ? [
        path.join(CLERK_SHARED_ROOT, subPath),              // exact match (file)
        path.join(CLERK_SHARED_ROOT, subPath + ".js"),      // explicit .js
        path.join(CLERK_SHARED_ROOT, subPath, "index.js"),  // dir/index.js
      ]
    : [
        // bare "@clerk/shared" — use the package exports entry if present
        path.join(CLERK_SHARED_ROOT, "dist", "index.js"),
        path.join(CLERK_SHARED_ROOT, "index.js"),
      ];
  for (const c of candidates) {
    if (isFile(c)) return { filePath: c, type: "sourceFile" };
  }
  return null;
}

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // 0. Redirect broken react-native-worklets native entry to built output
  if (moduleName === "react-native-worklets") {
    return { filePath: WORKLETS_BUILT, type: "sourceFile" };
  }

  // 1. Deduplicate react and friends
  if (Object.prototype.hasOwnProperty.call(DEDUP_MODULES, moduleName)) {
    return { filePath: DEDUP_MODULES[moduleName], type: "sourceFile" };
  }

  // 2. Redirect @clerk/shared (and any sub-path) to the nested copy that
  //    actually exists on disk. Without this Metro resolves to the root
  //    node_modules/@clerk/shared which was never installed, causing a
  //    "Failed to get SHA-1" crash.
  if (moduleName === "@clerk/shared" || moduleName.startsWith("@clerk/shared/")) {
    const subPath = moduleName.slice("@clerk/shared".length); // "" or "/dist/..."
    const resolved = resolveClerkShared(subPath);
    if (resolved) return resolved;
  }

  // 3. @clerk/expo uses internal paths not listed in its package.json exports
  //    map. Metro 0.83+ enforces the exports map and blocks these. Intercept
  //    relative requires originating from within @clerk/expo/dist and resolve
  //    them directly.
  if (
    context.originModulePath.includes(
      path.join("node_modules", "@clerk", "expo", "dist")
    )
  ) {
    if (moduleName.startsWith("./") || moduleName.startsWith("../")) {
      const origin = path.dirname(context.originModulePath);
      const candidates = [
        ...(platform === "web"
          ? [
              path.resolve(origin, moduleName + ".web.js"),
              path.resolve(origin, moduleName, "index.web.js"),
            ]
          : []),
        path.resolve(origin, moduleName + ".js"),
        path.resolve(origin, moduleName, "index.js"),
      ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          return { filePath: candidate, type: "sourceFile" };
        }
      }
    }
  }

  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
