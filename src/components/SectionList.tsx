"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Section {
  id: string;
  title: string;
  order: number;
  status: string;
}

interface SectionListProps {
  projectId: string;
  initialSections: Section[];
}

export default function SectionList({ projectId, initialSections }: SectionListProps) {
  const [sections, setSections] = useState(initialSections);
  const [newTitle, setNewTitle] = useState("");
  const router = useRouter();

  async function addSection() {
    if (!newTitle.trim()) return;
    const res = await fetch(`/api/projects/${projectId}/sections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle }),
    });
    const section = await res.json();
    setSections([...sections, section]);
    setNewTitle("");
  }

  async function removeSection(id: string) {
    await fetch(`/api/sections/${id}`, { method: "DELETE" });
    setSections(sections.filter((s) => s.id !== id));
  }

  async function move(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sections.length) return;

    const a = sections[index];
    const b = sections[targetIndex];

    await fetch(`/api/sections/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: b.order }),
    });
    await fetch(`/api/sections/${b.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: a.order }),
    });

    const reordered = [...sections];
    reordered[index] = { ...b, order: a.order };
    reordered[targetIndex] = { ...a, order: b.order };
    setSections(reordered);
  }

  return (
    <div className="space-y-2">
      {sections.map((s, i) => (
        <div key={s.id} className="flex items-center justify-between rounded border p-2">
          <button
            className="text-left hover:underline"
            onClick={() => router.push(`/projects/${projectId}/write?section=${s.id}`)}
          >
            {s.title} <span className="text-xs text-gray-500">({s.status})</span>
          </button>
          <div className="flex gap-1">
            <button onClick={() => move(i, -1)} className="px-2">↑</button>
            <button onClick={() => move(i, 1)} className="px-2">↓</button>
            <button onClick={() => removeSection(s.id)} className="px-2 text-red-600">✕</button>
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <input
          className="flex-1 rounded border px-3 py-2"
          placeholder="New section title"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <button onClick={addSection} className="rounded bg-black px-4 py-2 text-white">
          Add
        </button>
      </div>
    </div>
  );
}
