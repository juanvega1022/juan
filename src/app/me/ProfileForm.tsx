"use client";

import { useActionState } from "react";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { updateProfile, type ProfileState } from "./actions";

export function ProfileForm({ username, bio }: { username: string; bio: string }) {
  const [state, action] = useActionState<ProfileState, FormData>(updateProfile, {});
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="label" htmlFor="username">
          Username
        </label>
        <div className="flex items-center gap-1">
          <span className="text-muted">@</span>
          <input id="username" name="username" defaultValue={username} className="input" required />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="bio">
          Bio
        </label>
        <textarea id="bio" name="bio" defaultValue={bio} rows={3} maxLength={500} className="input" />
      </div>
      {state.error && <Notice tone="bad">{state.error}</Notice>}
      {state.ok && <Notice tone="good">{state.ok}</Notice>}
      <SubmitButton className="btn-ghost" pendingText="Saving…">
        Save profile
      </SubmitButton>
    </form>
  );
}
