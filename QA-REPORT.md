# Edzésnapló – QA audit

## Audit date
2026-08-26

## Scope
The current frontend, PWA configuration, and deployed Supabase API were reviewed against the requested product specification.

## Critical findings

### FAIL-01 — Goal rollback happens too early
`workout-add` calls `rollbackIfGoalMissed()` immediately after inserting a workout. A day is therefore treated as failed before the day is finished. Worse, the current `exercise_day_status.target` is not rewritten after the exercise goal is lowered, so the day's completion threshold can remain the old higher target.

**Required fix:** finalize the previous day when the next day starts (or via an explicit day-finalization operation), never on the first workout of the current day. If a goal is restored, today's status target must be the restored goal when today's status is first created.

### FAIL-02 — Statistics range selector is visual only
The frontend has `Összes / 30 nap / 7 nap`, but `loadStats()` does not pass `from`/`to` to the API. The chart therefore continues to use the full dataset.

**Required fix:** calculate the requested date range and send it to `stats`.

### FAIL-03 — Goal ring is hard-coded
The CSS uses a fixed `35%` conic-gradient. The displayed ring therefore does not represent the actual daily completion percentage.

**Required fix:** set the conic-gradient stop from the calculated percentage.

### FAIL-04 — Set recommendation does not implement the requested ranges
The current backend returns exact amounts based on generic weights. It does not implement the requested range pattern such as 8–13, 5–10, 5–10, 3–8, 3–8 for a 20-rep daily target.

**Required fix:** return per-set min/max recommendations based on the daily target and remaining target.

### FAIL-05 — Calendar has no month navigation
The calendar always loads the current month. There is no previous/next month navigation, so the user cannot inspect the complete history from the UI.

**Required fix:** add month navigation and request the selected year/month.

### FAIL-06 — Streak calculation can use UTC/local-date boundaries inconsistently
Workout rows are grouped using ISO timestamps while day status uses local date keys and database queries use UTC midnight strings. Around midnight/time-zone boundaries this can put an entry into a different day than the status calculation.

**Required fix:** establish one canonical user timezone and use it consistently for workout day attribution, daily statuses, calendar, streaks and challenges.

### FAIL-07 — Challenge race semantics are incomplete
The UI offers `Ki éri el hamarabb?`, but challenge progress is calculated as a single aggregate total. There is no winner/finish state per participant for race challenges.

**Required fix:** calculate participant-specific progress and mark the first participant to reach the goal as winner.

### FAIL-08 — Challenge lifecycle is incomplete
There is no robust expired/completed state transition shown in the current API path. The list primarily derives progress dynamically.

**Required fix:** expose `pending`, `active`, `completed`, `expired`, `rejected` states and completion metadata.

### FAIL-09 — Quick-button feedback is incomplete
Quick buttons correctly send an immediate workout, but the current flow does not guarantee the requested per-exercise visual/animation feedback for every meaningful milestone.

**Required fix:** return structured events from the API (`goal_completed`, `record`, `goal_raised`, `streak_milestone`, `rest_day`) and let the frontend display the appropriate animation once.

### FAIL-10 — PIN authentication is custom and has no visible brute-force protection
The API uses a custom session/PIN system and the deployed Edge Function has JWT verification disabled. The function does perform its own bearer-session authentication, but login attempts are not visibly rate-limited.

**Required fix:** add server-side login throttling/lockout and audit logging. Keep the service-role key strictly server-side.

## PASS / mostly PASS

- Username + 4-digit PIN registration/login exists.
- Session token is persisted locally for automatic login on the same browser/device.
- Logout exists.
- Multiple user accounts are supported server-side.
- Workout data is stored in Supabase rather than only on the device.
- Exercises are user-specific.
- Custom exercise creation exists.
- Per-exercise quick buttons exist.
- Manual workout entries can contain notes.
- Workout schema includes amount, duration, distance, weight, pace, steps, reps and sets.
- Friends can be invited with a code.
- Accepted friends can have their statistics viewed.
- Challenges can be created with a friend and accepted.
- PWA manifest and service worker exist.
- Mobile-oriented responsive layout exists.

## Required acceptance tests before release

1. Register user A; close/reopen browser; automatic login works.
2. Register user B on the same device; B can log in after A logs out.
3. Log in as A on another device/browser; both sessions work independently.
4. Create a custom exercise with `db`, time, distance and weight fields.
5. Save multiple entries for the same exercise on one day.
6. Quick buttons save immediately and never add a note.
7. Complete exactly 4 consecutive days; goal rises once using the configured sample count.
8. Miss the raised goal on the next day; goal returns to the last achieved level and the new day's target is correct.
9. Repeat the progression cycle twice; no duplicate goal-rise events are generated.
10. Time-based goal rises round to 10 seconds; count-based goals round to whole numbers.
11. Complete 6 training days; the following day becomes a rest day.
12. Ignore the rest day; streak remains intact and a workout can still be recorded.
13. Verify 7-day, 30-day and all-time statistics actually filter the dataset.
14. Verify each exercise has its own chart and no cross-exercise aggregation.
15. Verify chart points show date/time on the horizontal axis and the exercise's unit vertically.
16. Navigate calendar backward/forward and verify completed/partial/rest colors.
17. Break a personal record and verify exactly one celebration event.
18. Accept a friend invitation and verify comparison data is immediately visible.
19. Create a team challenge; both users' totals contribute to one shared target.
20. Create a race challenge; first participant to reach the goal is the winner.
21. Expire a challenge and verify it cannot continue accumulating progress.
22. Forget PIN; master recovery changes the PIN and invalidates previous sessions.
23. Attempt repeated wrong PINs; rate limiting/lockout activates.
24. Refresh/deploy a new PWA version; old cached JavaScript does not remain active.
25. Verify API responses never expose PIN hashes, salts, service-role keys or master recovery code.

## Release gate

The project should **not yet be considered production-complete** until FAIL-01 through FAIL-10 are resolved and the acceptance tests above pass.
