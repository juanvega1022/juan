import type { Metadata } from "next";
import Link from "next/link";
import { IdeaCard } from "@/components/IdeaCard";
import { Notice } from "@/components/Notice";
import { getOwnProfile, requireUser } from "@/lib/auth";
import { formatPrice } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { PUBLIC_IDEA_COLUMNS, type PublicIdea } from "@/lib/types";
import { ProfileForm } from "./ProfileForm";

export const metadata: Metadata = { title: "Me" };

export default async function MePage({ searchParams }: PageProps<"/me">) {
  const params = await searchParams;
  const user = await requireUser("/me");
  const profile = await getOwnProfile(user.id);
  const supabase = await createClient();

  const { data: ideaRows } = await supabase
    .from("ideas")
    .select(PUBLIC_IDEA_COLUMNS)
    .eq("author_id", user.id)
    .order("created_at", { ascending: false });
  const myIdeas = (ideaRows ?? []) as unknown as PublicIdea[];

  const { data: sales } = myIdeas.length
    ? await supabase
        .from("purchases")
        .select("amount_cents, platform_fee_cents, status")
        .in("idea_id", myIdeas.map((i) => i.id))
        .eq("status", "paid")
    : { data: [] };
  const earnings = (sales ?? []).reduce((sum, s) => sum + s.amount_cents - s.platform_fee_cents, 0);

  const { data: unlockRows } = await supabase
    .from("purchases")
    .select(`paid_at, idea:ideas(${PUBLIC_IDEA_COLUMNS}, author:profiles!ideas_author_id_fkey(username))`)
    .eq("buyer_id", user.id)
    .eq("status", "paid")
    .order("paid_at", { ascending: false });
  const unlocks = (unlockRows ?? [])
    .map((r) => r.idea as unknown as PublicIdea | null)
    .filter((i): i is PublicIdea => i !== null);

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-semibold">@{profile.username}</h1>
        <Link href={`/u/${profile.username}`} className="text-sm text-muted underline">
          Public profile
        </Link>
        {profile.is_admin && (
          <Link href="/admin" className="text-sm text-muted underline">
            Admin
          </Link>
        )}
        <form action="/auth/signout" method="post" className="ml-auto">
          <button className="btn-ghost">Sign out</button>
        </form>
      </div>

      {params.onboarding === "done" &&
        (profile.payouts_enabled ? (
          <Notice tone="good">Payouts are set up. You can publish ideas now.</Notice>
        ) : (
          <Notice>Stripe is still reviewing your details. This page will update once you&apos;re approved.</Notice>
        ))}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <div className="text-sm text-muted">Earnings (after 15% fee)</div>
          <div className="font-display text-3xl font-semibold">{formatPrice(earnings)}</div>
          <div className="text-sm text-muted">{sales?.length ?? 0} unlocks</div>
        </div>
        <div className="card p-5 sm:col-span-2">
          <div className="text-sm text-muted">Payouts</div>
          {profile.payouts_enabled ? (
            <div className="mt-1 space-y-2">
              <div className="font-medium text-good">Active — Stripe pays out to your bank.</div>
              <a href="/api/stripe/dashboard" className="btn-ghost">
                Open Stripe dashboard
              </a>
            </div>
          ) : (
            <div className="mt-1 space-y-2">
              <div>
                {profile.stripe_account_id
                  ? "Onboarding not finished yet."
                  : "Connect a Stripe account before your first idea goes live."}
              </div>
              <a href="/api/stripe/connect" className="btn-primary">
                {profile.stripe_account_id ? "Continue Stripe setup" : "Set up payouts"}
              </a>
            </div>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center">
          <h2 className="font-display text-2xl font-semibold">My ideas</h2>
          <Link href="/post" className="btn-primary ml-auto">
            New idea
          </Link>
        </div>
        {myIdeas.length === 0 ? (
          <p className="text-muted">You haven&apos;t written any ideas yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {myIdeas.map((idea) => (
              <div key={idea.id} className="space-y-2">
                <IdeaCard idea={idea} showStatus />
                {idea.status !== "removed" && (
                  <Link href={`/post?id=${idea.id}`} className="text-sm text-muted underline">
                    Edit
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl font-semibold">My unlocks</h2>
        {unlocks.length === 0 ? (
          <p className="text-muted">
            Nothing yet.{" "}
            <Link href="/" className="underline">
              Browse ideas
            </Link>
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {unlocks.map((idea) => (
              <IdeaCard key={idea.id} idea={idea} />
            ))}
          </div>
        )}
      </section>

      <section className="max-w-md space-y-4">
        <h2 className="font-display text-2xl font-semibold">Profile</h2>
        <ProfileForm username={profile.username} bio={profile.bio} />
      </section>
    </div>
  );
}
