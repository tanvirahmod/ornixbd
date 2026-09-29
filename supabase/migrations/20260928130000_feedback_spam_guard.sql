-- ── Feedback spam guard ─────────────────────────────────────────────────────
-- The contact form's math captcha only runs in the browser — anyone with the
-- public anon key can POST to /rest/v1/feedback directly. Two server-side
-- defenses:
--   1) Honeypot: the form renders an invisible "website" field that humans
--      never fill. Bots that fill it are dropped SILENTLY (no error, so the
--      bot thinks it succeeded).
--   2) Per-IP rate limit: max 5 messages per hour per client IP. The IP comes
--      from the request header PostgREST exposes (request.headers GUC) and is
--      stored on the row so repeat offenders are counted across requests.
-- Plus sanity caps on lengths. The honeypot column is never stored with
-- content and the IP is never exposed to clients (only used server-side).

-- ── 1) new columns ──
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'feedback' and column_name = 'website'
  ) then
    alter table public.feedback add column website text;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'feedback' and column_name = 'client_ip'
  ) then
    alter table public.feedback add column client_ip text;
  end if;
end $$;

-- ── 2) guard trigger ──
create or replace function public.feedback_spam_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  forwarded text;
  recent_count integer;
begin
  -- Honeypot: anything that filled the invisible field is a bot. Drop silently.
  if new.website is not null and btrim(new.website) <> '' then
    return null;
  end if;

  -- Sanity: refuse absurd payloads.
  if length(coalesce(new.message, '')) > 2000 or length(coalesce(new.name, '')) > 100 then
    raise exception 'Message is too long.';
  end if;

  -- Client IP from the header PostgREST sets on Supabase (may be absent).
  forwarded := nullif(btrim(coalesce(
    current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''
  )), '');
  new.client_ip := nullif(btrim(split_part(coalesce(forwarded, ''), ',', 1)), '');

  -- Rate limit: 5 messages per hour per client IP. When the header was
  -- unavailable we can't attribute the request — allow it rather than
  -- blocking legitimate customers on unknown networks.
  if new.client_ip is not null then
    select count(*) into recent_count
      from public.feedback
     where created_at > now() - interval '1 hour'
       and client_ip = new.client_ip;
    if recent_count >= 5 then
      raise exception 'Too many messages — please try again later.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists feedback_spam_guard on public.feedback;
create trigger feedback_spam_guard
  before insert on public.feedback
  for each row execute function public.feedback_spam_guard();

-- ── 3) the IP must never be readable through the public SELECT-less table ──
-- feedback is INSERT-only for the public (security lockdown), so client_ip is
-- already unreachable for visitors; admins see it in the panel. Nothing else
-- to revoke.
