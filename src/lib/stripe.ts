import "server-only";
import Stripe from "stripe";
import { env } from "@/lib/env";

let client: Stripe | undefined;

export function stripe(): Stripe {
  client ??= new Stripe(env.stripeSecretKey());
  return client;
}

/** Platform keeps 15%, creators keep 85%. */
export const PLATFORM_FEE_RATE = 0.15;

export function platformFee(priceCents: number): number {
  return Math.round(priceCents * PLATFORM_FEE_RATE);
}

/** Whether a connected account can receive destination-charge transfers. */
export function canReceivePayouts(account: Stripe.Account): boolean {
  return account.capabilities?.transfers === "active";
}
