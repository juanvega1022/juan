import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { formatPrice, timeAgo } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { dismissReport, removeIdea, resolveRefund, restoreIdea } from "./actions";

export const metadata: Metadata = { title: "Admin" };

interface ReportRow {
  id: string;
  reason: string;
  created_at: string;
  idea: { id: string; title: string; status: string } | null;
  reporter: { username: string } | null;
}

interface RefundRow {
  id: string;
  reason: string;
  created_at: string;
  purchase: {
    id: string;
    idea_id: string;
    buyer_id: string;
    amount_cents: number;
    paid_at: string | null;
    status: string;
    idea: { title: string } | null;
    buyer: { username: string } | null;
  } | null;
}

export default async function AdminPage() {
  await requireAdmin();
  const admin = createAdminClient();

  const [{ data: reportData }, { data: refundData }, { data: removedData }] = await Promise.all([
    admin
      .from("reports")
      .select("id, reason, created_at, idea:ideas(id, title, status), reporter:profiles!reports_reporter_id_fkey(username)")
      .is("resolved_at", null)
      .order("created_at", { ascending: true }),
    admin
      .from("refund_requests")
      .select(
        "id, reason, created_at, purchase:purchases(id, idea_id, buyer_id, amount_cents, paid_at, status, idea:ideas(title), buyer:profiles!purchases_buyer_id_fkey(username))",
      )
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    admin.from("ideas").select("id, title, updated_at").eq("status", "removed").order("updated_at", { ascending: false }).limit(20),
  ]);
  const reports = (reportData ?? []) as unknown as ReportRow[];
  const refunds = (refundData ?? []) as unknown as RefundRow[];

  return (
    <div className="space-y-10">
      <h1 className="font-display text-3xl font-semibold">Admin</h1>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Refund requests ({refunds.length})</h2>
        {refunds.length === 0 && <p className="text-muted">Nothing pending.</p>}
        {refunds.map((r) => (
          <div key={r.id} className="card flex flex-wrap items-start gap-4 p-4">
            <div className="min-w-0 flex-1 space-y-1">
              <Link href={`/idea/${r.purchase?.idea_id}`} className="font-medium hover:underline">
                {r.purchase?.idea?.title}
              </Link>
              <div className="text-sm text-muted">
                @{r.purchase?.buyer?.username} · {formatPrice(r.purchase?.amount_cents ?? 0)} · paid{" "}
                {timeAgo(r.purchase?.paid_at ?? null)} · requested {timeAgo(r.created_at)} · rated 1★
              </div>
              {r.reason && <p className="text-sm">“{r.reason}”</p>}
            </div>
            <form action={resolveRefund} className="flex gap-2">
              <input type="hidden" name="requestId" value={r.id} />
              <button name="decision" value="approve" className="btn-primary">
                Approve refund
              </button>
              <button name="decision" value="deny" className="btn-ghost">
                Deny
              </button>
            </form>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Open reports ({reports.length})</h2>
        {reports.length === 0 && <p className="text-muted">No open reports.</p>}
        {reports.map((r) => (
          <div key={r.id} className="card flex flex-wrap items-start gap-4 p-4">
            <div className="min-w-0 flex-1 space-y-1">
              <Link href={`/idea/${r.idea?.id}`} className="font-medium hover:underline">
                {r.idea?.title}
              </Link>{" "}
              <span className="text-xs text-muted uppercase">{r.idea?.status}</span>
              <div className="text-sm text-muted">
                reported by @{r.reporter?.username} · {timeAgo(r.created_at)}
              </div>
              <p className="text-sm">“{r.reason}”</p>
            </div>
            <div className="flex gap-2">
              {r.idea && r.idea.status !== "removed" && (
                <form action={removeIdea}>
                  <input type="hidden" name="ideaId" value={r.idea.id} />
                  <button className="btn-danger">Remove idea</button>
                </form>
              )}
              <form action={dismissReport}>
                <input type="hidden" name="reportId" value={r.id} />
                <button className="btn-ghost">Dismiss</button>
              </form>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Recently removed</h2>
        {(removedData ?? []).length === 0 && <p className="text-muted">None.</p>}
        {(removedData ?? []).map((i) => (
          <div key={i.id} className="card flex items-center gap-4 p-4">
            <Link href={`/idea/${i.id}`} className="flex-1 hover:underline">
              {i.title}
            </Link>
            <form action={restoreIdea}>
              <input type="hidden" name="ideaId" value={i.id} />
              <button className="btn-ghost">Restore as draft</button>
            </form>
          </div>
        ))}
      </section>
    </div>
  );
}
