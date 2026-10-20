"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export async function removeIdea(formData: FormData) {
  await requireAdmin();
  const ideaId = String(formData.get("ideaId"));
  const admin = createAdminClient();
  await admin.from("ideas").update({ status: "removed" }).eq("id", ideaId);
  await admin.from("reports").update({ resolved_at: new Date().toISOString() }).eq("idea_id", ideaId).is("resolved_at", null);
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function restoreIdea(formData: FormData) {
  await requireAdmin();
  const ideaId = String(formData.get("ideaId"));
  await createAdminClient().from("ideas").update({ status: "draft" }).eq("id", ideaId);
  revalidatePath("/admin");
}

export async function dismissReport(formData: FormData) {
  await requireAdmin();
  await createAdminClient()
    .from("reports")
    .update({ resolved_at: new Date().toISOString() })
    .eq("id", String(formData.get("reportId")));
  revalidatePath("/admin");
}

export async function resolveRefund(formData: FormData) {
  await requireAdmin();
  const requestId = String(formData.get("requestId"));
  const approve = formData.get("decision") === "approve";
  const admin = createAdminClient();

  const { data: request } = await admin
    .from("refund_requests")
    .select("id, status, purchase:purchases(id, status, stripe_payment_intent_id)")
    .eq("id", requestId)
    .single();
  const purchase = request?.purchase as unknown as
    | { id: string; status: string; stripe_payment_intent_id: string | null }
    | null;
  if (!request || request.status !== "pending" || !purchase) return;

  if (approve) {
    if (purchase.status === "paid" && purchase.stripe_payment_intent_id) {
      // Pull the creator's share back and refund our fee too, so the buyer gets the full amount.
      await stripe().refunds.create(
        {
          payment_intent: purchase.stripe_payment_intent_id,
          reverse_transfer: true,
          refund_application_fee: true,
          metadata: { refund_request_id: request.id },
        },
        { idempotencyKey: `refund-request-${request.id}` },
      );
      await admin.from("purchases").update({ status: "refunded" }).eq("id", purchase.id);
    }
  }

  await admin
    .from("refund_requests")
    .update({ status: approve ? "approved" : "denied", resolved_at: new Date().toISOString() })
    .eq("id", request.id);
  revalidatePath("/admin");
}
