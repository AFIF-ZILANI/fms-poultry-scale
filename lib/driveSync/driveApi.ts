export const DRIVE_BACKUP_FILENAME = "poultry-scale-backup.db";

const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const MULTIPART_BOUNDARY = "poultry-scale-backup-boundary";

async function driveFetch(url: string, accessToken: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Drive API request failed: ${res.status} ${body}`);
  }
  return res;
}

export async function findBackupFile(accessToken: string): Promise<string | null> {
  const query = encodeURIComponent(`name='${DRIVE_BACKUP_FILENAME}'`);
  const url = `${DRIVE_FILES_URL}?spaces=appDataFolder&q=${query}&fields=files(id,name)`;
  const res = await driveFetch(url, accessToken);
  const { files } = (await res.json()) as { files: { id: string }[] };
  return files[0]?.id ?? null;
}

// Multipart body: a metadata JSON part + a base64-encoded media part,
// separated by the boundary. Content-Transfer-Encoding: base64 on the
// media part lets a base64 string travel safely as request body text —
// no raw binary handling needed in the RN fetch layer.
function buildMultipartBody(base64Content: string, metadata: Record<string, unknown>) {
  return (
    `--${MULTIPART_BOUNDARY}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${MULTIPART_BOUNDARY}\r\n` +
    `Content-Type: application/octet-stream\r\n` +
    `Content-Transfer-Encoding: base64\r\n\r\n` +
    `${base64Content}\r\n` +
    `--${MULTIPART_BOUNDARY}--`
  );
}

export async function createBackupFile(accessToken: string, base64Content: string): Promise<string> {
  const url = `${DRIVE_UPLOAD_URL}?uploadType=multipart`;
  const body = buildMultipartBody(base64Content, {
    name: DRIVE_BACKUP_FILENAME,
    parents: ["appDataFolder"],
  });
  const res = await driveFetch(url, accessToken, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${MULTIPART_BOUNDARY}` },
    body,
  });
  const { id } = (await res.json()) as { id: string };
  return id;
}

export async function updateBackupFile(
  accessToken: string,
  fileId: string,
  base64Content: string,
): Promise<void> {
  const url = `${DRIVE_UPLOAD_URL}/${fileId}?uploadType=multipart`;
  const body = buildMultipartBody(base64Content, {});
  await driveFetch(url, accessToken, {
    method: "PATCH",
    headers: { "Content-Type": `multipart/related; boundary=${MULTIPART_BOUNDARY}` },
    body,
  });
}

// No network call — Task 5 hands this URL to expo-file-system's
// downloadAsync, which streams the (binary) response straight to a file.
export function driveDownloadUrl(fileId: string): string {
  return `${DRIVE_FILES_URL}/${fileId}?alt=media`;
}
