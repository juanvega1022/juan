import { NextResponse } from "next/server";
import { getOwnProfile, getUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { syncConnectedAccount } from "@/lib/payouts";
import { stripe } from "@/lib/stripe";

// Stripe sends creators here after onboarding. Refresh their payout status right away
// rather than waiting for the account.updated webhook.
export async function GET() {
  const site = env.siteUrl();
  const user = await getUser();
  if (!user) return NextResponse.redirect(`${site}/login?next=/me`);

  const profile = await getOwnProfile(user.id);
  if (profile.stripe_account_id) {
    const account = await stripe().accounts.retrieve(profile.stripe_account_id);
    await syncConnectedAccount(account);
  }
  return NextResponse.redirect(`${site}/me?onboarding=done`);
}
