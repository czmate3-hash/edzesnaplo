import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
};

const url = Deno.env.get('SUPABASE_URL')!;
const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const masterCode = Deno.env.get('MASTER_RECOVERY_CODE')!;

const db = createClient(url, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function assert(condition: unknown, message: string, status = 400) {
  if (!condition) throw Object.assign(new Error(message), { status });
}

function username(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 50);
}

function normalizeCode(value: unknown) {
  return String(value ?? '').trim().toUpperCase();
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashPin(pin: string, salt: string) {
  return sha256(`${salt}:${pin}`);
}

function validatePin(pin: unknown) {
  const p = String(pin ?? '');
  assert(/^\d{4}$/.test(p), 'A PIN pontosan 4 számjegy legyen.');
  return p;
}

async function createSession(userId: string) {
  const raw = randomToken();
  const tokenHash = await sha256(raw);
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 60).toISOString();
  await db.from('sessions').delete().eq('user_id', userId);
  const { error } = await db.from('sessions').insert({
    token_hash: tokenHash,
    user_id: userId,
    expires_at: expires,
  });
  if (error) throw error;
  return raw;
}

async function auth(req: Request) {
  const header = req.headers.get('authorization') || '';
  assert(header.toLowerCase().startsWith('bearer '), 'Hiányzó munkamenet.', 401);
  const raw = header.slice(7).trim();
  assert(raw.length >= 32, 'Érvénytelen munkamenet.', 401);
  const tokenHash = await sha256(raw);
  const { data, error } = await db
    .from('sessions')
    .select('user_id, expires_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (error) throw error;
  assert(data, 'A munkamenet lejárt vagy érvénytelen.', 401);
  assert(new Date(data.expires_at).getTime() > Date.now(), 'A munkamenet lejárt.', 401);
  await db.from('sessions').delete().lt('expires_at', new Date().toISOString());
  return String(data.user_id);
}

function sameDay(d: string) {
  return d.slice(0, 10);
}

function localDateKey(input = new Date()) {
  const d = new Date(input);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, amount: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + amount);
  return d;
}

function isTimeUnit(unit: string) {
  return /másodperc|perc|óra|hour|second|minute/i.test(unit);
}

function roundGoal(value: number, timeBased: boolean) {
  if (timeBased) return Math.max(10, Math.round(value / 10) * 10);
  return Math.max(1, Math.round(value));
}

async function getProfile(userId: string) {
  const { data, error } = await db.from('profiles').select('id,username,invite_code,settings,created_at').eq('id', userId).single();
  if (error) throw error;
  return data;
}

async function getExercise(userId: string, exerciseId: string) {
  const { data, error } = await db.from('exercises').select('*').eq('id', exerciseId).eq('user_id', userId).single();
  if (error) throw error;
  return data;
}

async function ensureDayStatus(userId: string, exercise: any, day: string) {
  const { data: existing, error } = await db.from('exercise_day_status')
    .select('*').eq('user_id', userId).eq('exercise_id', exercise.id).eq('day', day).maybeSingle();
  if (error) throw error;
  if (existing) return existing;
  const { data, error: insertError } = await db.from('exercise_day_status').insert({
    user_id: userId,
    exercise_id: exercise.id,
    day,
    target: exercise.daily_goal,
    total: 0,
    completed: false,
    rest_day: false,
  }).select('*').single();
  if (insertError) throw insertError;
  return data;
}

