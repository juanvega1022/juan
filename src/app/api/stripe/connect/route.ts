import { NextResponse } from "next/server";
import { getOwnProfile, getUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

// Starts (or resumes) Stripe Connect Express onboarding for the signed-in creator.
export async function GET() {
  const site = env.siteUrl();
  const user = await getUser();
  if (!user) return NextResponse.redirect(`${site}/login?next=/api/stripe/connect`);

  const profile = await getOwnProfile(user.id);
  let accountId = profile.stripe_account_id;

  if (!accountId) {
    // Express-style account: Stripe-hosted onboarding and dashboard, platform pays fees.
    const account = await stripe().accounts.create(
      {
        email: user.email,
        controller: {
          stripe_dashboard: { type: "express" },
          fees: { payer: "application" },
          losses: { payments: "application" },
          requirement_collection: "stripe",
        },
        capabilities: { transfers: { requested: true } },
        business_profile: { product_description: "Selling written ideas on Napkin" },
        metadata: { profile_id: user.id },
      },
      { idempotencyKey: `connect-account-${user.id}` },
    );
    accountId = account.id;
    const { error } = await createAdminClient()
      .from("profiles")
      .update({ stripe_account_id: accountId })
      .eq("id", user.id)
      .is("stripe_account_id", null);
    if (error) throw error;
  }

  const link = await stripe().accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${site}/api/stripe/connect`,
    return_url: `${site}/api/stripe/connect/return`,
  });
  return NextResponse.redirect(link.url);
}
