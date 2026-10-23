import Link from "next/link";
import { Stars } from "@/components/Stars";
import { averageRating, categoryLabel, formatPrice, timeAgo } from "@/lib/format";
import type { PublicIdea } from "@/lib/types";

export function IdeaCard({
  idea,
  showStatus = false,
  index = 0,
}: {
  idea: PublicIdea;
  showStatus?: boolean;
  index?: number;
}) {
  return (
    <Link
      href={`/idea/${idea.id}`}
      className={`card napkin-card group flex animate-rise flex-col gap-3 p-5 ${index % 2 ? "tilt-r" : "tilt-l"}`}
      style={{ animationDelay: `${Math.min(index, 10) * 60}ms` }}
    >
      <div className="flex items-center gap-2 pr-6 text-xs text-muted">
        <span className="chip px-2 py-0.5 text-xs">{categoryLabel(idea.category)}</span>
        {showStatus && idea.status !== "live" && (
          <span className="chip px-2 py-0.5 text-xs uppercase">{idea.status}</span>
        )}
        <span className="ml-auto">{timeAgo(idea.published_at ?? idea.created_at)}</span>
      </div>
      <h2 className="font-display text-xl leading-snug font-semibold group-hover:text-accent">
        {idea.title}
      </h2>
      <p className="text-[15px] leading-relaxed">{idea.teaser}</p>
      <div className="mt-auto flex items-center gap-3 pt-2 text-sm">
        <Stars value={averageRating(idea.rating_sum, idea.rating_count)} count={idea.rating_count} />
        <span className="text-muted">· {idea.unlock_count} unlocked</span>
        <span className="ml-auto -rotate-3 rounded-md bg-highlight px-2.5 py-0.5 font-hand text-2xl leading-tight font-bold transition-transform group-hover:rotate-2">
          {formatPrice(idea.price_cents)}
        </span>
      </div>
      {idea.author && <div className="font-hand text-xl text-muted">— @{idea.author.username}</div>}
    </Link>
  );
}