async function recalcDay(userId: string, exercise: any, day: string) {
  const { data: rows, error } = await db.from('workouts').select('amount').eq('user_id', userId).eq('exercise_id', exercise.id)
    .gte('recorded_at', `${day}T00:00:00.000Z`).lt('recorded_at', `${day}T23:59:59.999Z`);
  if (error) throw error;
  const total = (rows || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const status = await ensureDayStatus(userId, exercise, day);
  const completed = total >= Number(status.target);
  const { data, error: updateError } = await db.from('exercise_day_status').update({ total, completed }).eq('id', status.id).select('*').single();
  if (updateError) throw updateError;
  return data;
}

async function completedTargetsBefore(userId: string, exerciseId: string, beforeDay: string, count: number) {
  const { data, error } = await db.from('exercise_day_status').select('day,total,target,completed')
    .eq('user_id', userId).eq('exercise_id', exerciseId).lt('day', beforeDay).order('day', { ascending: false }).limit(60);
  if (error) throw error;
  return (data || []).filter((r) => r.completed).slice(0, count);
}

async function updateProgression(userId: string, exercise: any, day: string) {
  if (!exercise.goal_rise_enabled) return exercise;
  const status = await recalcDay(userId, exercise, day);
  if (!status.completed) return exercise;
  const streakDays = Number(exercise.goal_rise_success_days || 4);
  const relevantCount = Number(exercise.goal_rise_count || streakDays);
  const { data: recent, error } = await db.from('exercise_day_status').select('day,total,target,completed')
    .eq('user_id', userId).eq('exercise_id', exercise.id).lte('day', day).order('day', { ascending: false }).limit(Math.max(streakDays, 20));
  if (error) throw error;
  const completed = recent || [];
  let streak = 0;
  for (const row of completed) {
    if (row.completed) streak++;
    else break;
  }
  if (streak < streakDays) return exercise;

  const samples = completed.slice(0, relevantCount).filter((r) => r.completed).map((r) => Number(r.total) - Number(r.target));
  if (!samples.length) return exercise;
  const avgExtra = samples.reduce((a, b) => a + b, 0) / samples.length;
  const newGoal = roundGoal(Number(exercise.daily_goal) + avgExtra, Boolean(exercise.is_time_based));

  if (newGoal <= Number(exercise.daily_goal)) return exercise;

  const { error: upError } = await db.from('exercises').update({ daily_goal: newGoal, updated_at: new Date().toISOString() }).eq('id', exercise.id).eq('user_id', userId);
  if (upError) throw upError;
  return { ...exercise, daily_goal: newGoal, targetRaised: true, previousGoal: Number(exercise.daily_goal) };
}

async function rollbackIfGoalMissed(userId: string, exercise: any, day: string) {
  const status = await recalcDay(userId, exercise, day);
  if (status.completed) return exercise;
  const { data: yesterday } = await db.from('exercise_day_status').select('*').eq('user_id', userId).eq('exercise_id', exercise.id).lt('day', day).order('day', { ascending: false }).limit(1).maybeSingle();
  if (!yesterday) return exercise;
  const currentGoal = Number(exercise.daily_goal);
  const previousGoal = Number(yesterday.target);
  if (previousGoal < currentGoal) {
    const { error } = await db.from('exercises').update({ daily_goal: previousGoal, updated_at: new Date().toISOString() }).eq('id', exercise.id).eq('user_id', userId);
    if (error) throw error;
    return { ...exercise, daily_goal: previousGoal, goalDropped: true, previousGoal: currentGoal };
  }
  return exercise;
}

async function ensureRestDay(userId: string, exerciseId: string) {
  const today = startOfDay();
  const since = localDateKey(addDays(today, -6));
  const { data, error } = await db.from('exercise_day_status').select('day,completed,rest_day')
    .eq('user_id', userId).eq('exercise_id', exerciseId).gte('day', since).lte('day', localDateKey(today)).order('day', { ascending: false });
  if (error) throw error;
  const completedDays = new Set((data || []).filter((x) => x.completed).map((x) => x.day));
  let count = 0;
  for (let i = 0; i < 7; i++) {
    const key = localDateKey(addDays(today, -i));
    if (completedDays.has(key)) count++;
  }
  if (count < 6) return false;
  const tomorrow = localDateKey(addDays(today, 1));
  const exercise = await getExercise(userId, exerciseId);
  const tomorrowStatus = await ensureDayStatus(userId, exercise, tomorrow);
  if (!tomorrowStatus.rest_day) {
    await db.from('exercise_day_status').update({ rest_day: true }).eq('id', tomorrowStatus.id);
  }
  return true;
}

async function stats(userId: string, exercise: any, from?: string, to?: string) {
  const start = from || '2000-01-01';
  const end = to || '2999-12-31';
  const { data: rows, error } = await db.from('workouts').select('id,amount,recorded_at,note,duration_seconds,distance,weight,pace,steps,reps,sets')
    .eq('user_id', userId).eq('exercise_id', exercise.id).gte('recorded_at', `${start}T00:00:00.000Z`).lte('recorded_at', `${end}T23:59:59.999Z`).order('recorded_at', { ascending: true });
  if (error) throw error;
  const entries = rows || [];
  const dailyMap = new Map<string, { total: number; sets: number }>();
  for (const row of entries) {
    const day = sameDay(row.recorded_at);
    const current = dailyMap.get(day) || { total: 0, sets: 0 };
    current.total += Number(row.amount || 0);
    current.sets += 1;
    dailyMap.set(day, current);
  }
  const days = [...dailyMap.entries()].sort();
  const total = entries.reduce((s, r) => s + Number(r.amount || 0), 0);
  const activeDays = days.length;
  let currentStreak = 0;
  let cursor = startOfDay();
  const statusRows = await db.from('exercise_day_status').select('day,completed,rest_day').eq('user_id', userId).eq('exercise_id', exercise.id).order('day', { ascending: false }).limit(400).then((r) => r.data || []);
  const statusByDay = new Map(statusRows.map((r) => [r.day, r]));
  while (true) {
    const key = localDateKey(cursor);
    const st = statusByDay.get(key);
    if (st?.completed || st?.rest_day) {
      currentStreak++;
      cursor = addDays(cursor, -1);
    } else break;
  }
  let bestDay = null as any;
  for (const [day, value] of days) {
    if (!bestDay || value.total > bestDay.total) bestDay = { day, total: value.total };
  }
  let longest = 0; let run = 0; let prev = null as string | null;
  for (const [day] of days) {
    if (prev) {
      const diff = (new Date(day).getTime() - new Date(prev).getTime()) / 86400000;
      run = diff === 1 ? run + 1 : 1;
    } else run = 1;
    longest = Math.max(longest, run);
    prev = day;
  }
  return {
    exercise: { id: exercise.id, name: exercise.name, unit: exercise.unit, dailyGoal: Number(exercise.daily_goal) },
    total,
    entries,
    activeDays,
    averagePerDay: activeDays ? Number((total / activeDays).toFixed(1)) : 0,
    currentStreak,
    longestStreak: longest,
    bestDay,
    firstDate: entries.length ? sameDay(entries[0].recorded_at) : null,
    daily: Object.fromEntries(days),
  };
}

async function areFriends(a: string, b: string) {
  const { data } = await db.from('friendships').select('id,status').or(`and(requester_id.eq.${a},receiver_id.eq.${b}),and(requester_id.eq.${b},receiver_id.eq.${a})`).eq('status', 'accepted').limit(1);
  return Boolean(data?.length);
}

async function handle(action: string, payload: any, req: Request) {
  if (action === 'register') {
    const name = username(payload.name);
    const pin = validatePin(payload.pin);
    assert(name.length >= 1, 'A név kötelező.');
    const { data: exists } = await db.from('profiles').select('id').ilike('username', name).maybeSingle();
    assert(!exists, 'Ez a név már foglalt.');
    const salt = randomSalt();
    const pinHash = await hashPin(pin, salt);
    const inviteCode = `${name.slice(0,4).toUpperCase().replace(/[^A-Z0-9]/g,'X')}-${crypto.randomUUID().slice(0,6).toUpperCase()}`;
    const { data: profile, error } = await db.from('profiles').insert({ username: name, invite_code: inviteCode, pin_hash: pinHash, pin_salt: salt }).select('id,username,invite_code,settings,created_at').single();
    if (error) throw error;
    const { data: defaults, error: exError } = await db.from('exercises').insert([
      { user_id: profile.id, name: 'Fekvőtámasz', category: 'strength', unit: 'db', daily_goal: 20, is_time_based: false, is_set_based: true, quick_buttons: [5,10,15,20,30], goal_rise_success_days: 4, goal_rise_count: 4, goal_rise_enabled: true, suggested_sets_enabled: true, suggested_sets_count: 5 },
      { user_id: profile.id, name: 'Futás', category: 'cardio', unit: 'km', daily_goal: 3, is_time_based: false, is_set_based: false, quick_buttons: [1,2,3,5,10], goal_rise_success_days: 4, goal_rise_count: 4, goal_rise_enabled: true, suggested_sets_enabled: false },
      { user_id: profile.id, name: 'Plank', category: 'time', unit: 'perc', daily_goal: 5, is_time_based: true, is_set_based: true, quick_buttons: [1,2,3,5,10], goal_rise_success_days: 4, goal_rise_count: 4, goal_rise_enabled: true, suggested_sets_enabled: true, suggested_sets_count: 4 },
      { user_id: profile.id, name: 'Guggolás', category: 'strength', unit: 'db', daily_goal: 30, is_time_based: false, is_set_based: true, quick_buttons: [5,10,15,20,30], goal_rise_success_days: 4, goal_rise_count: 4, goal_rise_enabled: true, suggested_sets_enabled: true, suggested_sets_count: 5 },
    ]).select('*');
    if (exError) throw exError;
    const token = await createSession(profile.id);
    return { token, profile, exercises: defaults };
  }

  if (action === 'login') {
    const name = username(payload.name);
    const pin = validatePin(payload.pin);
    const { data: profile, error } = await db.from('profiles').select('*').ilike('username', name).maybeSingle();
    if (error) throw error;
    assert(profile, 'Nincs ilyen felhasználó.', 401);
    const candidate = await hashPin(pin, profile.pin_salt);
    assert(candidate === profile.pin_hash, 'Hibás PIN.', 401);
    const token = await createSession(profile.id);
    const { data: exercises } = await db.from('exercises').select('*').eq('user_id', profile.id).order('created_at');
    return { token, profile: { id: profile.id, username: profile.username, invite_code: profile.invite_code, settings: profile.settings, created_at: profile.created_at }, exercises: exercises || [] };
  }

  if (action === 'recover-pin') {
    assert(String(payload.masterCode || '') === masterCode, 'Hibás mester-helyreállító kód.', 403);
    const name = username(payload.name);
    const newPin = validatePin(payload.newPin);
    const { data: profile } = await db.from('profiles').select('id').ilike('username', name).maybeSingle();
    assert(profile, 'Nincs ilyen felhasználó.');
    const salt = randomSalt();
    const pinHash = await hashPin(newPin, salt);
    const { error } = await db.from('profiles').update({ pin_hash: pinHash, pin_salt: salt, updated_at: new Date().toISOString() }).eq('id', profile.id);
    if (error) throw error;
    await db.from('sessions').delete().eq('user_id', profile.id);
    return { success: true };
  }

  const userId = await auth(req);

  if (action === 'logout') {
    const h = req.headers.get('authorization')!.slice(7).trim();
    await db.from('sessions').delete().eq('token_hash', await sha256(h));
    return { success: true };
  }

  if (action === 'me') {
    const profile = await getProfile(userId);
    const { data: exercises } = await db.from('exercises').select('*').eq('user_id', userId).order('created_at');
    return { profile, exercises: exercises || [] };
  }

  if (action === 'settings-save') {
    const profile = await getProfile(userId);
    const merged = { ...(profile.settings || {}), ...(payload.settings || {}) };
    const { data, error } = await db.from('profiles').update({ settings: merged, updated_at: new Date().toISOString() }).eq('id', userId).select('id,username,settings,created_at').single();
    if (error) throw error;
    return data;
  }

  if (action === 'profile-update') {
    const name = username(payload.name);
    assert(name.length >= 1, 'A név kötelező.');
    const { data: conflict } = await db.from('profiles').select('id').ilike('username', name).neq('id', userId).maybeSingle();
    assert(!conflict, 'Ez a név már foglalt.');
    const { data, error } = await db.from('profiles').update({ username: name, updated_at: new Date().toISOString() }).eq('id', userId).select('id,username,invite_code,settings,created_at').single();
    if (error) throw error;
    return data;
  }

  if (action === 'exercise-create') {
    const isTime = Boolean(payload.isTimeBased);
    const unit = String(payload.unit || 'db');
    const exercise = {
      user_id: userId,
      name: username(payload.name),
      category: String(payload.category || 'generic'),
      unit,
      daily_goal: roundGoal(Number(payload.dailyGoal || 1), isTime),
      is_time_based: isTime,
      is_set_based: Boolean(payload.isSetBased),
      quick_buttons: (payload.quickButtons || [5,10,15,20,30]).map(Number).filter((n: number) => n > 0),
      goal_rise_success_days: Math.max(1, Number(payload.goalRiseSuccessDays || 4)),
      goal_rise_count: Math.max(1, Number(payload.goalRiseCount || 4)),
      goal_rise_enabled: payload.goalRiseEnabled !== false,
      rest_day_counts_as_success: payload.restDayCountsAsSuccess !== false,
      suggested_sets_enabled: Boolean(payload.suggestedSetsEnabled),
      suggested_sets_count: Math.max(2, Number(payload.suggestedSetsCount || 5)),
    };
    assert(exercise.name, 'A gyakorlat neve kötelező.');
    const { data, error } = await db.from('exercises').insert(exercise).select('*').single();
    if (error) throw error;
    return data;
  }

  if (action === 'exercise-update') {
    const exercise = await getExercise(userId, payload.id);
    const isTime = payload.isTimeBased ?? exercise.is_time_based;
    const unit = String(payload.unit ?? exercise.unit);
    const updates = {
      name: username(payload.name ?? exercise.name),
      category: String(payload.category ?? exercise.category),
      unit,
      daily_goal: roundGoal(Number(payload.dailyGoal ?? exercise.daily_goal), isTime),
      is_time_based: Boolean(isTime),
      is_set_based: Boolean(payload.isSetBased ?? exercise.is_set_based),
      quick_buttons: (payload.quickButtons ?? exercise.quick_buttons).map(Number).filter((n: number) => n > 0),
      goal_rise_success_days: Math.max(1, Number(payload.goalRiseSuccessDays ?? exercise.goal_rise_success_days)),
      goal_rise_count: Math.max(1, Number(payload.goalRiseCount ?? exercise.goal_rise_count)),
      goal_rise_enabled: payload.goalRiseEnabled ?? exercise.goal_rise_enabled,
      rest_day_counts_as_success: payload.restDayCountsAsSuccess ?? exercise.rest_day_counts_as_success,
      suggested_sets_enabled: payload.suggestedSetsEnabled ?? exercise.suggested_sets_enabled,
      suggested_sets_count: Math.max(2, Number(payload.suggestedSetsCount ?? exercise.suggested_sets_count)),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await db.from('exercises').update(updates).eq('id', exercise.id).eq('user_id', userId).select('*').single();
    if (error) throw error;
    return data;
  }

  if (action === 'exercise-delete') {
    await getExercise(userId, payload.id);
    const { error } = await db.from('exercises').delete().eq('id', payload.id).eq('user_id', userId);
    if (error) throw error;
    return { success: true };
  }

  if (action === 'workout-add') {
    const exercise = await getExercise(userId, payload.exerciseId);
    const amount = Number(payload.amount);
    assert(Number.isFinite(amount) && amount > 0, 'Az érték legyen 0-nál nagyobb.');
    const { data, error } = await db.from('workouts').insert({
      user_id: userId,
      exercise_id: exercise.id,
      amount,
      duration_seconds: payload.durationSeconds ? Number(payload.durationSeconds) : null,
      distance: payload.distance != null ? Number(payload.distance) : null,
      weight: payload.weight != null ? Number(payload.weight) : null,
      pace: payload.pace != null ? Number(payload.pace) : null,
      steps: payload.steps != null ? Number(payload.steps) : null,
      reps: payload.reps != null ? Number(payload.reps) : null,
      sets: payload.sets != null ? Number(payload.sets) : null,
      note: String(payload.note || ''),
      recorded_at: payload.recordedAt || new Date().toISOString(),
    }).select('*').single();
    if (error) throw error;
    const day = sameDay(data.recorded_at);
    const progressed = await updateProgression(userId, exercise, day);
    await rollbackIfGoalMissed(userId, progressed, day);
    const restTomorrow = await ensureRestDay(userId, exercise.id);
    return { workout: data, exercise: progressed, restTomorrow };
  }

  if (action === 'today') {
    const exercise = await getExercise(userId, payload.exerciseId);
    const today = localDateKey();
    const dayStatus = await recalcDay(userId, exercise, today);
    const restTomorrow = await ensureRestDay(userId, exercise.id);
    const { data: rows } = await db.from('workouts').select('*').eq('user_id', userId).eq('exercise_id', exercise.id)
      .gte('recorded_at', `${today}T00:00:00.000Z`).lt('recorded_at', `${today}T23:59:59.999Z`).order('recorded_at', { ascending: true });
    const recent = await stats(userId, exercise, today, today);
    const suggested = suggestSets(exercise, Number(dayStatus.total));
    return { dayStatus, rows: rows || [], stats: recent, restTomorrow, suggestedSets: suggested };
  }

  if (action === 'stats') {
    const exercise = await getExercise(userId, payload.exerciseId);
    return await stats(userId, exercise, payload.from, payload.to);
  }

  if (action === 'calendar') {
    const exercise = await getExercise(userId, payload.exerciseId);
    const year = Number(payload.year);
    const month = Number(payload.month);
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const result = await stats(userId, exercise, localDateKey(first), localDateKey(last));
    const map: Record<string, any> = {};
    Object.entries(result.daily).forEach(([day, value]) => { map[day] = value; });
    const { data: statuses } = await db.from('exercise_day_status').select('day,target,total,completed,rest_day').eq('user_id', userId).eq('exercise_id', exercise.id)
      .gte('day', localDateKey(first)).lte('day', localDateKey(last));
    (statuses || []).forEach((s) => { map[s.day] = { ...(map[s.day] || {}), ...s }; });
    return map;
  }

  if (action === 'friend-invite') {
    const code = normalizeCode(payload.code);
    const targetName = username(payload.targetName);
    let resolved = null as any;
    if (code) {
      const { data: target } = await db.from('profiles').select('id,username,invite_code').ilike('invite_code', code).maybeSingle();
      resolved = target;
    }
    if (!resolved && targetName) {
      const { data: target } = await db.from('profiles').select('id,username,invite_code').ilike('username', targetName).maybeSingle();
      resolved = target;
    }
    assert(resolved, 'Nem található ilyen meghívókód vagy felhasználó.');
    assert(resolved.id !== userId, 'Saját magadat nem jelölheted.');
    const already = await areFriends(userId, resolved.id);
    if (already) return { status: 'accepted', message: 'Már barátok vagytok.' };
    const { data: existing } = await db.from('friendships').select('*').or(`and(requester_id.eq.${userId},receiver_id.eq.${resolved.id}),and(requester_id.eq.${resolved.id},receiver_id.eq.${userId})`).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (existing?.status === 'pending') return { status: 'pending', message: 'A meghívó már elküldve.' };
    const { error } = await db.from('friendships').insert({ requester_id: userId, receiver_id: resolved.id, status: 'pending' });
    if (error) throw error;
    return { status: 'pending', message: `${resolved.username} meghívása elküldve.` };
  }

  if (action === 'friend-list') {
    const { data: rows } = await db.from('friendships').select('id,requester_id,receiver_id,status,created_at').or(`requester_id.eq.${userId},receiver_id.eq.${userId}`).order('created_at', { ascending: false });
    const ids = new Set<string>();
    (rows || []).forEach((r) => { if (r.status === 'accepted') ids.add(r.requester_id === userId ? r.receiver_id : r.requester_id); });
    const friends = [];
    for (const id of ids) {
      const { data: p } = await db.from('profiles').select('id,username').eq('id', id).single();
      if (p) friends.push(p);
    }
    return friends;
  }

  if (action === 'friend-requests') {
    const { data: rows, error } = await db.from('friendships').select('id,requester_id,created_at,status').eq('receiver_id', userId).eq('status', 'pending').order('created_at', { ascending: false });
    if (error) throw error;
    const result = [];
    for (const r of rows || []) {
      const { data: p } = await db.from('profiles').select('id,username').eq('id', r.requester_id).single();
      if (p) result.push({ ...r, user: p });
    }
    return result;
  }

  if (action === 'friend-respond') {
    const requestId = String(payload.requestId);
    const decision = payload.accept ? 'accepted' : 'rejected';
    const { data: reqRow } = await db.from('friendships').select('*').eq('id', requestId).eq('receiver_id', userId).eq('status', 'pending').maybeSingle();
    assert(reqRow, 'A meghívó nem található.');
    const { data, error } = await db.from('friendships').update({ status: decision, responded_at: new Date().toISOString() }).eq('id', requestId).select('*').single();
    if (error) throw error;
    return data;
  }

  if (action === 'friend-stats') {
    const friendId = String(payload.friendId);
    assert(await areFriends(userId, friendId), 'Ez a felhasználó nem a barátod.', 403);
    const { data: profile } = await db.from('profiles').select('id,username').eq('id', friendId).single();
    const { data: exercises } = await db.from('exercises').select('*').eq('user_id', friendId).order('created_at');
    const results = [];
    for (const ex of exercises || []) {
      results.push(await stats(friendId, ex));
    }
    return { profile, exercises: results };
  }

  if (action === 'challenge-create') {
    const ex = await getExercise(userId, payload.exerciseId);
    const friendId = String(payload.friendId);
    assert(await areFriends(userId, friendId), 'Csak baráttal lehet kihívást indítani.');
    const type = payload.challengeType === 'race' ? 'race' : 'team_total';
    const goal = Number(payload.goal);
    assert(goal > 0, 'A kihívás célja legyen nagyobb 0-nál.');
    const { data: challenge, error } = await db.from('challenges').insert({ creator_id: userId, name: username(payload.name), challenge_type: type, exercise_id: ex.id, goal, start_at: payload.startAt, end_at: payload.endAt, status: 'pending' }).select('*').single();
    if (error) throw error;
    await db.from('challenge_participants').insert([
      { challenge_id: challenge.id, user_id: userId, status: 'accepted' },
      { challenge_id: challenge.id, user_id: friendId, status: 'pending' },
    ]);
    return challenge;
  }

  if (action === 'challenge-list') {
    const { data: parts } = await db.from('challenge_participants').select('challenge_id,status').eq('user_id', userId);
    const ids = (parts || []).map((p) => p.challenge_id);
    if (!ids.length) return [];
    const { data: challenges } = await db.from('challenges').select('*,exercise:exercises(name,unit)').in('id', ids).order('created_at', { ascending: false });
    const out = [];
    for (const c of challenges || []) {
      const { data: cp } = await db.from('challenge_participants').select('user_id,status').eq('challenge_id', c.id);
      const participantIds = (cp || []).filter((x) => x.status === 'accepted').map((x) => x.user_id);
      let total = 0;
      const memberTotals: any[] = [];
      for (const pid of participantIds) {
        const { data: rows } = await db.from('workouts').select('amount').eq('user_id', pid).eq('exercise_id', c.exercise_id).gte('recorded_at', c.start_at).lte('recorded_at', c.end_at);
        const sum = (rows || []).reduce((s, r) => s + Number(r.amount || 0), 0);
        total += sum;
        const { data: p } = await db.from('profiles').select('id,username').eq('id', pid).single();
        memberTotals.push({ userId: pid, username: p?.username || 'Felhasználó', total: sum });
      }
      out.push({ ...c, myStatus: (parts || []).find((p) => p.challenge_id === c.id)?.status, total, memberTotals, progress: Math.min(100, total / Number(c.goal) * 100) });
    }
    return out;
  }

  if (action === 'challenge-respond') {
    const { data: row } = await db.from('challenge_participants').select('*').eq('challenge_id', payload.challengeId).eq('user_id', userId).eq('status', 'pending').maybeSingle();
    assert(row, 'A kihívás meghívója nem található.');
    const status = payload.accept ? 'accepted' : 'rejected';
    await db.from('challenge_participants').update({ status }).eq('challenge_id', payload.challengeId).eq('user_id', userId);
    return { success: true };
  }

  throw Object.assign(new Error(`Ismeretlen művelet: ${action}`), { status: 404 });
}

function suggestSets(exercise: any, total: number) {
  if (!exercise.is_set_based || !exercise.suggested_sets_enabled) return [];
  const goal = Number(exercise.daily_goal);
  const count = Math.max(2, Number(exercise.suggested_sets_count || 5));
  const remaining = Math.max(0, goal - total);
  if (remaining === 0) return new Array(count).fill(0);
  const weights = Array.from({ length: count }, (_, i) => Math.max(0.2, 1 - i * 0.16));
  const sum = weights.reduce((a, b) => a + b, 0);
  let left = remaining;
  return weights.map((w, i) => {
    if (i === weights.length - 1) return Math.max(0, Math.round(left));
    const value = Math.max(1, Math.round(remaining * w / sum));
    left -= value;
    return value;
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const payload = await req.json();
    const result = await handle(String(payload.action || ''), payload, req);
    return json(result);
  } catch (error) {
    console.error(error);
    const status = Number((error as any)?.status || 500);
    return json({ error: error instanceof Error ? error.message : 'Ismeretlen hiba.' }, status);
  }
});
