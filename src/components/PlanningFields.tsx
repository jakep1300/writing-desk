"use client";
import { useState } from "react";

interface Source {
  id: string;
  name: string;
  notes: string;
}

interface PlanningFieldsProps {
  project: {
    id: string;
    type: "CREATIVE" | "RESEARCH";
    creativeDetails: { overview: string; logline: string; characters: string } | null;
    researchDetails: { topic: string; thesis: string } | null;
    sources: Source[];
  };
}

export default function PlanningFields({ project }: PlanningFieldsProps) {
  if (project.type === "CREATIVE") {
    return <CreativeFields projectId={project.id} details={project.creativeDetails!} />;
  }
  return <ResearchFields projectId={project.id} details={project.researchDetails!} sources={project.sources} />;
}

function CreativeFields({
  projectId,
  details,
}: {
  projectId: string;
  details: { overview: string; logline: string; characters: string };
}) {
  const [overview, setOverview] = useState(details.overview);
  const [logline, setLogline] = useState(details.logline);
  const [characters, setCharacters] = useState(details.characters);

  function save(field: string, value: string) {
    fetch(`/api/projects/${projectId}/creative-details`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium">Logline</label>
        <textarea
          className="w-full rounded border px-3 py-2"
          value={logline}
          onChange={(e) => setLogline(e.target.value)}
          onBlur={() => save("logline", logline)}
        />
      </div>
      <div>
        <label className="block text-sm font-medium">Overview</label>
        <textarea
          className="w-full rounded border px-3 py-2"
          rows={4}
          value={overview}
          onChange={(e) => setOverview(e.target.value)}
          onBlur={() => save("overview", overview)}
        />
      </div>
      <div>
        <label className="block text-sm font-medium">Characters</label>
        <textarea
          className="w-full rounded border px-3 py-2"
          rows={4}
          value={characters}
          onChange={(e) => setCharacters(e.target.value)}
          onBlur={() => save("characters", characters)}
        />
      </div>
    </div>
  );
}

function ResearchFields({
  projectId,
  details,
  sources,
}: {
  projectId: string;
  details: { topic: string; thesis: string };
  sources: Source[];
}) {
  const [topic, setTopic] = useState(details.topic);
  const [thesis, setThesis] = useState(details.thesis);
  const [sourceList, setSourceList] = useState(sources);
  const [newSourceName, setNewSourceName] = useState("");

  function save(field: string, value: string) {
    fetch(`/api/projects/${projectId}/research-details`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
  }

  async function addSource() {
    if (!newSourceName.trim()) return;
    const res = await fetch(`/api/projects/${projectId}/sources`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newSourceName, notes: "" }),
    });
    const source = await res.json();
    setSourceList([...sourceList, source]);
    setNewSourceName("");
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium">Topic & Angle</label>
        <textarea
          className="w-full rounded border px-3 py-2"
          rows={3}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onBlur={() => save("topic", topic)}
        />
      </div>
      <div>
        <label className="block text-sm font-medium">Thesis</label>
        <textarea
          className="w-full rounded border px-3 py-2"
          rows={3}
          value={thesis}
          onChange={(e) => setThesis(e.target.value)}
          onBlur={() => save("thesis", thesis)}
        />
      </div>
      <div>
        <label className="block text-sm font-medium">Sources</label>
        <ul className="mb-2 space-y-1">
          {sourceList.map((s) => (
            <li key={s.id} className="text-sm">{s.name}</li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded border px-3 py-2"
            placeholder="New source"
            value={newSourceName}
            onChange={(e) => setNewSourceName(e.target.value)}
          />
          <button onClick={addSource} className="rounded bg-black px-4 py-2 text-white">
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
