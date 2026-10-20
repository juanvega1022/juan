export const CATEGORIES = [
  { value: "app", label: "Apps" },
  { value: "business", label: "Business" },
  { value: "side-hustle", label: "Side hustles" },
  { value: "product", label: "Products" },
  { value: "content", label: "Content" },
  { value: "game", label: "Games" },
  { value: "other", label: "Other" },
] as const;

export type Category = (typeof CATEGORIES)[number]["value"];
export type IdeaStatus = "draft" | "live" | "removed";
export type PurchaseStatus = "pending" | "paid" | "refunded";

export const SORTS = [
  { value: "new", label: "New" },
  { value: "top", label: "Top rated" },
  { value: "unlocked", label: "Most unlocked" },
] as const;

export type Sort = (typeof SORTS)[number]["value"];

/** Columns that are safe to show anyone. Never add `body` here. */
export const PUBLIC_IDEA_COLUMNS =
  "id, author_id, title, teaser, category, price_cents, status, unlock_count, rating_count, rating_sum, published_at, created_at";

export interface PublicIdea {
  id: string;
  author_id: string;
  title: string;
  teaser: string;
  category: Category;
  price_cents: number;
  status: IdeaStatus;
  unlock_count: number;
  rating_count: number;
  rating_sum: number;
  published_at: string | null;
  created_at: string;
  author?: { username: string } | null;
}

export interface Profile {
  id: string;
  username: string;
  bio: string;
  payouts_enabled: boolean;
  created_at: string;
}

export interface Rating {
  id: string;
  idea_id: string;
  buyer_id: string;
  stars: number;
  comment: string;
  created_at: string;
  buyer?: { username: string } | null;
}

export interface Purchase {
  id: string;
  idea_id: string;
  buyer_id: string;
  amount_cents: number;
  platform_fee_cents: number;
  status: PurchaseStatus;
  paid_at: string | null;
  created_at: string;
}

export function isCategory(v: unknown): v is Category {
  return CATEGORIES.some((c) => c.value === v);
}

export function isSort(v: unknown): v is Sort {
  return SORTS.some((s) => s.value === v);
}
