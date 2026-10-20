export function Stars({ value, count }: { value: number | null; count?: number }) {
  if (value === null) {
    return <span className="text-sm text-muted">No ratings yet</span>;
  }
  const rounded = Math.round(value);
  return (
    <span className="inline-flex items-center gap-1 text-sm" title={`${value.toFixed(1)} out of 5`}>
      <span aria-hidden className="tracking-tight text-warn">
        {"★".repeat(rounded)}
        <span className="text-line">{"★".repeat(5 - rounded)}</span>
      </span>
      <span className="text-muted">
        {value.toFixed(1)}
        {count !== undefined && ` (${count})`}
      </span>
    </span>
  );
}
