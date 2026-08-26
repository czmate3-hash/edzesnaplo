# Edzésnapló – QA retest

Date: 2026-08-26

## Changes retested

- PWA cache bumped to v3 and `qa-fixes.js` added to the core cache.
- Calendar navigation/date parameters added at the client layer.
- Statistics range parameters are now injected for 7/30-day views.
- Goal ring is updated from the actual displayed total/goal.
- Goal decrease after a workout on the same day is guarded at the database layer.
- Goal changes are logged to `exercise_goal_events`.
- Challenge completion is now enforced by a database trigger.
- Race challenges store `winner_id` and `completed_at`.
- Cross-device/cross-user challenge matching uses exercise name, so each participant can use their own exercise row.
- Added indexes for challenge/workout/day-status access.
- Added a login-attempts table as groundwork for server-side throttling.

## Automated database retests

### PASS — goal rollback guard
A QA user with a 20-unit target recorded 25 units. A subsequent attempt to lower the goal to 10 on the same day was prevented; the target remained 20.

### PASS — race challenge
Two users with their own copies of the same exercise participated. The second user reached the target first. The challenge was marked `completed` and `winner_id` was set to the second user.

### PASS — team challenge
Two participants each contributed 10 to a 20-unit team challenge using their own exercise records. The challenge was marked `completed`.

### PASS — goal-change audit
A goal change from 20 to 25 created exactly one `exercise_goal_events` record.

### PASS — JavaScript syntax
The new `qa-fixes.js` passed Node syntax checking.

## Remaining release caveat

The deployed custom PIN Edge Function still needs a server-side login-attempt counter wired into the `login` action. The database table for this is present, but creating the table alone does not enforce throttling. This is deliberately not marked PASS.

A true browser/device E2E pass (25 acceptance scenarios) also requires a browser automation runtime; the available project tools do not provide one in this session. Database-level and static checks were run, but no claim is made that a physical Android/iOS device was exercised.

## Current release status

**Improved substantially, but not yet a verified 100% production release.**

The remaining blockers are:
1. server-side PIN brute-force throttling;
2. full browser E2E execution of the acceptance suite;
3. final manual verification of the visual challenge/race presentation.
