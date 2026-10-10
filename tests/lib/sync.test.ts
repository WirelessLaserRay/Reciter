import { describe, it, expect, beforeAll } from "vitest";
import initSqlJs from "sql.js";
import { SqlJsBackend } from "@/lib/sql/sqljs-backend";
import { db } from "@/lib/db";
import { getClientId, getDeviceId } from "@/lib/sync";
import { sanitizeBackupData, buildBackup } from "@/lib/backup";

describe("sync module & identity tests", () => {
  beforeAll(async () => {
    const backend = new SqlJsBackend(() => initSqlJs());
    await db.init(backend);
  });

  it("getClientId returns persistent client identity", async () => {
    const id1 = await getClientId();
    expect(id1).toBeTruthy();
    expect(id1.startsWith("client_")).toBe(true);

    const id2 = await getClientId();
    expect(id2).toBe(id1);
  });

  it("getDeviceId derives consistent device identifier containing platform and client hash", async () => {
    const clientId = await getClientId();
    const deviceId = await getDeviceId();
    expect(deviceId).toBeTruthy();
    expect(deviceId.startsWith("reciter-")).toBe(true);
    expect(deviceId).toContain(clientId.replace(/^client_/, "").slice(-8));
  });

  it("sanitizeBackupData preserves clientId when provided", () => {
    const raw = {
      version: 2,
      exportedAt: "2026-10-10T00:00:00.000Z",
      clientId: "client_test_12345",
      decks: [],
      cards: [],
      reviewLogs: [],
      settings: [],
      dailyStats: [],
    };
    const sanitized = sanitizeBackupData(raw);
    expect(sanitized.clientId).toBe("client_test_12345");
  });

  it("buildBackup embeds clientId into export data", async () => {
    const myId = await getClientId();
    const backup = await buildBackup({ clientId: myId });
    expect(backup.clientId).toBe(myId);
    expect(backup.version).toBe(2);
    expect(Array.isArray(backup.decks)).toBe(true);
  });
});
