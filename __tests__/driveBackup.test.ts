import { db } from "../db/client";
import { users, dataBackupQueue } from "../db/schema";
import { applyMigrations, resetDb } from "./helpers/db";
import { runDriveBackup, getLastBackupAt } from "../lib/driveSync/backup";
import * as driveApi from "../lib/driveSync/driveApi";
import AsyncStorage from "@react-native-async-storage/async-storage";

beforeAll(() => applyMigrations());
beforeEach(() => {
  resetDb();
  (AsyncStorage as unknown as { __resetStore: () => void }).__resetStore();
  jest.restoreAllMocks();
});

const getAccessToken = async () => "fake-token";

describe("runDriveBackup", () => {
  it("does nothing when the queue is empty", async () => {
    const createSpy = jest.spyOn(driveApi, "createBackupFile");
    await runDriveBackup(getAccessToken);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("creates a new backup file when none exists yet, and clears the queue", async () => {
    await db.insert(users).values({ id: "u1", name: "Farmer A" });
    jest.spyOn(driveApi, "findBackupFile").mockResolvedValue(null);
    const createSpy = jest.spyOn(driveApi, "createBackupFile").mockResolvedValue("new-file-id");

    await runDriveBackup(getAccessToken);

    expect(createSpy).toHaveBeenCalledWith("fake-token", expect.any(String));
    expect(await db.select().from(dataBackupQueue)).toHaveLength(0);
    expect(await getLastBackupAt()).toBeInstanceOf(Date);
  });

  it("updates the existing backup file when one is already known, and clears the queue", async () => {
    await db.insert(users).values({ id: "u1" });
    jest.spyOn(driveApi, "findBackupFile").mockResolvedValue("existing-file-id");
    const updateSpy = jest.spyOn(driveApi, "updateBackupFile").mockResolvedValue(undefined);

    await runDriveBackup(getAccessToken);

    expect(updateSpy).toHaveBeenCalledWith("fake-token", "existing-file-id", expect.any(String));
    expect(await db.select().from(dataBackupQueue)).toHaveLength(0);
  });

  it("reuses a cached file id on the next backup without searching again", async () => {
    await db.insert(users).values({ id: "u1" });
    const findSpy = jest.spyOn(driveApi, "findBackupFile").mockResolvedValue(null);
    jest.spyOn(driveApi, "createBackupFile").mockResolvedValue("cached-id");
    await runDriveBackup(getAccessToken);

    await db.update(users).set({ name: "Changed" });
    const updateSpy = jest.spyOn(driveApi, "updateBackupFile").mockResolvedValue(undefined);
    await runDriveBackup(getAccessToken);

    expect(findSpy).toHaveBeenCalledTimes(1); // only on the first backup
    expect(updateSpy).toHaveBeenCalledWith("fake-token", "cached-id", expect.any(String));
  });

  it("leaves the queue untouched when the upload fails", async () => {
    await db.insert(users).values({ id: "u1" });
    jest.spyOn(driveApi, "findBackupFile").mockResolvedValue(null);
    jest.spyOn(driveApi, "createBackupFile").mockRejectedValue(new Error("network down"));

    await runDriveBackup(getAccessToken);

    expect(await db.select().from(dataBackupQueue)).toHaveLength(1);
    expect(await getLastBackupAt()).toBeNull();
  });
});
