"use client";
import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function NewProjectForm() {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"CREATIVE" | "RESEARCH">("CREATIVE");
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, title }),
    });

    if (res.ok) {
      const project = await res.json();
      router.push(`/projects/${project.id}/planning`);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded bg-black px-4 py-2 text-white">
        New Project
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border p-4">
      <input
        className="w-full rounded border px-3 py-2"
        placeholder="Project title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />
      <div className="flex gap-3">
        <label className="flex items-center gap-1">
          <input
            type="radio"
            checked={type === "CREATIVE"}
            onChange={() => setType("CREATIVE")}
          />
          Creative
        </label>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            checked={type === "RESEARCH"}
            onChange={() => setType("RESEARCH")}
          />
          Research
        </label>
      </div>
      <button className="rounded bg-black px-4 py-2 text-white" type="submit">
        Create
      </button>
    </form>
  );
}
