"use client";

import { useActionState, useState } from "react";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { CATEGORIES } from "@/lib/types";
import { saveIdea, type PostState } from "./actions";

export interface IdeaDraft {
  id?: string;
  title: string;
  teaser: string;
  body: string;
  category: string;
  price_cents: number;
  status?: string;
  unlock_count?: number;
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-sm text-bad">{message}</p> : null;
}

export function IdeaForm({ idea, payoutsEnabled }: { idea: IdeaDraft; payoutsEnabled: boolean }) {
  const [state, action] = useActionState<PostState, FormData>(saveIdea, {});
  // Controlled fields: React resets uncontrolled forms after an action, which
  // would wipe the creator's text whenever validation fails.
  const [title, setTitle] = useState(idea.title);
  const [teaser, setTeaser] = useState(idea.teaser);
  const [body, setBody] = useState(idea.body);
  const [category, setCategory] = useState(idea.category);
  const [price, setPrice] = useState(String(idea.price_cents / 100));
  const [confirmed, setConfirmed] = useState(false);
  const locked = (idea.unlock_count ?? 0) > 0;
  const fe = state.fieldErrors ?? {};
  const priceNum = Number(price) || 0;

  return (
    <form action={action} className="space-y-5">
      {idea.id && <input type="hidden" name="id" value={idea.id} />}
      {state.error && <Notice tone="bad">{state.error}</Notice>}

      <div>
        <label className="label" htmlFor="title">
          Title
        </label>
        <input
          id="title"
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="input"
          maxLength={120}
          required
        />
        <FieldError message={fe.title} />
      </div>

      <div>
        <label className="label" htmlFor="teaser">
          Teaser <span className="font-normal text-muted">— free for everyone to read</span>
        </label>
        <textarea
          id="teaser"
          name="teaser"
          rows={2}
          value={teaser}
          onChange={(e) => setTeaser(e.target.value)}
          className="input"
          maxLength={280}
          required
          placeholder="One line that makes people want to know more, without giving it away."
        />
        <div className="mt-1 flex text-xs text-muted">
          <FieldError message={fe.teaser} />
          <span className="ml-auto">{teaser.length}/280</span>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="body">
          The full idea <span className="font-normal text-muted">— sealed until someone pays</span>
        </label>
        {locked ? (
          <>
            <input type="hidden" name="body" value={idea.body} />
            <div className="napkin-lines card px-4 py-3 whitespace-pre-wrap opacity-80">{idea.body}</div>
            <p className="mt-1 text-sm text-muted">
              Someone has already bought this idea, so the full text and price are locked.
            </p>
          </>
        ) : (
          <textarea
            id="body"
            name="body"
            rows={14}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="input napkin-lines"
            maxLength={20000}
            placeholder="The problem, the insight, how it would work, who would pay, first steps…"
          />
        )}
        <FieldError message={fe.body} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="category">
            Category
          </label>
          <select
            id="category"
            name="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="input"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="price">
            Price (USD)
          </label>
          <input
            id="price"
            name="price"
            type="number"
            min={1}
            max={500}
            step="0.5"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            readOnly={locked}
            className="input"
            required
          />
          <p className="mt-1 text-xs text-muted">
            You keep ${(priceNum * 0.85).toFixed(2)} per unlock (85%).
          </p>
          <FieldError message={fe.price} />
        </div>
      </div>

      {idea.status !== "live" && (
        <div>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="confirm"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-1"
            />
            <span>
              This idea is my own, it isn&apos;t confidential to an employer or anyone else, and I
              understand it is sold as information, not as exclusive rights.
            </span>
          </label>
          <FieldError message={fe.confirm} />
        </div>
      )}

      {!payoutsEnabled && (
        <Notice>
          You can save drafts now. To publish, first{" "}
          <a href="/api/stripe/connect" className="font-medium underline">
            set up payouts with Stripe
          </a>
          .
        </Notice>
      )}

      <div className="flex flex-wrap gap-3">
        <SubmitButton name="intent" value="publish" pendingText="Publishing…">
          {idea.status === "live" ? "Save changes" : "Publish"}
        </SubmitButton>
        {idea.status !== "live" && (
          <SubmitButton name="intent" value="draft" className="btn-ghost" pendingText="Saving…">
            Save draft
          </SubmitButton>
        )}
      </div>
    </form>
  );
}
