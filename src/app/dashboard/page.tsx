import { prisma } from "@/lib/db";
import ProjectCard from "@/components/ProjectCard";
import NewProjectForm from "@/components/NewProjectForm";

export default async function DashboardPage() {
  const projects = await prisma.project.findMany({ orderBy: { createdAt: "desc" } });
  const creative = projects.filter((p) => p.type === "CREATIVE");
  const research = projects.filter((p) => p.type === "RESEARCH");

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Writing Desk</h1>
        <NewProjectForm />
      </div>

      <section>
        <h2 className="mb-2 text-lg font-medium">Creative</h2>
        <div className="grid grid-cols-2 gap-3">
          {creative.map((p) => (
            <ProjectCard key={p.id} id={p.id} title={p.title} type={p.type} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">Research</h2>
        <div className="grid grid-cols-2 gap-3">
          {research.map((p) => (
            <ProjectCard key={p.id} id={p.id} title={p.title} type={p.type} />
          ))}
        </div>
      </section>
    </main>
  );
}
