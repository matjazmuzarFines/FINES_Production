"use client";

export function FilterChips({
  items,
  value,
  onChange,
  hintPrefix,
}: {
  items: string[];
  value: string;
  onChange: (v: string) => void;
  hintPrefix: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const active = item === value;
        return (
          <button
            key={item}
            type="button"
            title={`${hintPrefix}: ${item}`}
            aria-pressed={active}
            onClick={() => onChange(item)}
            className={`h-9 rounded-full border px-4 text-sm font-semibold transition-colors ${
              active
                ? "border-fines-500 bg-fines-500 text-white"
                : "border-ink-200 bg-white text-ink-600 hover:border-fines-500 hover:text-fines-500"
            }`}
          >
            {item}
          </button>
        );
      })}
    </div>
  );
}
