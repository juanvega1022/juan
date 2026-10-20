-- Napkin: initial schema, RLS and grants.
--
-- The one rule that matters: ideas.body never reaches a client unless the
-- viewer is the author or holds a paid purchase. We enforce that with
-- column-level privileges (anon/authenticated cannot SELECT ideas.body at all)
-- plus a SECURITY DEFINER function, get_idea_body(), that does the check.

create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type idea_status as enum ('draft', 'live', 'removed');
create type purchase_status as enum ('pending', 'paid', 'refunded');
create type refund_status as enum ('pending', 'approved', 'denied');

create type idea_category as enum (
  'app', 'business', 'side-hustle', 'product', 'content', 'game', 'other'
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username citext not null unique
    check (username ~ '^[a-zA-Z0-9_]{3,24}$'),
  bio text not null default '' check (char_length(bio) <= 500),
  stripe_account_id text unique,
  payouts_enabled boolean not null default false,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 120),
  teaser text not null check (char_length(teaser) between 10 and 280),
  body text not null default '' check (char_length(body) <= 20000),
  category idea_category not null default 'other',
  price_cents integer not null check (price_cents between 100 and 50000),
  status idea_status not null default 'draft',
  -- Denormalised stats, maintained by triggers below. Clients cannot write them.
  unlock_count integer not null default 0,
  rating_count integer not null default 0,
  rating_sum integer not null default 0,
  -- Average pulled toward 3 stars until an idea has a few ratings, for "top rated".
  rating_score numeric generated always as ((rating_sum + 9.0) / (rating_count + 3)) stored,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ideas_feed_new on public.ideas (published_at desc) where status = 'live';
create index ideas_feed_top on public.ideas (rating_score desc) where status = 'live';
create index ideas_feed_unlocked on public.ideas (unlock_count desc) where status = 'live';
create index ideas_author on public.ideas (author_id);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.ideas (id) on delete restrict,
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  platform_fee_cents integer not null check (platform_fee_cents >= 0),
  stripe_session_id text unique,
  stripe_payment_intent_id text unique,
  status purchase_status not null default 'pending',
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (idea_id, buyer_id)
);

create index purchases_buyer on public.purchases (buyer_id);

create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.ideas (id) on delete cascade,
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  unique (idea_id, buyer_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.ideas (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 1000),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (idea_id, reporter_id)
);

create table public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null unique references public.purchases (id) on delete cascade,
  reason text not null default '' check (char_length(reason) <= 1000),
  status refund_status not null default 'pending',
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.has_paid_purchase(p_idea_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.purchases
    where idea_id = p_idea_id and buyer_id = auth.uid() and status = 'paid'
  );
$$;

