create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  username text unique not null check (char_length(username) between 1 and 50),
  invite_code text unique not null,
  pin_hash text not null,
  pin_salt text not null,
  settings jsonb not null default '{"darkMode":false,"vibration":true,"notifications":true,"animations":true,"restDayHints":true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sessions (
  token_hash text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists idx_sessions_user_id on public.sessions(user_id);
create index if not exists idx_sessions_expires_at on public.sessions(expires_at);

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  category text not null default 'generic',
  unit text not null default 'db',
  daily_goal numeric not null default 20,
  is_time_based boolean not null default false,
  is_set_based boolean not null default false,
  quick_buttons jsonb not null default '[5,10,15,20,30]'::jsonb,
  goal_rise_success_days integer not null default 4,
  goal_rise_count integer not null default 4,
  goal_rise_enabled boolean not null default true,
  rest_day_counts_as_success boolean not null default true,
  suggested_sets_enabled boolean not null default false,
  suggested_sets_count integer not null default 5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_exercises_user on public.exercises(user_id);

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  amount numeric not null check (amount > 0),
  duration_seconds integer,
  distance numeric,
  weight numeric,
  pace numeric,
  steps integer,
  reps integer,
  sets integer,
  note text,
  recorded_at timestamptz not null default now()
);
create index if not exists idx_workouts_user_exercise_time on public.workouts(user_id, exercise_id, recorded_at);

create table if not exists public.exercise_day_status (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  day date not null,
  target numeric not null,
  total numeric not null default 0,
  completed boolean not null default false,
  rest_day boolean not null default false,
  unique(user_id, exercise_id, day)
);
create index if not exists idx_day_status_user_exercise on public.exercise_day_status(user_id, exercise_id, day);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create unique index if not exists uniq_friend_pair_pending on public.friendships(requester_id, receiver_id);
create index if not exists idx_friendships_receiver_status on public.friendships(receiver_id, status);
create index if not exists idx_friendships_requester_status on public.friendships(requester_id, status);

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  challenge_type text not null check (challenge_type in ('team_total','race')),
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  goal numeric not null check (goal > 0),
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','active','completed','cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists idx_challenges_creator on public.challenges(creator_id);

create table if not exists public.challenge_participants (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  primary key(challenge_id, user_id)
);

alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.exercises enable row level security;
alter table public.workouts enable row level security;
alter table public.exercise_day_status enable row level security;
alter table public.friendships enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_participants enable row level security;

-- All application data access is intentionally done through the Edge Function using service_role.
-- No direct anon access is granted here.

create or replace function public.cleanup_expired_sessions()
returns void
language sql
security definer
as $$
  delete from public.sessions where expires_at < now();
$$;

-- Optional indexes for date-heavy statistics.
create index if not exists idx_workouts_recorded_at on public.workouts(recorded_at);
