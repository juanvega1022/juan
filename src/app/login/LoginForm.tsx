"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice } from "@/components/Notice";
import { sendMagicLink, signInWithGoogle, type LoginState } from "./actions";

export function LoginForm({ next, error }: { next: string; error?: string }) {
  const [state, action] = useActionState<LoginState, FormData>(sendMagicLink, {});

  if (state.sent) {
    return (
      <Notice tone="good">
        Check <strong>{state.sent}</strong> for a sign-in link. You can close this tab.
      </Notice>
    );
  }

  return (
    <div className="space-y-5">
      {(state.error || error) && <Notice tone="bad">{state.error ?? error}</Notice>}
      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <SubmitButton className="btn-ghost w-full py-3" pendingText="Redirecting…">
          Continue with Google
        </SubmitButton>
      </form>
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
      </div>
      <form action={action} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="input"
        />
        <SubmitButton className="btn-primary w-full py-3" pendingText="Sending…">
          Email me a magic link
        </SubmitButton>
      </form>
    </div>
  );
}
