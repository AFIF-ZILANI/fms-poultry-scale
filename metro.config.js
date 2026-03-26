const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Prevent Metro from crashing when Replit cleans up temporary skill files
config.resolver.blockList = [/\.local[/\\]skills[/\\]\.tmp-/];

module.exports = config;
