"use client";

import { useEffect, useState } from "react";

// Deterministic "random" numbers so server and client render the same markup.
function rand(i: number, salt: number) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// Rounded so the server and browser produce identical style strings.
const r = (n: number) => Math.round(n * 100) / 100;

const PIECES = Array.from({ length: 36 }, (_, i) => ({
  left: r(rand(i, 1) * 100),
  size: r(14 + rand(i, 2) * 20),
  drift: r((rand(i, 3) - 0.5) * 260),
  spin: r((rand(i, 4) - 0.5) * 900),
  delay: r(1.5 + rand(i, 5) * 0.8),
  dur: r(1.8 + rand(i, 6) * 1.4),
  scribble: rand(i, 7) > 0.6,
}));

/**
 * Plays once after a purchase unlocks: a folded napkin opens flap by flap and
 * zooms toward the reader while little napkins rain down.
 */
export function UnlockCelebration() {
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Drop ?checkout=success so a reload doesn't replay it.
    const url = new URL(window.location.href);
    url.searchParams.delete("checkout");
    window.history.replaceState(null, "", url);
    const t = setTimeout(() => setDone(true), 4600);
    return () => clearTimeout(t);
  }, []);

  if (done) return null;

  return (
    <div aria-hidden className="unlock-overlay pointer-events-none fixed inset-0 z-50 overflow-hidden">
      <div className="unlock-stage absolute inset-0 grid place-items-center">
        <div className="napkin-fold-wrap">
          {/* A square napkin folded in quarters. The right half swings open, then both
              bottom flaps drop down, then a lightbulb scribble draws itself. */}
          <div className="napkin-fold">
            <div className="quarter q-tl" />
            <div className="quarter q-bl" />
            <div className="half-right">
              <div className="quarter q-tr" />
              <div className="quarter q-br" />
            </div>
            <svg viewBox="0 0 200 200" className="napkin-doodle">
              <path d="M100 52 c-26 0 -40 20 -40 38 c0 14 8 22 15 30 c5 6 6 12 6 18 h38 c0 -6 1 -12 6 -18 c7 -8 15 -16 15 -30 c0 -18 -14 -38 -40 -38z" />
              <path d="M84 150 h32 M88 160 h24" />
              <path d="M100 30 v-12 M146 46 l9 -9 M54 46 l-9 -9 M164 92 h12 M36 92 h-12" />
            </svg>
          </div>
        </div>
      </div>
      {PIECES.map((p, i) => (
        <span
          key={i}
          className={`napkin-confetti ${p.scribble ? "has-scribble" : ""}`}
          style={
            {
              left: `${p.left}%`,
              "--size": `${p.size}px`,
              "--drift": `${p.drift}px`,
              "--spin": `${p.spin}deg`,
              "--delay": `${p.delay}s`,
              "--dur": `${p.dur}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
