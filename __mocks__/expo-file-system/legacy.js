// Jest automock for expo-file-system, backed by Node's real fs module —
// same philosophy as __mocks__/expo-sqlite.js: test against real file I/O,
// not a hand-written fake.
const fs = require("fs");
const os = require("os");
const path = require("path");

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "poultry-scale-fs-"));

function toPath(uri) {
  return uri.startsWith("file://") ? uri.slice("file://".length) : uri;
}

module.exports = {
  documentDirectory: `file://${testDir}/`,
  EncodingType: { Base64: "base64", UTF8: "utf8" },
  readAsStringAsync: async (uri, opts) =>
    fs.readFileSync(toPath(uri), { encoding: opts?.encoding ?? "utf8" }),
  writeAsStringAsync: async (uri, content, opts) =>
    fs.writeFileSync(toPath(uri), content, { encoding: opts?.encoding ?? "utf8" }),
  deleteAsync: async (uri) => {
    const p = toPath(uri);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  },
  getInfoAsync: async (uri) => {
    const p = toPath(uri);
    const exists = fs.existsSync(p);
    return { exists, uri, ...(exists ? { size: fs.statSync(p).size } : {}) };
  },
  // Real downloads need a real network call — tests always jest.spyOn this
  // and provide a fake implementation rather than relying on this default,
  // which exists only so an unmocked call fails loudly instead of quietly
  // trying to hit the real network from a test.
  downloadAsync: async () => {
    throw new Error("expo-file-system mock: downloadAsync must be mocked per-test, it has no real network access");
  },
};
