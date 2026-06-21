module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+\\.(ts|tsx|js|jsx)$": [
      "babel-jest",
      { configFile: "./babel.config.js" },
    ],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  transformIgnorePatterns: [
    "node_modules/(?!(expo-sqlite|@react-native-async-storage)/)",
  ],
  testPathIgnorePatterns: ["/node_modules/", "/claude-context-optimizer/"],
};
