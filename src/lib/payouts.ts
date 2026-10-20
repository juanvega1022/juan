import "server-only";
import type Stripe from "stripe";
import { canReceivePayouts } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/** Mirror a connected account's status onto the creator's profile. */
export async function syncConnectedAccount(account: Stripe.Account) {
  const { error } = await createAdminClient()
    .from("profiles")
    .update({ payouts_enabled: canReceivePayouts(account) })
    .eq("stripe_account_id", account.id);
  if (error) throw error;
}
