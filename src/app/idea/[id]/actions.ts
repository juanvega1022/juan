"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { REFUND_WINDOW_HOURS, withinRefundWindow } from "@/lib/refunds";
import { platformFee, stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; ok?: string };

/**
 * Creates a pending purchase and a Stripe Checkout Session with a destination
 * charge to the creator. Access is granted only by the webhook, never here.
 */
export async function startCheckout(formData: FormData) {
  const ideaId = String(formData.get("ideaId"));
  const user = await requireUser(`/idea/${ideaId}`);
  const admin = createAdminClient();

  const { data: idea } = await admin
    .from("ideas")
    .select("id, title, teaser, price_cents, status, author_id, author:profiles!ideas_author_id_fkey(stripe_account_id, payouts_enabled)")
    .eq("id", ideaId)
    .maybeSingle();
  const author = idea?.author as unknown as { stripe_account_id: string | null; payouts_enabled: boolean } | null;
  if (!idea || idea.status !== "live" || !author?.stripe_account_id || !author.payouts_enabled) {
    redirect(`/idea/${ideaId}?error=unavailable`);
  }
  if (idea.author_id === user.id) redirect(`/idea/${ideaId}`);

  const { data: existing } = await admin
    .from("purchases")
    .select("id, status, stripe_session_id")
    .eq("idea_id", ideaId)
    .eq("buyer_id", user.id)
    .maybeSingle();
  if (existing?.status === "paid") redirect(`/idea/${ideaId}`);

  const amount = idea.price_cents;
  const fee = platformFee(amount);

  // One row per (idea, buyer). Re-use it for retries and repurchases after a refund.
  let purchaseId = existing?.id as string | undefined;
  if (existing) {
    const { error } = await admin
      .from("purchases")
      .update({ status: "pending", amount_cents: amount, platform_fee_cents: fee, paid_at: null, stripe_payment_intent_id: null })
      .eq("id", existing.id);
    if (error) throw error;
    // Close any earlier unpaid session so the buyer can't pay twice.
    if (existing.stripe_session_id) {
      await stripe().checkout.sessions.expire(existing.stripe_session_id).catch(() => undefined);
    }
  } else {
    const { data, error } = await admin
      .from("purchases")
      .insert({ idea_id: ideaId, buyer_id: user.id, amount_cents: amount, platform_fee_cents: fee, status: "pending" })
      .select("id")
      .single();
    if (error) throw error;
    purchaseId = data.id;
  }

  const site = env.siteUrl();
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    customer_email: user.email,
    client_reference_id: purchaseId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amount,
          product_data: { name: `Napkin idea: ${idea.title}`, description: idea.teaser },
        },
      },
    ],
    payment_intent_data: {
      application_fee_amount: fee,
      transfer_data: { destination: author.stripe_account_id },
      metadata: { purchase_id: purchaseId!, idea_id: ideaId, buyer_id: user.id },
    },
    metadata: { purchase_id: purchaseId!, idea_id: ideaId, buyer_id: user.id },
    success_url: `${site}/idea/${ideaId}?checkout=success`,
    cancel_url: `${site}/idea/${ideaId}?checkout=cancelled`,
  });

  await admin.from("purchases").update({ stripe_session_id: session.id }).eq("id", purchaseId);
  redirect(session.url!);
}

export async function rateIdea(_prev: FormState, formData: FormData): Promise<FormState> {
  const ideaId = String(formData.get("ideaId"));
  const user = await requireUser(`/idea/${ideaId}`);
  const stars = Number(formData.get("stars"));
  const comment = String(formData.get("comment") ?? "").trim().slice(0, 1000);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return { error: "Pick 1 to 5 stars." };

  // RLS allows this only when the user holds a paid purchase.
  const supabase = await createClient();
  // Not an upsert: ON CONFLICT DO UPDATE would need UPDATE rights on idea_id/buyer_id.
  const { data: existing } = await supabase
    .from("ratings")
    .select("id")
    .eq("idea_id", ideaId)
    .eq("buyer_id", user.id)
    .maybeSingle();
  const { error } = existing
    ? await supabase.from("ratings").update({ stars, comment }).eq("id", existing.id)
    : await supabase.from("ratings").insert({ idea_id: ideaId, buyer_id: user.id, stars, comment });
  if (error) return { error: "Only buyers can rate this idea." };

  revalidatePath(`/idea/${ideaId}`);
  return { ok: "Thanks for rating." };
}

export async function reportIdea(_prev: FormState, formData: FormData): Promise<FormState> {
  const ideaId = String(formData.get("ideaId"));
  const user = await requireUser(`/idea/${ideaId}`);
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 3) return { error: "Tell us briefly what is wrong." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("reports")
    .insert({ idea_id: ideaId, reporter_id: user.id, reason: reason.slice(0, 1000) });
  if (error?.code === "23505") return { ok: "You already reported this idea. We'll take a look." };
  if (error) return { error: "Could not send the report." };
  return { ok: "Thanks. A moderator will review it." };
}

export async function requestRefund(_prev: FormState, formData: FormData): Promise<FormState> {
  const ideaId = String(formData.get("ideaId"));
  const user = await requireUser(`/idea/${ideaId}`);
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 1000);
  const admin = createAdminClient();

  const { data: purchase } = await admin
    .from("purchases")
    .select("id, status, paid_at")
    .eq("idea_id", ideaId)
    .eq("buyer_id", user.id)
    .maybeSingle();
  if (!purchase || purchase.status !== "paid" || !purchase.paid_at) return { error: "No paid purchase found." };
  if (!withinRefundWindow(purchase.paid_at)) {
    return { error: `Refunds can be requested within ${REFUND_WINDOW_HOURS} hours of purchase.` };
  }

  const { data: rating } = await admin
    .from("ratings")
    .select("stars")
    .eq("idea_id", ideaId)
    .eq("buyer_id", user.id)
    .maybeSingle();
  if (rating?.stars !== 1) return { error: "Refunds are available when you rate the idea 1 star." };

  const { error } = await admin.from("refund_requests").insert({ purchase_id: purchase.id, reason });
  if (error?.code === "23505") return { ok: "Your refund request is already with us." };
  if (error) return { error: "Could not submit the request." };

  revalidatePath(`/idea/${ideaId}`);
  return { ok: "Refund requested. An admin will review it shortly." };
}
