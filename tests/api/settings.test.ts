import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { GET, PATCH } from "@/app/api/settings/route";

describe("Settings API", () => {
  afterAll(async () => {
    await prisma.settings.update({
      where: { id: "global" },
      data: { smallTarget: 250, mediumTarget: 750, bigTarget: 1500 },
    });
    await prisma.$disconnect();
  });

  it("gets the global settings, creating defaults if missing", async () => {
    const response = await GET();
    const body = await response.json();
    expect(body.smallTarget).toBe(250);
  });

  it("updates a target", async () => {
    const request = new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ bigTarget: 2000 }),
    });
    const response = await PATCH(request as never);
    const body = await response.json();
    expect(body.bigTarget).toBe(2000);
  });
});
