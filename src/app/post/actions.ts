"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getOwnProfile, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CATEGORIES } from "@/lib/types";

export type PostState = { error?: string; fieldErrors?: Record<string, string> };

const schema = z.object({
  title: z.string().trim().min(3, "At least 3 characters.").max(120, "Keep it under 120 characters."),
  teaser: z.string().trim().min(10, "At least 10 characters.").max(280, "Keep it under 280 characters."),
  body: z.string().trim().max(20000, "Keep it under 20,000 characters."),
  category: z.enum(CATEGORIES.map((c) => c.value) as [string, ...string[]]),
  price: z.coerce.number().min(1, "Minimum price is $1.").max(500, "Maximum price is $500."),
});

export async function saveIdea(_prev: PostState, formData: FormData): Promise<PostState> {
  const user = await requireUser("/post");
  const id = String(formData.get("id") ?? "") || null;
  const publish = formData.get("intent") === "publish";

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors };
  }
  const { title, teaser, body, category, price } = parsed.data;

  const supabase = await createClient();
  const { data: existing } = id
    ? await supabase
        .from("ideas")
        .select("id, status, unlock_count")
        .eq("id", id)
        .eq("author_id", user.id)
        .maybeSingle()
    : { data: null };
  if (id && !existing) return { error: "Idea not found." };

  if (publish && existing?.status !== "live") {
    if (body.length < 20) return { fieldErrors: { body: "Write at least 20 characters before publishing." } };
    if (formData.get("confirm") !== "on") {
      return { fieldErrors: { confirm: "Please confirm this idea is yours to sell." } };
    }
  }

  // Without payouts, save as a draft instead and send the creator to Stripe setup.
  const needsPayouts = publish && !(await getOwnProfile(user.id)).payouts_enabled;
  const goLive = publish && !needsPayouts;

  const values = {
    title,
    teaser,
    body,
    category,
    price_cents: Math.round(price * 100),
    ...(goLive ? { status: "live" } : {}),
  };

  let ideaId = id;
  if (existing) {
    // Body and price are frozen once someone has paid; only send the editable fields.
    const update =
      existing.unlock_count > 0
        ? { title, teaser, category, ...(goLive ? { status: "live" } : {}) }
        : values;
    const { error } = await supabase.from("ideas").update(update).eq("id", existing.id);
    if (error) return { error: friendly(error.message) };
  } else {
    const { data, error } = await supabase
      .from("ideas")
      .insert({ ...values, author_id: user.id })
      .select("id")
      .single();
    if (error) return { error: friendly(error.message) };
    ideaId = data.id;
  }

  revalidatePath("/");
  revalidatePath("/me");
  if (needsPayouts) redirect(`/post?id=${ideaId}&saved=1&payouts=required`);
  redirect(goLive ? `/idea/${ideaId}` : `/post?id=${ideaId}&saved=1`);
}

export async function unpublishIdea(formData: FormData) {
  const user = await requireUser("/me");
  const id = String(formData.get("id"));
  const supabase = await createClient();
  await supabase.from("ideas").update({ status: "draft" }).eq("id", id).eq("author_id", user.id);
  revalidatePath("/");
  revalidatePath("/me");
  redirect(`/post?id=${id}`);
}

export async function deleteIdea(formData: FormData) {
  const user = await requireUser("/me");
  const id = String(formData.get("id"));
  const supabase = await createClient();
  // RLS only allows deleting ideas nobody has bought.
  await supabase.from("ideas").delete().eq("id", id).eq("author_id", user.id);
  revalidatePath("/me");
  redirect("/me");
}

function friendly(message: string) {
  if (message.includes("Stripe payout setup")) return "Set up payouts with Stripe before publishing.";
  return message;
}
