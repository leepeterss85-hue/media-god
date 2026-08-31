import React from "react";

export default function GenreTags({ genreIds, labelMap, onSelect, max = 2 }) {
  const tags = (genreIds || [])
    .map((id) => ({ id: String(id), label: labelMap[String(id)] }))
    .filter((g) => g.label)
    .slice(0, max);
  if (!tags.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {tags.map((g) => (
        <button
          key={g.id}
          onClick={() => onSelect(g.id)}
          className="text-[10px] leading-none px-1.5 py-1 rounded bg-white/10 text-white/70 hover:bg-mg-green hover:text-black transition-colors"
        >
          {g.label}
        </button>
      ))}
    </div>
  );
}