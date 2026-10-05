"use client";

/** Enoten izbirnik: DA/NE ali ocene 1-5. */

export type ChoiceOption<T> = {
  value: T;
  label: string;
  hint: string;
  tone: "ok" | "nok" | "neutral";
};

const SELECTED = {
  ok: "bg-ok-500 border-ok-500 text-white",
  nok: "bg-nok-500 border-nok-500 text-white",
  neutral: "bg-fines-500 border-fines-500 text-white",
};

export function ChoiceGroup<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T | null;
  options: ChoiceOption<T>[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={String(o.value)}
            type="button"
            title={o.hint}
            aria-label={o.hint}
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`h-11 min-w-12 rounded-lg border-2 px-3 text-sm font-bold transition-colors disabled:opacity-50 ${
              active
                ? SELECTED[o.tone]
                : "border-ink-200 bg-white text-ink-600 hover:border-fines-500"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function daNeOptions(subject: string): ChoiceOption<"DA" | "NE">[] {
  return [
    { value: "DA", label: "DA", hint: `${subject}: DA`, tone: "ok" },
    { value: "NE", label: "NE", hint: `${subject}: NE`, tone: "nok" },
  ];
}

export function scoreOptions(subject: string): ChoiceOption<number>[] {
  return [1, 2, 3, 4, 5].map((n) => ({
    value: n,
    label: String(n),
    hint: `${subject}: ocena ${n}`,
    tone: n <= 2 ? "nok" : n >= 4 ? "ok" : "neutral",
  }));
}
