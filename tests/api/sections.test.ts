import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { GET as GET_LIST, POST } from "@/app/api/projects/[id]/sections/route";
import { PATCH, DELETE } from "@/app/api/sections/[id]/route";

describe("Sections API", () => {
  let projectId: string;

  beforeAll(async () => {
    const project = await prisma.project.create({ data: { type: "CREATIVE", title: "Section Test" } });
    projectId = project.id;
  });

  afterAll(async () => {
    await prisma.project.delete({ where: { id: projectId } });
    await prisma.$disconnect();
  });

  it("creates a section with default order and content", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ title: "Chapter 1" }),
    });

    const response = await POST(request as never, { params: Promise.resolve({ id: projectId }) });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.order).toBe(1);
    expect(body.content).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });

  it("assigns increasing order to subsequent sections", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ title: "Chapter 2" }),
    });

    const response = await POST(request as never, { params: Promise.resolve({ id: projectId }) });
    const body = await response.json();

    expect(body.order).toBe(2);
  });

  it("lists sections in order", async () => {
    const response = await GET_LIST(new Request("http://localhost") as never, {
      params: Promise.resolve({ id: projectId }),
    });
    const body = await response.json();

    expect(body.map((s: { title: string }) => s.title)).toEqual(["Chapter 1", "Chapter 2"]);
  });

  it("updates a section's content and status", async () => {
    const sections = await prisma.section.findMany({ where: { projectId } });
    const target = sections[0];

    const request = new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ status: "drafting", content: { type: "doc", content: [] } }),
    });

    const response = await PATCH(request as never, { params: Promise.resolve({ id: target.id }) });
    const body = await response.json();

    expect(body.status).toBe("drafting");
  });

  it("deletes a section", async () => {
    const sections = await prisma.section.findMany({ where: { projectId } });
    const target = sections[sections.length - 1];

    const response = await DELETE(new Request("http://localhost") as never, {
      params: Promise.resolve({ id: target.id }),
    });

    expect(response.status).toBe(204);
  });
});
