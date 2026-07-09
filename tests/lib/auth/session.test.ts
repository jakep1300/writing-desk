import { describe, it, expect } from "vitest";
import { createSessionToken, verifySessionToken } from "@/lib/auth/session";

describe("session token", () => {
  it("round-trips a userId through a signed token", async () => {
    const token = await createSessionToken("user-123");
    const result = await verifySessionToken(token);
    expect(result).toEqual({ userId: "user-123" });
  });

  it("rejects a tampered token", async () => {
    const token = await createSessionToken("user-123");
    const tampered = token.slice(0, -2) + "xx";
    const result = await verifySessionToken(tampered);
    expect(result).toBeNull();
  });
});
