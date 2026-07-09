import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const settings = await prisma.settings.upsert({
    where: { id: "global" },
    create: { id: "global" },
    update: {},
  });
  return NextResponse.json(settings);
}

export async function PATCH(request: NextRequest) {
  const updates = await request.json();
  const settings = await prisma.settings.update({
    where: { id: "global" },
    data: updates,
  });
  return NextResponse.json(settings);
}
