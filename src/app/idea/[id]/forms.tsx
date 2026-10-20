"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { rateIdea, reportIdea, requestRefund, type FormState } from "./actions";

export function RatingForm({
  ideaId,
  current,
}: {
  ideaId: string;
  current: { stars: number; comment: string } | null;
}) {
  const [state, action] = useActionState<FormState, FormData>(rateIdea, {});
  const [stars, setStars] = useState(current?.stars ?? 0);
  const [hover, setHover] = useState(0);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="ideaId" value={ideaId} />
      <input type="hidden" name="stars" value={stars} />
      <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onClick={() => setStars(n)}
            onMouseEnter={() => setHover(n)}
            className={`text-3xl leading-none ${(hover || stars) >= n ? "text-warn" : "text-line"}`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        name="comment"
        rows={2}
        defaultValue={current?.comment}
        className="input"
        placeholder="What did you think? (optional)"
        maxLength={1000}
      />
      {state.error && <Notice tone="bad">{state.error}</Notice>}
      {state.ok && <Notice tone="good">{state.ok}</Notice>}
      <SubmitButton className="btn-ghost" pendingText="Saving…">
        {current ? "Update rating" : "Submit rating"}
      </SubmitButton>
    </form>
  );
}

export function ReportForm({ ideaId }: { ideaId: string }) {
  const [state, action] = useActionState<FormState, FormData>(reportIdea, {});
  const [open, setOpen] = useState(false);

  if (state.ok) return <p className="text-sm text-muted">{state.ok}</p>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm text-muted underline">
        Report this idea
      </button>
    );
  }
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="ideaId" value={ideaId} />
      <textarea
        name="reason"
        rows={2}
        className="input"
        placeholder="Plagiarised, illegal, harmful, misleading…"
        required
        minLength={3}
      />
      {state.error && <Notice tone="bad">{state.error}</Notice>}
      <div className="flex gap-2">
        <SubmitButton className="btn-danger" pendingText="Sending…">
          Send report
        </SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function RefundForm({ ideaId }: { ideaId: string }) {
  const [state, action] = useActionState<FormState, FormData>(requestRefund, {});
  if (state.ok) return <Notice tone="good">{state.ok}</Notice>;
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="ideaId" value={ideaId} />
      <textarea name="reason" rows={2} className="input" placeholder="Why wasn't it worth it? (optional)" />
      {state.error && <Notice tone="bad">{state.error}</Notice>}
      <SubmitButton className="btn-ghost" pendingText="Sending…">
        Request a refund
      </SubmitButton>
    </form>
  );
}

/** After Stripe redirects back, poll until the webhook has marked the purchase paid. */
export function PaymentPending() {
  const router = useRouter();
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (tries >= 15) return;
    const t = setTimeout(() => {
      router.refresh();
      setTries((n) => n + 1);
    }, 2000);
    return () => clearTimeout(t);
  }, [tries, router]);

  return (
    <Notice>
      {tries < 15
        ? "Payment received — confirming with Stripe. This usually takes a few seconds…"
        : "Still waiting for Stripe to confirm. Refresh in a minute; if it persists, contact support."}
    </Notice>
  );
}
