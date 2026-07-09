"use client";
import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [targets, setTargets] = useState({ smallTarget: 250, mediumTarget: 750, bigTarget: 1500 });

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setTargets);
  }, []);

  function update(field: keyof typeof targets, value: number) {
    const next = { ...targets, [field]: value };
    setTargets(next);
    fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
  }

  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-xl font-semibold">Session Word Targets</h1>
      {(["smallTarget", "mediumTarget", "bigTarget"] as const).map((field) => (
        <div key={field}>
          <label className="block text-sm font-medium capitalize">
            {field.replace("Target", "")}
          </label>
          <input
            type="number"
            className="w-full rounded border px-3 py-2"
            value={targets[field]}
            onChange={(e) => update(field, Number(e.target.value))}
          />
        </div>
      ))}
    </main>
  );
}
