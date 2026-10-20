import Link from "next/link";
import { IdeaCard } from "@/components/IdeaCard";
import { createClient } from "@/lib/supabase/server";
import {
  CATEGORIES,
  PUBLIC_IDEA_COLUMNS,
  SORTS,
  isCategory,
  isSort,
  type PublicIdea,
  type Sort,
} from "@/lib/types";

const PAGE_SIZE = 30;

export default async function FeedPage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const category = isCategory(params.category) ? params.category : null;
  const sort: Sort = isSort(params.sort) ? params.sort : "new";
  const page = Math.max(1, Number(params.page) || 1);

  const supabase = await createClient();
  let query = supabase
    .from("ideas")
    .select(`${PUBLIC_IDEA_COLUMNS}, author:profiles!ideas_author_id_fkey(username)`)
    .eq("status", "live");
  if (category) query = query.eq("category", category);
  if (sort === "top") query = query.order("rating_score", { ascending: false });
  if (sort === "unlocked") query = query.order("unlock_count", { ascending: false });
  query = query
    .order("published_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE); // one extra row tells us if there's more

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as unknown as PublicIdea[];
  const ideas = rows.slice(0, PAGE_SIZE);
  const hasMore = rows.length > PAGE_SIZE;

  const href = (next: { category?: string | null; sort?: Sort; page?: number }) => {
    const q = new URLSearchParams();
    const c = next.category === undefined ? category : next.category;
    const s = next.sort ?? sort;
    if (c) q.set("category", c);
    if (s !== "new") q.set("sort", s);
    if (next.page && next.page > 1) q.set("page", String(next.page));
    const qs = q.toString();
    return qs ? `/?${qs}` : "/";
  };

  return (
    <div className="space-y-6">
      <section className="py-4">
        <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          Ideas, sketched on a napkin.
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-muted">
          Every idea has a free one-line teaser. If it grabs you, unlock the full write-up. Creators
          keep 85%.
        </p>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <Link
            href={href({ category: null, page: 1 })}
            className={`chip ${!category ? "border-ink bg-ink text-paper" : "bg-card"}`}
          >
            All
          </Link>
          {CATEGORIES.map((c) => (
            <Link
              key={c.value}
              href={href({ category: c.value, page: 1 })}
              className={`chip ${category === c.value ? "border-ink bg-ink text-paper" : "bg-card"}`}
            >
              {c.label}
            </Link>
          ))}
        </div>
        <div className="flex gap-1 sm:ml-auto">
          {SORTS.map((s) => (
            <Link
              key={s.value}
              href={href({ sort: s.value, page: 1 })}
              className={`rounded-full px-3 py-1 text-sm ${
                sort === s.value ? "bg-card font-medium shadow-sm ring-1 ring-line" : "text-muted"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      {ideas.length === 0 ? (
        <div className="card p-10 text-center text-muted">
          No ideas here yet.{" "}
          <Link href="/post" className="text-accent underline">
            Be the first to sell one.
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {ideas.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} />
          ))}
        </div>
      )}

      <div className="flex justify-between">
        {page > 1 ? (
          <Link href={href({ page: page - 1 })} className="btn-ghost">
            ← Newer
          </Link>
        ) : (
          <span />
        )}
        {hasMore && (
          <Link href={href({ page: page + 1 })} className="btn-ghost">
            More ideas →
          </Link>
        )}
      </div>
    </div>
  );
}
