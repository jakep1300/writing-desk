import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { PATCH as PATCH_CREATIVE } from "@/app/api/projects/[id]/creative-details/route";
import { PATCH as PATCH_RESEARCH } from "@/app/api/projects/[id]/research-details/route";
import { GET as GET_SOURCES, POST as POST_SOURCE } from "@/app/api/projects/[id]/sources/route";
import { PATCH as PATCH_SOURCE, DELETE as DELETE_SOURCE } from "@/app/api/sources/[id]/route";

describe("Planning details API", () => {
  let creativeProjectId: string;
  let researchProjectId: string;

  beforeAll(async () => {
    const creative = await prisma.project.create({
      data: { type: "CREATIVE", title: "Details Test Creative", creativeDetails: { create: {} } },
    });
    creativeProjectId = creative.id;

    const research = await prisma.project.create({
      data: { type: "RESEARCH", title: "Details Test Research", researchDetails: { create: {} } },
    });
    researchProjectId = research.id;
  });

  afterAll(async () => {
    await prisma.project.delete({ where: { id: creativeProjectId } });
    await prisma.project.delete({ where: { id: researchProjectId } });
    await prisma.$disconnect();
  });

  it("updates creative details", async () => {
    const request = new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ logline: "A story about a thing." }),
    });
    const response = await PATCH_CREATIVE(request as never, {
      params: Promise.resolve({ id: creativeProjectId }),
    });
    const body = await response.json();
    expect(body.logline).toBe("A story about a thing.");
  });

  it("updates research details", async () => {
    const request = new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ thesis: "Something is amiss." }),
    });
    const response = await PATCH_RESEARCH(request as never, {
      params: Promise.resolve({ id: researchProjectId }),
    });
    const body = await response.json();
    expect(body.thesis).toBe("Something is amiss.");
  });

  it("creates and lists sources", async () => {
    const createRequest = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ name: "Public records request", notes: "Filed 2026-07-01" }),
    });
    await POST_SOURCE(createRequest as never, { params: Promise.resolve({ id: researchProjectId }) });

    const listResponse = await GET_SOURCES(new Request("http://localhost") as never, {
      params: Promise.resolve({ id: researchProjectId }),
    });
    const sources = await listResponse.json();

    expect(sources.length).toBe(1);
    expect(sources[0].name).toBe("Public records request");
  });

  it("updates and deletes a source", async () => {
    const sources = await prisma.source.findMany({ where: { projectId: researchProjectId } });
    const target = sources[0];

    const patchRequest = new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ notes: "Response received" }),
    });
    const patchResponse = await PATCH_SOURCE(patchRequest as never, {
      params: Promise.resolve({ id: target.id }),
    });
    expect((await patchResponse.json()).notes).toBe("Response received");

    const deleteResponse = await DELETE_SOURCE(new Request("http://localhost") as never, {
      params: Promise.resolve({ id: target.id }),
    });
    expect(deleteResponse.status).toBe(204);
  });
});
