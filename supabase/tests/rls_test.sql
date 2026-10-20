-- RLS / privilege tests. Run against a scratch Postgres with:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/auth_stub.sql \
--        -f supabase/migrations/*.sql -f supabase/tests/rls_test.sql
-- Each check raises on failure.

\set QUIET on

-- Fixtures (as superuser, i.e. the service role).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin@example.com');

update public.profiles set payouts_enabled = true where id = '00000000-0000-0000-0000-00000000000a';
update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-0000000000ad';

insert into public.ideas (id, author_id, title, teaser, body, category, price_cents, status) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'Live idea', 'A teaser that is long enough', 'SECRET BODY of the live idea', 'app', 500, 'live'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a',
   'Draft idea', 'A draft teaser long enough', 'SECRET BODY of the draft idea', 'app', 500, 'draft');

-- Bob has paid for the live idea; Carol has only a pending purchase.
insert into public.purchases (idea_id, buyer_id, amount_cents, platform_fee_cents, status, paid_at) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 500, 75, 'paid', now()),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 500, 75, 'pending', null);

do $$ begin
  assert (select unlock_count from public.ideas where id = '10000000-0000-0000-0000-000000000001') = 1,
    'unlock_count should be 1';
end $$;

create or replace function pg_temp.act_as(uid text) returns void language plpgsql as $$
begin
  if uid is null then
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claim.sub', '', true);
  else
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claim.sub', uid, true);
  end if;
end $$;

-- 1. Anonymous users cannot select the body column at all.
begin;
select pg_temp.act_as(null);
do $$ begin
  begin
    perform body from public.ideas;
    raise exception 'FAIL: anon could select ideas.body';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.ideas) = 1, 'anon should see only the live idea';
end $$;
rollback;

-- 2. Signed-in non-buyer: no body column, get_idea_body returns null.
begin;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
do $$ begin
  begin
    perform body from public.ideas;
    raise exception 'FAIL: authenticated could select ideas.body';
  exception when insufficient_privilege then null;
  end;
  assert public.get_idea_body('10000000-0000-0000-0000-000000000001') is null,
    'pending buyer must not get the body';
end $$;
rollback;

-- 3. Paid buyer gets the body; author gets body of drafts too.
begin;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
do $$ begin
  assert public.get_idea_body('10000000-0000-0000-0000-000000000001') like 'SECRET%',
    'paid buyer should get the body';
  assert public.get_idea_body('10000000-0000-0000-0000-000000000002') is null,
    'buyer must not get an unrelated draft body';
  assert (select count(*) from public.ideas where id = '10000000-0000-0000-0000-000000000002') = 0,
    'buyer must not see author drafts';
end $$;
rollback;

begin;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
do $$ begin
  assert public.get_idea_body('10000000-0000-0000-0000-000000000002') like 'SECRET%',
    'author should get draft body';
  assert (select count(*) from public.purchases) = 2, 'author sees purchases of their ideas';
end $$;
rollback;

-- 4. Users cannot write purchases, cannot flip their own payouts/admin flags.
begin;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
do $$ begin
  begin
    insert into public.purchases (idea_id, buyer_id, amount_cents, platform_fee_cents, status)
    values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000c', 1, 0, 'paid');
    raise exception 'FAIL: user inserted a purchase';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.purchases set status = 'paid';
    raise exception 'FAIL: user updated a purchase';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set is_admin = true where id = auth.uid();
    raise exception 'FAIL: user made themself admin';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set payouts_enabled = true where id = auth.uid();
    raise exception 'FAIL: user enabled their own payouts';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.purchases) = 1, 'carol sees only her own purchase';
end $$;
rollback;

-- 5. Publishing requires payouts; authors cannot remove; only own ideas.
begin;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
do $$ begin
  insert into public.ideas (author_id, title, teaser, body, price_cents)
  values (auth.uid(), 'Carol draft', 'Carol teaser long enough', 'Carol full body long enough', 300);
  begin
    update public.ideas set status = 'live' where author_id = auth.uid();
    raise exception 'FAIL: published without payouts';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  update public.ideas set title = 'hijacked' where id = '10000000-0000-0000-0000-000000000001';
  assert (select title from public.ideas where id = '10000000-0000-0000-0000-000000000001') = 'Live idea',
    'user must not edit others ideas';
end $$;
rollback;

begin;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
do $$ begin
  begin
    update public.ideas set status = 'removed' where id = '10000000-0000-0000-0000-000000000002';
    raise exception 'FAIL: author removed an idea';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    update public.ideas set body = 'Changed body after sale!!' where id = '10000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: body changed after a sale';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  -- Author can still fix the teaser of a sold idea.
  update public.ideas set teaser = 'An updated teaser text' where id = '10000000-0000-0000-0000-000000000001';
end $$;
rollback;

-- 6. Ratings require a paid purchase and keep stats in sync.
begin;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
do $$ begin
  begin
    insert into public.ratings (idea_id, buyer_id, stars) values
      ('10000000-0000-0000-0000-000000000001', auth.uid(), 5);
    raise exception 'FAIL: non-buyer rated';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

begin;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
do $$ begin
  insert into public.ratings (idea_id, buyer_id, stars, comment) values
    ('10000000-0000-0000-0000-000000000001', auth.uid(), 4, 'nice');
  assert (select rating_count from public.ideas where id = '10000000-0000-0000-0000-000000000001') = 1, 'rating_count';
  update public.ratings set stars = 1 where buyer_id = auth.uid();
  assert (select rating_sum from public.ideas where id = '10000000-0000-0000-0000-000000000001') = 1, 'rating_sum';
end $$;
rollback;

-- 7. Refund revokes access and decrements unlock_count.
begin;
update public.purchases set status = 'refunded' where buyer_id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
do $$ begin
  assert public.get_idea_body('10000000-0000-0000-0000-000000000001') is null, 'refunded buyer loses access';
  assert (select unlock_count from public.ideas where id = '10000000-0000-0000-0000-000000000001') = 0, 'unlock_count after refund';
end $$;
rollback;

-- 8. Admin can remove; removed ideas disappear from public view and buyers lose the body.
begin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000ad');
update public.ideas set status = 'removed' where id = '10000000-0000-0000-0000-000000000001';
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
do $$ begin
  assert public.get_idea_body('10000000-0000-0000-0000-000000000001') is null, 'removed idea body hidden';
  assert (select count(*) from public.ideas) = 0, 'removed idea hidden';
end $$;
rollback;

-- 9. Reports: users file their own, cannot read others'.
begin;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
insert into public.reports (idea_id, reporter_id, reason)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'plagiarised');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
do $$ begin
  assert (select count(*) from public.reports) = 0, 'other users cannot read reports';
end $$;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000ad');
do $$ begin
  assert (select count(*) from public.reports) = 1, 'admin reads reports';
end $$;
rollback;

