import { NapkinMark } from "@/components/NapkinLogo";

const NAPKINS = [
  { top: "8%", right: "4%", size: "h-16 w-16", tilt: "-14deg", delay: "0s" },
  { top: "62%", right: "16%", size: "h-10 w-10", tilt: "10deg", delay: "1.2s" },
  { top: "28%", right: "28%", size: "h-8 w-8", tilt: "22deg", delay: "2.4s" },
];

/** A few napkins drifting in the hero background. */
export function FloatingNapkins() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden md:block">
      {NAPKINS.map((n, i) => (
        <div
          key={i}
          className="absolute animate-float opacity-70"
          style={{ top: n.top, right: n.right, ["--tilt" as string]: n.tilt, animationDelay: n.delay }}
        >
          <NapkinMark className={n.size} />
        </div>
      ))}
    </div>
  );
}
