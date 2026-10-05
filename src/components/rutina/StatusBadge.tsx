export function StatusBadge({
  izpolnjeno,
  odstopanje,
  spremenjeno,
}: {
  izpolnjeno: boolean;
  odstopanje: boolean;
  spremenjeno?: boolean;
}) {
  const [cls, text, hint] = !izpolnjeno
    ? ["bg-ink-100 text-ink-600", "Ni izpolnjeno", "Vsa vprašanja še niso odgovorjena"]
    : odstopanje
      ? ["bg-nok-50 text-nok-600", "Odstopanje", "Izpolnjeno, vsaj ena postavka odstopa"]
      : ["bg-ok-50 text-ok-600", "OK", "Izpolnjeno, brez odstopanj"];
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <span title={hint} className={`rounded-full px-3 py-1 text-xs font-bold ${cls}`}>
        {text}
      </span>
      {spremenjeno && (
        <span title="Spremembe še niso shranjene" className="text-[11px] font-semibold text-warn-700">
          ● neshranjeno
        </span>
      )}
    </div>
  );
}
