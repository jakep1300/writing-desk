import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const updates = await request.json();

  const details = await prisma.researchDetails.update({
    where: { projectId: id },
    data: updates,
  });

  return NextResponse.json(details);
}
