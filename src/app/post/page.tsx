import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/Notice";
import { getOwnProfile, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { IdeaForm, type IdeaDraft } from "./IdeaForm";
import { deleteIdea, unpublishIdea } from "./actions";

export const metadata: Metadata = { title: "Sell an idea" };

export default async function PostPage({ searchParams }: PageProps<"/post">) {
  const params = await searchParams;
  const id = typeof params.id === "string" ? params.id : null;
  const user = await requireUser(id ? `/post?id=${id}` : "/post");
  const profile = await getOwnProfile(user.id);

  let idea: IdeaDraft = { title: "", teaser: "", body: "", category: "app", price_cents: 500 };
  if (id) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("ideas")
      .select("id, title, teaser, category, price_cents, status, unlock_count")
      .eq("id", id)
      .eq("author_id", user.id)
      .maybeSingle();
    if (!data) notFound();
    const { data: body } = await supabase.rpc("get_idea_body", { p_idea_id: id });
    idea = { ...data, body: (body as string | null) ?? "" };
  }

  if (idea.status === "removed") {
    return <Notice tone="bad">This idea was removed by a moderator and can no longer be edited.</Notice>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">{id ? "Edit idea" : "Sell an idea"}</h1>
        <p className="mt-1 text-muted">
          A good teaser makes the promise; the full write-up keeps it.
        </p>
      </div>
      {params.payouts === "required" ? (
        <Notice>
          Draft saved. To publish it,{" "}
          <a href="/api/stripe/connect" className="font-medium underline">
            set up payouts with Stripe
          </a>{" "}
          — it takes a few minutes — then come back and hit Publish.
        </Notice>
      ) : (
        params.saved && <Notice tone="good">Draft saved.</Notice>
      )}
      <IdeaForm idea={idea} payoutsEnabled={profile.payouts_enabled} />
      {idea.id && (
        <div className="flex flex-wrap gap-3 border-t border-line pt-5">
          <Link href={`/idea/${idea.id}`} className="btn-ghost">
            View page
          </Link>
          {idea.status === "live" && (
            <form action={unpublishIdea}>
              <input type="hidden" name="id" value={idea.id} />
              <button className="btn-ghost">Unpublish</button>
            </form>
          )}
          {!idea.unlock_count && (
            <form action={deleteIdea}>
              <input type="hidden" name="id" value={idea.id} />
              <button className="btn-danger">Delete</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
