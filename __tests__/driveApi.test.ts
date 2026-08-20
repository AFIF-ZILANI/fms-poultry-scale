import {
  findBackupFile,
  createBackupFile,
  updateBackupFile,
  driveDownloadUrl,
  DRIVE_BACKUP_FILENAME,
} from "../lib/driveSync/driveApi";

function mockFetchOnce(status: number, body: unknown) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  });
}

beforeEach(() => {
  global.fetch = jest.fn();
});

describe("findBackupFile", () => {
  it("returns the file id when a backup already exists", async () => {
    mockFetchOnce(200, { files: [{ id: "file-123", name: DRIVE_BACKUP_FILENAME }] });
    expect(await findBackupFile("token")).toBe("file-123");

    const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain("spaces=appDataFolder");
    expect(url).toContain(encodeURIComponent(DRIVE_BACKUP_FILENAME));
    expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer token");
  });

  it("returns null when no backup file exists yet", async () => {
    mockFetchOnce(200, { files: [] });
    expect(await findBackupFile("token")).toBeNull();
  });

  it("throws with the response status on an API error", async () => {
    mockFetchOnce(401, { error: { message: "invalid token" } });
    await expect(findBackupFile("token")).rejects.toThrow(/401/);
  });
});

describe("error shape", () => {
  // The 404 path is load-bearing: it's how backup.ts knows a cached file id
  // is dead and a fresh search is worth trying, versus a transient failure.
  it("carries the HTTP status on the thrown error", async () => {
    mockFetchOnce(404, { error: { message: "File not found" } });
    await expect(updateBackupFile("token", "dead-id", "base64")).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("createBackupFile", () => {
  it("posts a multipart request and returns the new file id", async () => {
    mockFetchOnce(200, { id: "new-file-id" });
    const id = await createBackupFile("token", "base64content");
    expect(id).toBe("new-file-id");

    const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain("uploadType=multipart");
    expect(opts.method).toBe("POST");
    expect(String(opts.body)).toContain("appDataFolder");
    expect(String(opts.body)).toContain("base64content");
  });
});

describe("updateBackupFile", () => {
  it("patches the existing file's content", async () => {
    mockFetchOnce(200, { id: "file-123" });
    await updateBackupFile("token", "file-123", "newbase64");

    const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain("file-123");
    expect(url).toContain("uploadType=multipart");
    expect(opts.method).toBe("PATCH");
    expect(String(opts.body)).toContain("newbase64");
  });
});

describe("driveDownloadUrl", () => {
  it("builds a direct-download URL for the given file id, no network call", () => {
    const url = driveDownloadUrl("file-123");
    expect(url).toContain("file-123");
    expect(url).toContain("alt=media");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