-- The only way a client can read an idea body.
create or replace function public.get_idea_body(p_idea_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select i.body
  from public.ideas i
  where i.id = p_idea_id
    and auth.uid() is not null
    and (
      i.author_id = auth.uid()
      or (i.status <> 'removed' and public.has_paid_purchase(i.id))
    );
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- New auth user -> profile with a unique placeholder username.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  base text;
  candidate text;
begin
  base := lower(regexp_replace(split_part(coalesce(new.email, 'user'), '@', 1), '[^a-zA-Z0-9_]', '', 'g'));
  if char_length(base) < 3 then base := 'user' || base; end if;
  base := left(base, 18);
  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    candidate := base || '_' || substr(md5(random()::text), 1, 4);
  end loop;
  insert into public.profiles (id, username) values (new.id, candidate);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Guard idea status transitions and stamp timestamps.
create or replace function public.ideas_before_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Stat-only updates (from the purchase/rating triggers) skip the author checks.
  if tg_op = 'UPDATE'
     and (new.title, new.teaser, new.body, new.category, new.price_cents, new.status)
         is not distinct from
         (old.title, old.teaser, old.body, old.category, old.price_cents, old.status) then
    return new;
  end if;

  new.updated_at := now();

  -- Only admins (or the service role, where auth.uid() is null) may remove or restore.
  if auth.uid() is not null and not public.is_admin() then
    if new.status = 'removed' and (tg_op = 'INSERT' or old.status <> 'removed') then
      raise exception 'only admins can remove ideas';
    end if;
    if tg_op = 'UPDATE' and old.status = 'removed' then
      raise exception 'this idea was removed and cannot be edited';
    end if;
  end if;

  if new.status = 'live' and (tg_op = 'INSERT' or old.status <> 'live') then
    if not exists (
      select 1 from public.profiles where id = new.author_id and payouts_enabled
    ) then
      raise exception 'finish Stripe payout setup before publishing';
    end if;
    if char_length(new.body) < 20 then
      raise exception 'the full idea must be at least 20 characters';
    end if;
    new.published_at := coalesce(new.published_at, now());
  end if;

  -- Once anyone has paid, the body and price are frozen so buyers get what they paid for.
  if tg_op = 'UPDATE' and old.unlock_count > 0
     and (new.body is distinct from old.body or new.price_cents <> old.price_cents)
     and auth.uid() is not null then
    raise exception 'ideas with buyers cannot change their body or price';
  end if;

  return new;
end;
$$;

create trigger ideas_before_write
  before insert or update on public.ideas
  for each row execute function public.ideas_before_write();

-- Keep ideas.unlock_count in sync with paid purchases.
create or replace function public.purchases_sync_stats()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.status = new.status then
    return new;
  end if;
  if new.status = 'paid' then
    update public.ideas set unlock_count = unlock_count + 1 where id = new.idea_id;
  end if;
  if tg_op = 'UPDATE' and old.status = 'paid' then
    update public.ideas set unlock_count = greatest(unlock_count - 1, 0) where id = new.idea_id;
  end if;
  return new;
end;
$$;

create trigger purchases_sync_stats
  after insert or update of status on public.purchases
  for each row execute function public.purchases_sync_stats();

-- Keep ideas.rating_count / rating_sum in sync.
create or replace function public.ratings_sync_stats()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.ideas
      set rating_count = rating_count - 1, rating_sum = rating_sum - old.stars
      where id = old.idea_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.ideas
      set rating_count = rating_count + 1, rating_sum = rating_sum + new.stars
      where id = new.idea_id;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger ratings_sync_stats
  after insert or update or delete on public.ratings
  for each row execute function public.ratings_sync_stats();

-- ---------------------------------------------------------------------------
-- Privileges. Column grants are what keep ideas.body out of client queries.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant usage on schema public to anon, authenticated;

grant select (id, username, bio, payouts_enabled, created_at)
  on public.profiles to anon, authenticated;
grant update (username, bio) on public.profiles to authenticated;

grant select (
  id, author_id, title, teaser, category, price_cents, status,
  unlock_count, rating_count, rating_sum, rating_score, published_at, created_at, updated_at
) on public.ideas to anon, authenticated;
grant insert (author_id, title, teaser, body, category, price_cents, status)
  on public.ideas to authenticated;
grant update (title, teaser, body, category, price_cents, status)
  on public.ideas to authenticated;
grant delete on public.ideas to authenticated;

grant select on public.purchases to authenticated;

grant select on public.ratings to anon, authenticated;
grant insert (idea_id, buyer_id, stars, comment) on public.ratings to authenticated;
grant update (stars, comment) on public.ratings to authenticated;

grant select, insert (idea_id, reporter_id, reason) on public.reports to authenticated;

grant select on public.refund_requests to authenticated;

grant execute on function public.get_idea_body(uuid) to authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.has_paid_purchase(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.ideas enable row level security;
alter table public.purchases enable row level security;
alter table public.ratings enable row level security;
alter table public.reports enable row level security;
alter table public.refund_requests enable row level security;

-- profiles
create policy "profiles are public" on public.profiles
  for select using (true);
create policy "users edit their own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ideas
create policy "live ideas are public; authors, buyers and admins see the rest" on public.ideas
  for select using (
    status = 'live'
    or author_id = auth.uid()
    or public.is_admin()
    or (status = 'draft' and public.has_paid_purchase(id))
  );
create policy "authors create their own ideas" on public.ideas
  for insert to authenticated with check (author_id = auth.uid());
create policy "authors edit their own ideas" on public.ideas
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "admins moderate ideas" on public.ideas
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "authors delete unsold drafts" on public.ideas
  for delete to authenticated using (author_id = auth.uid() and unlock_count = 0);

-- purchases: written only by the server (service role) and the Stripe webhook.
create policy "buyers and authors see purchases" on public.purchases
  for select to authenticated using (
    buyer_id = auth.uid()
    or exists (select 1 from public.ideas i where i.id = idea_id and i.author_id = auth.uid())
    or public.is_admin()
  );

-- ratings: only buyers with a paid purchase.
create policy "ratings are public" on public.ratings
  for select using (true);
create policy "paid buyers rate" on public.ratings
  for insert to authenticated with check (
    buyer_id = auth.uid() and public.has_paid_purchase(idea_id)
  );
create policy "paid buyers edit their rating" on public.ratings
  for update to authenticated
  using (buyer_id = auth.uid())
  with check (buyer_id = auth.uid() and public.has_paid_purchase(idea_id));

-- reports
create policy "signed-in users report" on public.reports
  for insert to authenticated with check (reporter_id = auth.uid());
create policy "reporters and admins see reports" on public.reports
  for select to authenticated using (reporter_id = auth.uid() or public.is_admin());

-- refund requests: created and resolved by the server; buyers and admins can read.
create policy "buyers and admins see refund requests" on public.refund_requests
  for select to authenticated using (
    public.is_admin()
    or exists (select 1 from public.purchases p where p.id = purchase_id and p.buyer_id = auth.uid())
  );
