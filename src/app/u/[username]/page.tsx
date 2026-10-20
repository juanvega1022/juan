import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IdeaCard } from "@/components/IdeaCard";
import { Stars } from "@/components/Stars";
import { averageRating } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { PUBLIC_IDEA_COLUMNS, type Profile, type PublicIdea } from "@/lib/types";

async function loadProfile(username: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, username, bio, payouts_enabled, created_at")
    .eq("username", decodeURIComponent(username))
    .maybeSingle();
  return data as Profile | null;
}

export async function generateMetadata({ params }: PageProps<"/u/[username]">): Promise<Metadata> {
  const profile = await loadProfile((await params).username);
  return profile ? { title: `@${profile.username}`, description: profile.bio || undefined } : {};
}

export default async function CreatorPage({ params }: PageProps<"/u/[username]">) {
  const profile = await loadProfile((await params).username);
  if (!profile) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("ideas")
    .select(PUBLIC_IDEA_COLUMNS)
    .eq("author_id", profile.id)
    .eq("status", "live")
    .order("published_at", { ascending: false });
  const ideas = ((data ?? []) as unknown as PublicIdea[]).map((i) => ({
    ...i,
    author: { username: profile.username },
  }));

  const ratingSum = ideas.reduce((s, i) => s + i.rating_sum, 0);
  const ratingCount = ideas.reduce((s, i) => s + i.rating_count, 0);
  const unlocks = ideas.reduce((s, i) => s + i.unlock_count, 0);

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="font-display text-4xl font-semibold">@{profile.username}</h1>
        {profile.bio && <p className="max-w-2xl text-lg">{profile.bio}</p>}
        <div className="flex flex-wrap gap-4 text-sm text-muted">
          <span>{ideas.length} ideas</span>
          <span>{unlocks} unlocks</span>
          <Stars value={averageRating(ratingSum, ratingCount)} count={ratingCount} />
          <span>Joined {new Date(profile.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
        </div>
      </header>
      {ideas.length === 0 ? (
        <p className="text-muted">No live ideas yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {ideas.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} />
          ))}
        </div>
      )}
    </div>
  );
}
