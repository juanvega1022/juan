import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { env } from "@/lib/env";
import { syncConnectedAccount } from "@/lib/payouts";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stripe webhook. This is the ONLY place a purchase becomes `paid`, which is
 * what grants access to an idea body. The success redirect grants nothing.
 *
 * Platform endpoint events: checkout.session.completed,
 *   checkout.session.async_payment_succeeded, charge.refunded
 * Connect endpoint events: account.updated
 */
export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new NextResponse("Missing signature", { status: 400 });
  const payload = await request.text();

  let event: Stripe.Event | undefined;
  const secrets = [env.stripeWebhookSecret(), env.stripeConnectWebhookSecret()].filter(Boolean) as string[];
  for (const secret of secrets) {
    try {
      event = stripe().webhooks.constructEvent(payload, signature, secret);
      break;
    } catch {
      // try the next endpoint secret
    }
  }
  if (!event) return new NextResponse("Invalid signature", { status: 400 });

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await handleCheckoutPaid(event.data.object);
        break;
      case "charge.refunded":
        await handleChargeRefunded(event.data.object);
        break;
      case "account.updated":
        await syncConnectedAccount(event.data.object);
        break;
    }
  } catch (err) {
    console.error(`Webhook ${event.type} ${event.id} failed`, err);
    // Non-2xx makes Stripe retry later.
    return new NextResponse("Webhook handler failed", { status: 500 });
  }
  return NextResponse.json({ received: true });
}

async function handleCheckoutPaid(session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") return; // async methods finish later
  const purchaseId = session.metadata?.purchase_id;
  if (!purchaseId) return;

  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  const admin = createAdminClient();
  const { data: purchase, error } = await admin
    .from("purchases")
    .select("id, status, amount_cents, stripe_payment_intent_id")
    .eq("id", purchaseId)
    .single();
  if (error) throw error;

  if (purchase.status === "paid") {
    // Already unlocked. A second paid session for the same idea is a double charge: refund it.
    if (paymentIntentId && purchase.stripe_payment_intent_id !== paymentIntentId) {
      await stripe().refunds.create(
        { payment_intent: paymentIntentId, reverse_transfer: true, refund_application_fee: true },
        { idempotencyKey: `dup-refund-${paymentIntentId}` },
      );
    }
    return;
  }

  if (session.amount_total !== purchase.amount_cents) {
    throw new Error(`Amount mismatch for purchase ${purchaseId}: ${session.amount_total} != ${purchase.amount_cents}`);
  }

  const { error: updateError } = await admin
    .from("purchases")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      stripe_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId ?? null,
    })
    .eq("id", purchaseId)
    .neq("status", "paid");
  if (updateError) throw updateError;
}

async function handleChargeRefunded(charge: Stripe.Charge) {
  if (!charge.refunded) return; // partial refunds keep access
  const paymentIntentId =
    typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntentId) return;
  const { error } = await createAdminClient()
    .from("purchases")
    .update({ status: "refunded" })
    .eq("stripe_payment_intent_id", paymentIntentId)
    .eq("status", "paid");
  if (error) throw error;
}
