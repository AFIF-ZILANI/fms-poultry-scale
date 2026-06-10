const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const fs = require("fs");

const config = getDefaultConfig(__dirname);

// Prevent Metro from crashing when Replit cleans up temporary files in
// .local/skills (skill runner) and .local/state/workflow-logs (runner logs).
config.resolver.blockList = [
  /\.local[/\\]skills[/\\]/,
  /\.local[/\\]state[/\\]/,
];

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

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // 1. Deduplicate react and friends
  if (Object.prototype.hasOwnProperty.call(DEDUP_MODULES, moduleName)) {
    return { filePath: DEDUP_MODULES[moduleName], type: "sourceFile" };
  }

  // 2. @clerk/expo uses internal paths not listed in its package.json exports
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
