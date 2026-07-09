import Link from "next/link";

interface ProjectCardProps {
  id: string;
  title: string;
  type: "CREATIVE" | "RESEARCH";
}

export default function ProjectCard({ id, title, type }: ProjectCardProps) {
  return (
    <Link
      href={`/projects/${id}/planning`}
      className="block rounded-lg border p-4 hover:border-black"
    >
      <p className="font-medium">{title}</p>
      <p className="text-sm text-gray-500">{type === "CREATIVE" ? "Creative" : "Research"}</p>
    </Link>
  );
}
