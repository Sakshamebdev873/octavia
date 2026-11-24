import { describe, expect, test } from "bun:test";
import { decodeCursor, encodeCursor } from "../src/modules/runs/cursor";

describe("run cursor", () => {
  test("round-trips the sort key", () => {
    const cursor = { startedAt: new Date("2026-11-24T10:00:00.123Z"), id: Bun.randomUUIDv7() };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  test("is URL safe", () => {
    expect(encodeCursor({ startedAt: new Date(), id: Bun.randomUUIDv7() })).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  test("rejects strings it did not issue", () => {
    expect(decodeCursor("garbage")).toBeNull();
    expect(decodeCursor(Buffer.from('{"t":"yesterday","id":"x"}').toString("base64url"))).toBeNull();
    expect(decodeCursor(Buffer.from("[1,2]").toString("base64url"))).toBeNull();
  });
});
