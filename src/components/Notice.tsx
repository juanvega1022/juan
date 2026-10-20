export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "good" | "bad";
  children: React.ReactNode;
}) {
  const tones = {
    info: "border-accent/30 bg-accent/5",
    good: "border-good/30 bg-good/10",
    bad: "border-bad/30 bg-bad/10 text-bad",
  };
  return <div className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>;
}
