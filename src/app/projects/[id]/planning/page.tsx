import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import SectionList from "@/components/SectionList";
import PlanningFields from "@/components/PlanningFields";

export default async function PlanningPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      sections: { orderBy: { order: "asc" } },
      creativeDetails: true,
      researchDetails: true,
      sources: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!project) notFound();

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-6">
      <h1 className="text-2xl font-semibold">{project.title}</h1>

      <PlanningFields project={project} />

      <section>
        <h2 className="mb-2 text-lg font-medium">Sections</h2>
        <SectionList projectId={project.id} initialSections={project.sections} />
      </section>
    </main>
  );
}
