-- Run this once in the Supabase project's SQL Editor (left sidebar icon
-- that looks like a terminal/">_") to set up the tables this app needs.
-- Safe to re-run: each statement either creates something that doesn't
-- exist yet or is a no-op if it already does.

create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  happy text not null default '',
  upset text not null default '',
  grateful text not null default '',
  proud_of text not null default '',
  note_to_self text not null default '',
  mood int not null,
  emotions text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

alter table journal_entries enable row level security;

drop policy if exists "select own journal entries" on journal_entries;
create policy "select own journal entries"
  on journal_entries for select
  using (auth.uid() = user_id);

drop policy if exists "insert own journal entries" on journal_entries;
create policy "insert own journal entries"
  on journal_entries for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own journal entries" on journal_entries;
create policy "update own journal entries"
  on journal_entries for update
  using (auth.uid() = user_id);

drop policy if exists "delete own journal entries" on journal_entries;
create policy "delete own journal entries"
  on journal_entries for delete
  using (auth.uid() = user_id);

create table if not exists prompt_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  question text not null,
  answer text not null,
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

alter table prompt_answers enable row level security;

drop policy if exists "select own prompt answers" on prompt_answers;
create policy "select own prompt answers"
  on prompt_answers for select
  using (auth.uid() = user_id);

drop policy if exists "insert own prompt answers" on prompt_answers;
create policy "insert own prompt answers"
  on prompt_answers for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own prompt answers" on prompt_answers;
create policy "update own prompt answers"
  on prompt_answers for update
  using (auth.uid() = user_id);

drop policy if exists "delete own prompt answers" on prompt_answers;
create policy "delete own prompt answers"
  on prompt_answers for delete
  using (auth.uid() = user_id);

-- One row per user — the AI provider/key/model chosen in Settings,
-- synced across devices on the same account.
create table if not exists ai_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  provider text not null default 'gemini',
  gemini_api_key text not null default '',
  gemini_model text not null default '',
  groq_api_key text not null default '',
  groq_model text not null default '',
  user_context text not null default '',
  updated_at timestamptz not null default now()
);

-- Added after the table already existed in production — `create table if
-- not exists` above is a no-op there, so this covers upgrading it.
alter table ai_settings add column if not exists user_context text not null default '';

alter table ai_settings enable row level security;

drop policy if exists "select own ai settings" on ai_settings;
create policy "select own ai settings"
  on ai_settings for select
  using (auth.uid() = user_id);

drop policy if exists "insert own ai settings" on ai_settings;
create policy "insert own ai settings"
  on ai_settings for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own ai settings" on ai_settings;
create policy "update own ai settings"
  on ai_settings for update
  using (auth.uid() = user_id);

drop policy if exists "delete own ai settings" on ai_settings;
create policy "delete own ai settings"
  on ai_settings for delete
  using (auth.uid() = user_id);

-- One row per device/browser subscribed to reminder push notifications.
-- Read by the send-reminders Edge Function using the service-role key
-- (server-side, bypasses RLS) — the RLS policies below only govern what
-- the signed-in user's own browser can read/write directly.
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  timezone text not null default 'Asia/Taipei',
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table push_subscriptions enable row level security;

drop policy if exists "select own push subscriptions" on push_subscriptions;
create policy "select own push subscriptions"
  on push_subscriptions for select
  using (auth.uid() = user_id);

drop policy if exists "insert own push subscriptions" on push_subscriptions;
create policy "insert own push subscriptions"
  on push_subscriptions for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own push subscriptions" on push_subscriptions;
create policy "update own push subscriptions"
  on push_subscriptions for update
  using (auth.uid() = user_id);

drop policy if exists "delete own push subscriptions" on push_subscriptions;
create policy "delete own push subscriptions"
  on push_subscriptions for delete
  using (auth.uid() = user_id);
