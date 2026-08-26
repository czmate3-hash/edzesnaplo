create table if not exists public.exercise_goal_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  day date not null,
  old_goal numeric not null,
  new_goal numeric not null,
  average_extra numeric not null,
  sample_count integer not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_goal_events_user_exercise
  on public.exercise_goal_events(user_id, exercise_id, created_at desc);

create index if not exists idx_workouts_challenge_window
  on public.workouts(exercise_id, recorded_at, user_id);

create index if not exists idx_challenge_participants_user_status
  on public.challenge_participants(user_id, status, challenge_id);

alter table public.exercise_goal_events enable row level security;
