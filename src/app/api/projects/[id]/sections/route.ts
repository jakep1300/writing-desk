import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sections = await prisma.section.findMany({
    where: { projectId: id },
    orderBy: { order: "asc" },
  });
  return NextResponse.json(sections);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { title } = await request.json();

  const last = await prisma.section.findFirst({
    where: { projectId: id },
    orderBy: { order: "desc" },
  });

  const section = await prisma.section.create({
    data: {
      projectId: id,
      title,
      order: (last?.order ?? 0) + 1,
      content: EMPTY_DOC,
    },
  });

  return NextResponse.json(section, { status: 201 });
}
