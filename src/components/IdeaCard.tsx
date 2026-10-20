import Link from "next/link";
import { Stars } from "@/components/Stars";
import { averageRating, categoryLabel, formatPrice, timeAgo } from "@/lib/format";
import type { PublicIdea } from "@/lib/types";

export function IdeaCard({ idea, showStatus = false }: { idea: PublicIdea; showStatus?: boolean }) {
  return (
    <Link
      href={`/idea/${idea.id}`}
      className="card group flex flex-col gap-3 p-5 transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-center gap-2 text-xs text-muted">
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
        <span className="ml-auto rounded-full bg-ink px-3 py-1 font-medium text-paper">
          {formatPrice(idea.price_cents)}
        </span>
      </div>
      {idea.author && <div className="text-sm text-muted">by @{idea.author.username}</div>}
    </Link>
  );
}
