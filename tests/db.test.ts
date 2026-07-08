import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";

describe("database connectivity", () => {
  it("can upsert and read the global Settings row", async () => {
    await prisma.settings.upsert({
      where: { id: "global" },
      create: { id: "global" },
      update: {},
    });

    const settings = await prisma.settings.findUnique({ where: { id: "global" } });

    expect(settings).not.toBeNull();
    expect(settings?.smallTarget).toBe(250);
    expect(settings?.mediumTarget).toBe(750);
    expect(settings?.bigTarget).toBe(1500);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
