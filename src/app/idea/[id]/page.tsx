import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/Notice";
import { Stars } from "@/components/Stars";
import { SubmitButton } from "@/components/SubmitButton";
import { UnlockCelebration } from "@/components/UnlockCelebration";
import { getUser } from "@/lib/auth";
import { averageRating, categoryLabel, formatPrice, timeAgo } from "@/lib/format";
import { withinRefundWindow } from "@/lib/refunds";
import { createClient } from "@/lib/supabase/server";
import { PUBLIC_IDEA_COLUMNS, type PublicIdea, type Purchase, type Rating } from "@/lib/types";
import { startCheckout } from "./actions";
import { PaymentPending, RatingForm, RefundForm, ReportForm } from "./forms";

async function loadIdea(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("ideas")
    .select(`${PUBLIC_IDEA_COLUMNS}, author:profiles!ideas_author_id_fkey(username, bio)`)
    .eq("id", id)
    .maybeSingle();
  return data as unknown as (PublicIdea & { author: { username: string; bio: string } }) | null;
}

export async function generateMetadata({ params }: PageProps<"/idea/[id]">): Promise<Metadata> {
  const idea = await loadIdea((await params).id);
  return idea ? { title: idea.title, description: idea.teaser } : {};
}

export default async function IdeaPage({ params, searchParams }: PageProps<"/idea/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  const idea = await loadIdea(id);
  if (!idea) notFound();

  const supabase = await createClient();
  const user = await getUser();
  const isAuthor = user?.id === idea.author_id;

  let purchase: Purchase | null = null;
  let myRating: Rating | null = null;
  let refundStatus: string | null = null;
  let body: string | null = null;

  if (user) {
    const [p, r, b] = await Promise.all([
      supabase.from("purchases").select("*").eq("idea_id", id).eq("buyer_id", user.id).maybeSingle(),
      supabase.from("ratings").select("*").eq("idea_id", id).eq("buyer_id", user.id).maybeSingle(),
      // The only path to the body: a SECURITY DEFINER function that checks author or paid purchase.
      supabase.rpc("get_idea_body", { p_idea_id: id }),
    ]);
    purchase = p.data as Purchase | null;
    myRating = r.data as Rating | null;
    body = (b.data as string | null) ?? null;
    if (purchase) {
      const { data } = await supabase
        .from("refund_requests")
        .select("status")
        .eq("purchase_id", purchase.id)
        .maybeSingle();
      refundStatus = data?.status ?? null;
    }
  }

  const { data: ratingRows } = await supabase
    .from("ratings")
    .select("id, stars, comment, created_at, buyer:profiles!ratings_buyer_id_fkey(username)")
    .eq("idea_id", id)
    .order("created_at", { ascending: false })
    .limit(50);
  const ratings = (ratingRows ?? []) as unknown as Rating[];

  const unlocked = body !== null;
  const justUnlocked = query.checkout === "success" && unlocked && !isAuthor;
  const paid = purchase?.status === "paid";
  const canRefund =
    paid && purchase?.paid_at && withinRefundWindow(purchase.paid_at) && myRating?.stars === 1 && !refundStatus;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <article className="space-y-6">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <Link href={`/?category=${idea.category}`} className="chip bg-card">
            {categoryLabel(idea.category)}
          </Link>
          {idea.status !== "live" && <span className="chip uppercase">{idea.status}</span>}
          <span>{timeAgo(idea.published_at ?? idea.created_at)}</span>
        </div>
        <h1 className="font-display text-4xl leading-tight font-semibold sm:text-5xl">{idea.title}</h1>
        <p className="text-xl leading-relaxed">{idea.teaser}</p>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Stars value={averageRating(idea.rating_sum, idea.rating_count)} count={idea.rating_count} />
          <span className="text-muted">· {idea.unlock_count} unlocked</span>
          <span className="text-muted">
            · by{" "}
            <Link href={`/u/${idea.author.username}`} className="underline">
              @{idea.author.username}
            </Link>
          </span>
        </div>

        {query.checkout === "success" && !unlocked && purchase?.status === "pending" && <PaymentPending />}
        {justUnlocked && (
          <>
            <UnlockCelebration />
            <p className="-rotate-1 font-hand text-3xl text-accent">Unfolded! It&apos;s all yours.</p>
          </>
        )}
        {query.checkout === "cancelled" && <Notice>Checkout cancelled — you were not charged.</Notice>}
        {query.error === "unavailable" && (
          <Notice tone="bad">This idea isn&apos;t available for purchase right now.</Notice>
        )}
        {purchase?.status === "refunded" && <Notice>You were refunded for this idea.</Notice>}

        {unlocked ? (
          <section
            className={`card napkin-card napkin-lines p-6 text-[17px] whitespace-pre-wrap sm:p-8 ${
              justUnlocked ? "ink-in" : ""
            }`}
          >
            {body}
          </section>
        ) : (
          <a href="#unlock" className="sealed card napkin-card tilt-l relative block overflow-hidden p-6 sm:p-8">
            <div aria-hidden className="napkin-lines space-y-3 blur-[5px] select-none">
              <div className="h-4 w-11/12 rounded bg-line" />
              <div className="h-4 w-10/12 rounded bg-line" />
              <div className="h-4 w-9/12 rounded bg-line" />
              <div className="h-4 w-11/12 rounded bg-line" />
              <div className="h-4 w-7/12 rounded bg-line" />
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <span className="seal grid h-24 w-24 -rotate-12 place-items-center rounded-full border-4 border-double border-bad/70 bg-card/90 font-hand text-2xl leading-none font-bold text-bad/80 shadow-sm">
                SEALED
              </span>
              <span className="font-hand text-2xl text-muted">unlock to unfold it →</span>
            </div>
          </a>
        )}

        {isAuthor && (
          <div className="flex gap-3">
            <Link href={`/post?id=${idea.id}`} className="btn-ghost">
              Edit idea
            </Link>
          </div>
        )}

        {paid && (
          <section className="card space-y-3 p-5">
            <h2 className="font-semibold">Rate this idea</h2>
            <RatingForm ideaId={idea.id} current={myRating} />
            {refundStatus && (
              <Notice tone={refundStatus === "denied" ? "bad" : "info"}>
                {refundStatus === "pending"
                  ? "Refund requested. An admin will review it shortly."
                  : refundStatus === "approved"
                    ? "Your refund was approved."
                    : "Your refund request was declined."}
              </Notice>
            )}
            {canRefund && (
              <div className="space-y-2 border-t border-line pt-3">
                <p className="text-sm text-muted">
                  Not worth it? Within 24 hours of buying, a 1-star rating lets you request a refund.
                </p>
                <RefundForm ideaId={idea.id} />
              </div>
            )}
          </section>
        )}

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">Ratings</h2>
          {ratings.length === 0 ? (
            <p className="text-muted">No ratings yet. Only buyers can rate.</p>
          ) : (
            <ul className="space-y-3">
              {ratings.map((r) => (
                <li key={r.id} className="card p-4">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-warn">{"★".repeat(r.stars)}</span>
                    <span className="text-muted">
                      @{r.buyer?.username} · {timeAgo(r.created_at)}
                    </span>
                  </div>
                  {r.comment && <p className="mt-2">{r.comment}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        {user && !isAuthor && <ReportForm ideaId={idea.id} />}
      </article>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div id="unlock" className="card scroll-mt-20 space-y-4 p-5">
          <div className="inline-block -rotate-2 rounded-md bg-highlight px-3 font-hand text-5xl font-bold">
            {formatPrice(idea.price_cents)}
          </div>
          {isAuthor ? (
            <p className="text-sm text-muted">This is your idea. Buyers see the teaser until they pay.</p>
          ) : unlocked ? (
            <p className="text-sm text-good">You own this idea.</p>
          ) : !user ? (
            <Link href={`/login?next=/idea/${idea.id}`} className="btn-primary w-full py-3">
              Sign in to unlock
            </Link>
          ) : idea.status === "live" ? (
            <form action={startCheckout}>
              <input type="hidden" name="ideaId" value={idea.id} />
              <SubmitButton className="btn-primary w-full py-3" pendingText="Opening checkout…">
                Unlock for {formatPrice(idea.price_cents)}
              </SubmitButton>
            </form>
          ) : (
            <p className="text-sm text-muted">Not for sale right now.</p>
          )}
          <ul className="space-y-1 text-sm text-muted">
            <li>• Instant access after payment</li>
            <li>• {formatPrice(Math.round(idea.price_cents * 0.85))} goes to the creator</li>
            <li>• Sold as information, not exclusive rights</li>
            <li>• 1-star refund window: 24 hours</li>
          </ul>
        </div>
        <div className="card mt-4 p-5 text-sm">
          <Link href={`/u/${idea.author.username}`} className="font-medium hover:underline">
            @{idea.author.username}
          </Link>
          {idea.author.bio && <p className="mt-1 text-muted">{idea.author.bio}</p>}
        </div>
      </aside>
    </div>
  );
}
