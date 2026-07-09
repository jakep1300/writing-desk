import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const projects = await prisma.project.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(projects);
}

export async function POST(request: NextRequest) {
  const { type, title } = await request.json();

  const project = await prisma.project.create({
    data: {
      type,
      title,
      ...(type === "CREATIVE" ? { creativeDetails: { create: {} } } : {}),
      ...(type === "RESEARCH" ? { researchDetails: { create: {} } } : {}),
    },
  });

  return NextResponse.json(project, { status: 201 });
}
