import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { POST } from "@/app/api/auth/login/route";

describe("POST /api/auth/login", () => {
  beforeAll(async () => {
    await prisma.user.upsert({
      where: { username: "test-login-user" },
      create: { username: "test-login-user", passwordHash: await hashPassword("right-password") },
      update: { passwordHash: await hashPassword("right-password") },
    });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { username: "test-login-user" } });
    await prisma.$disconnect();
  });

  it("sets a session cookie on correct credentials", async () => {
    const request = new Request("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "test-login-user", password: "right-password" }),
    });

    const response = await POST(request as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("session=");
  });

  it("returns 401 on incorrect password", async () => {
    const request = new Request("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "test-login-user", password: "wrong-password" }),
    });

    const response = await POST(request as never);

    expect(response.status).toBe(401);
  });
});
