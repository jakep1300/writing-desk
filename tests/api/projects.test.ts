import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { POST, GET as GET_LIST } from "@/app/api/projects/route";
import { GET as GET_ONE } from "@/app/api/projects/[id]/route";

describe("Projects API", () => {
  const createdIds: string[] = [];

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.$disconnect();
  });

  it("creates a creative project with empty CreativeDetails", async () => {
    const request = new Request("http://localhost/api/projects", {
      method: "POST",
      body: JSON.stringify({ type: "CREATIVE", title: "My Novel" }),
    });

    const response = await POST(request as never);
    const body = await response.json();
    createdIds.push(body.id);

    expect(response.status).toBe(201);
    expect(body.title).toBe("My Novel");

    const found = await prisma.project.findUnique({
      where: { id: body.id },
      include: { creativeDetails: true },
    });
    expect(found?.creativeDetails).not.toBeNull();
  });

  it("creates a research project with empty ResearchDetails", async () => {
    const request = new Request("http://localhost/api/projects", {
      method: "POST",
      body: JSON.stringify({ type: "RESEARCH", title: "My Investigation" }),
    });

    const response = await POST(request as never);
    const body = await response.json();
    createdIds.push(body.id);

    const found = await prisma.project.findUnique({
      where: { id: body.id },
      include: { researchDetails: true },
    });
    expect(found?.researchDetails).not.toBeNull();
  });

  it("lists projects", async () => {
    const response = await GET_LIST();
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("gets a single project by id", async () => {
    const project = await prisma.project.create({ data: { type: "CREATIVE", title: "Solo" } });
    createdIds.push(project.id);

    const response = await GET_ONE(new Request("http://localhost") as never, {
      params: Promise.resolve({ id: project.id }),
    });
    const body = await response.json();

    expect(body.title).toBe("Solo");
  });
});
