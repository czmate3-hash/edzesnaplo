const SUPABASE_URL = 'https://ubskxxckecavlykftzju.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_uxHP-VoMBdoDfgOzEhMtgA_rmU0H_Fe';

function storageGet(key) {
  try { return window.localStorage.getItem(key) || ''; } catch (_) { return ''; }
}
function storageSet(key, value) {
  try { if (value) window.localStorage.setItem(key, value); else window.localStorage.removeItem(key); } catch (_) {}
}

const state = {
  token: storageGet('edzesnaplo_session'),
  profile: null,
  exercises: [],
  activeExerciseId: null,
  screen: 'home',
  settings: {},
  chartRange: 'all',
  stats: null,
  friends: [],
  requests: [],
  friendStats: null,
  challenges: []
};

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const apiUrl = () => `${SUPABASE_URL}/functions/v1/api`;

async function api(action, payload = {}, requiresAuth = true) {
  const headers = {'Content-Type':'application/json', 'apikey': SUPABASE_ANON_KEY};
  if (requiresAuth && state.token) headers.Authorization = `Bearer ${state.token}`;
  let res;
  try {
    res = await fetch(apiUrl(), {method:'POST', headers, body: JSON.stringify({action, ...payload})});
  } catch (error) {
    throw new Error('Nem sikerült elérni a szervert. Ellenőrizd az internetkapcsolatot.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Hiba (${res.status})`);
  return data;
}

function saveSession(token) {
  state.token = token || '';
  storageSet('edzesnaplo_session', token || '');
}

function selectedExercise() {
  return state.exercises.find(x => x.id === state.activeExerciseId) || state.exercises[0];
}

function unitText(ex) { return ex?.unit || ''; }
function fmtNum(n) { return Number(n || 0).toLocaleString('hu-HU', {maximumFractionDigits: 2}); }
function dateTime(iso) { return new Date(iso).toLocaleString('hu-HU', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}); }
function dateOnly(iso) { return new Date(iso + (iso.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('hu-HU'); }
function localDateKey(d = new Date()) { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function isoStartOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x.toISOString(); }

function showToast(text, kind='info') {
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.textContent = text;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 250); }, 2600);
}

function celebrate(text) {
  if (!state.settings.animations) return;
  const el = document.createElement('div');
  el.className = 'celebrate';
  el.innerHTML = `<div class="celebrate-card"><div class="celebrate-emoji">🎉</div><div class="celebrate-text">${esc(text)}</div></div>`;
  document.body.appendChild(el);
  const emojis = ['🎉','🔥','💪','✨','🏆','🚀'];
  for (let i=0;i<22;i++) {
    const p = document.createElement('span');
    p.textContent = emojis[Math.floor(Math.random()*emojis.length)];
    p.style.left = `${Math.random()*100}%`;
    p.style.animationDelay = `${Math.random()*300}ms`;
    el.appendChild(p);
  }
  setTimeout(() => el.remove(), 1800);
}

function applyTheme() {
  document.documentElement.dataset.theme = state.settings.darkMode ? 'dark' : 'light';
}

function render() {
  document.querySelectorAll('.screen').forEach(x => x.classList.remove('active'));
  const el = document.querySelector(`[data-screen="${state.screen}"]`);
  if (el) el.classList.add('active');
  const title = $('#topTitle');
  if (title) title.textContent = state.screen === 'home' ? 'Edzésnapló' : ({stats:'Statisztikák',calendar:'Naptár',friends:'Barátok',challenges:'Kihívások',settings:'Beállítások'})[state.screen] || 'Edzésnapló';
  loadScreenData();
}

async function loadScreenData() {
  if (!state.profile) return;
  try {
    if (state.screen === 'home') await loadHome();
    if (state.screen === 'stats') await loadStats();
    if (state.screen === 'calendar') await loadCalendar();
    if (state.screen === 'friends') await loadFriends();
    if (state.screen === 'challenges') await loadChallenges();
    if (state.screen === 'settings') renderSettings();
  } catch(e) { showToast(e.message, 'error'); }
}

function shell() {
  return `
  <div class="app-shell">
    <header class="topbar"><div class="brand"><span class="brand-mark">💪</span><div><div id="topTitle">Edzésnapló</div><small id="userMini"></small></div></div><button class="icon-btn" id="logoutBtn" title="Kijelentkezés">⎋</button></header>
    <main class="content">
      <section class="screen" data-screen="home"><div id="homeView"></div></section>
      <section class="screen" data-screen="stats"><div id="statsView"></div></section>
      <section class="screen" data-screen="calendar"><div id="calendarView"></div></section>
      <section class="screen" data-screen="friends"><div id="friendsView"></div></section>
      <section class="screen" data-screen="challenges"><div id="challengeView"></div></section>
      <section class="screen" data-screen="settings"><div id="settingsView"></div></section>
    </main>
    <nav class="bottom-nav">
      <button data-nav="home">🏠<span>Főoldal</span></button>
      <button data-nav="stats">📊<span>Statisztika</span></button>
      <button data-nav="calendar">📅<span>Naptár</span></button>
      <button data-nav="friends">👥<span>Barátok</span></button>
      <button data-nav="settings">⚙️<span>Beállítás</span></button>
    </nav>
  </div>`;
}

function authScreen() {
  document.body.innerHTML = `<div class="auth-wrap">
    <div class="auth-card">
      <div class="logo">💪</div>
      <h1>Edzésnapló</h1>
      <p class="muted">A gyors edzésrögzítésed, egy helyen.</p>
      <div class="tabs"><button class="tab active" data-tab="login">Belépés</button><button class="tab" data-tab="register">Új fiók</button></div>
      <form id="authForm"></form>
      <button id="recoverOpen" class="link-btn">Elfelejtetted a PIN-t?</button>
    </div>
  </div>`;
  renderAuthForm('login');
  $('.tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (!b) return; $('.tabs .tab.active')?.classList.remove('active'); b.classList.add('active'); renderAuthForm(b.dataset.tab); });
  $('#recoverOpen').onclick = renderRecovery;
}

function renderAuthForm(mode) {
  $('#authForm').innerHTML = mode === 'login' ? `
    <label>Név<input id="authName" autocomplete="username" maxlength="50" required></label>
    <label>4 számjegyű PIN<input id="authPin" type="password" inputmode="numeric" maxlength="4" pattern="\\d{4}" required></label>
    <button class="primary full" type="submit">Belépés</button>` : `
    <label>Név<input id="authName" maxlength="50" required></label>
    <label>4 számjegyű PIN<input id="authPin" type="password" inputmode="numeric" maxlength="4" pattern="\\d{4}" required></label>
    <label>PIN újra<input id="authPin2" type="password" inputmode="numeric" maxlength="4" pattern="\\d{4}" required></label>
    <button class="primary full" type="submit">Fiók létrehozása</button>`;
  $('#authForm').onsubmit = async e => {
    e.preventDefault();
    try {
      const name = $('#authName').value.trim();
      const pin = $('#authPin').value;
      if (mode === 'register' && pin !== $('#authPin2').value) throw new Error('A két PIN nem egyezik.');
      const data = await api(mode, {name, pin}, false);
      saveSession(data.token);
      state.profile = data.profile;
      state.settings = data.profile.settings || {};
      state.exercises = data.exercises || [];
      state.activeExerciseId = state.exercises[0]?.id;
      mountApp();
    } catch (e) { showToast(e.message,'error'); }
  };
}

function renderRecovery() {
  $('#authForm').innerHTML = `<label>Felhasználónév<input id="recName"></label><label>Mesterkód<input id="recCode" type="password"></label><label>Új 4 számjegyű PIN<input id="recPin" type="password" inputmode="numeric" maxlength="4"></label><label>PIN újra<input id="recPin2" type="password" inputmode="numeric" maxlength="4"></label><button class="primary full" id="recBtn">PIN visszaállítása</button>`;
  $('#recBtn').onclick = async () => {
    try {
      const pin = $('#recPin').value;
      if (pin !== $('#recPin2').value) throw new Error('A két PIN nem egyezik.');
      await api('recover-pin',{name:$('#recName').value.trim(),masterCode:$('#recCode').value,newPin:pin},false);
      showToast('Az új PIN elmentve.','success');
      renderAuthForm('login');
    } catch(e) { showToast(e.message,'error'); }
  };
}

function mountApp() {
  document.body.innerHTML = shell();
  $('#userMini').textContent = state.profile.username;
  $('#logoutBtn').onclick = logout;
  document.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => { state.screen = b.dataset.nav; render(); });
  render();
}

async function logout() {
  try { await api('logout'); } catch (_) {}
  saveSession('');
  state.profile = null;
  authScreen();
}

async function boot() {
  try {
    if (!SUPABASE_URL.includes('YOUR_PROJECT_REF') && !SUPABASE_ANON_KEY.includes('YOUR_SUPABASE')) {
      if (state.token) {
        try {
          const d = await api('me');
          state.profile = d.profile;
          state.settings = d.profile.settings || {};
          state.exercises = d.exercises || [];
          state.activeExerciseId = state.exercises[0]?.id;
          mountApp();
          return;
        } catch (_) { saveSession(''); }
      }
      authScreen();
    } else {
      document.body.innerHTML = `<div class="auth-wrap"><div class="auth-card"><h1>Edzésnapló</h1><p>A Supabase konfiguráció hiányzik.</p><p class="muted">A projekt ehhez a Supabase-hoz van előkészítve.</p></div></div>`;
    }
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(()=>{});
  } catch (error) {
    console.error(error);
    document.body.innerHTML = `<div class="auth-wrap"><div class="auth-card"><h1>Edzésnapló</h1><p>Az alkalmazás indulásakor hiba történt.</p><p class="muted">${esc(error?.message || error)}</p></div></div>`;
  }
}

async function loadHome() {
  const ex = selectedExercise();
  if (!ex) return;
  const d = await api('today',{exerciseId:ex.id});
  const s = d.stats;
  const pct = ex.daily_goal > 0 ? Math.min(100, Math.round(d.dayStatus.total / ex.daily_goal * 100)) : 0;
  $('#homeView').innerHTML = `
    <div class="card hero-card">
      <div class="row between"><div><div class="eyebrow">Üdv, ${esc(state.profile.username)}</div><h2>${esc(ex.name)}</h2></div><button class="secondary small" id="exManage">⚙️</button></div>
      <select id="activeExSelect">${state.exercises.map(x=>`<option value="${x.id}" ${x.id===ex.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select>
      <div class="goal-ring"><div><strong>${fmtNum(d.dayStatus.total)}</strong><span>/ ${fmtNum(ex.daily_goal)} ${esc(ex.unit)}</span></div></div>
      <div class="progress"><span style="width:${pct}%"></span></div>
      <div class="row between"><span>${pct}% teljesítés</span><span>${s.currentStreak} 🔥 streak</span></div>
      ${d.restTomorrow ? `<div class="rest-banner">🛌 Holnap pihenőnap-javaslatod van. A streaket nem rontja.</div>` : ''}
      ${d.dayStatus.rest_day ? `<div class="rest-banner">🛌 Ma pihenőnap van. Kihagyhatod, és ettől nem törik a streak.</div>` : ''}
      ${d.exercise?.targetRaised ? `<div class="success-banner">🚀 Új napi cél: ${fmtNum(d.exercise.daily_goal)} ${esc(ex.unit)}</div>` : ''}
      ${d.exercise?.goalDropped ? `<div class="warn-banner">↩️ A cél visszaállt ${fmtNum(d.exercise.daily_goal)} ${esc(ex.unit)} értékre.</div>` : ''}
    </div>
    <div class="card"><div class="section-head"><h3>⚡ Gyorsgombok</h3><span class="muted">azonnal ment</span></div><div class="quick-grid">${ex.quick_buttons.map(v=>`<button class="quick" data-add="${v}">+${fmtNum(v)}</button>`).join('')}</div></div>
    <div class="card"><div class="section-head"><h3>✍️ Egyedi rögzítés</h3></div><div class="form-grid two"><label>Érték<input id="customAmount" type="number" step="any"></label><label>Megjegyzés<input id="customNote" maxlength="200"></label></div><button class="primary full" id="customAdd">Mentés</button></div>
    ${d.suggestedSets?.length ? `<div class="card"><div class="section-head"><h3>🏋️ Sorozat-ajánló</h3><span class="muted">hátralévő célra</span></div><div class="set-suggestions">${d.suggestedSets.map((v,i)=>`<div><span>${i+1}. sorozat</span><strong>${fmtNum(v)} ${esc(ex.unit)}</strong></div>`).join('')}</div></div>` : ''}
    <div class="card"><div class="section-head"><h3>📌 Mai edzések</h3><span>${d.rows.length} rögzítés</span></div>${d.rows.length?d.rows.map(r=>`<div class="log-row"><span>${dateTime(r.recorded_at)}</span><strong>${fmtNum(r.amount)} ${esc(ex.unit)}</strong></div>`).join(''):'<div class="muted">Még nincs mai adat.</div>'}</div>`;
  $('#activeExSelect').onchange = e => { state.activeExerciseId = e.target.value; loadHome(); };
  $('#exManage').onclick = () => openExerciseManager();
  document.querySelectorAll('[data-add]').forEach(b => b.onclick = () => quickAdd(Number(b.dataset.add)));
  $('#customAdd').onclick = () => manualAdd();
}

async function quickAdd(value) {
  try {
    const d = await api('workout-add',{exerciseId:selectedExercise().id,amount:value,note:''});
    if (d.exercise?.targetRaised) celebrate('Új napi cél! 🚀');
    else if (d.workout) {
      const s = await api('stats',{exerciseId:selectedExercise().id});
      if (s.currentStreak === 7 || s.currentStreak === 30 || s.currentStreak === 3) celebrate(`${s.currentStreak} napos streak! 🔥`);
    }
    await loadHome();
  } catch(e) { showToast(e.message,'error'); }
}

async function manualAdd() {
  try {
    const amount = Number($('#customAmount').value);
    if (!(amount > 0)) throw new Error('Adj meg pozitív értéket.');
    const d = await api('workout-add',{exerciseId:selectedExercise().id,amount,note:$('#customNote').value.trim()});
    if (d.exercise?.targetRaised) celebrate('Új napi cél! 🚀');
    $('#customAmount').value=''; $('#customNote').value='';
    await loadHome();
  } catch(e) { showToast(e.message,'error'); }
}

async function loadStats() {
  const ex = selectedExercise(); if (!ex) return;
  const s = await api('stats',{exerciseId:ex.id});
  state.stats = s;
  $('#statsView').innerHTML = `<div class="row between"><h2>${esc(ex.name)}</h2><select id="statsEx">${state.exercises.map(x=>`<option value="${x.id}" ${x.id===ex.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div>
  <div class="stat-grid"><div class="card"><span>Összesen</span><strong>${fmtNum(s.total)} ${esc(ex.unit)}</strong></div><div class="card"><span>Aktív napok</span><strong>${s.activeDays}</strong></div><div class="card"><span>Átlag / nap</span><strong>${fmtNum(s.averagePerDay)} ${esc(ex.unit)}</strong></div><div class="card"><span>Streak</span><strong>${s.currentStreak} nap 🔥</strong></div><div class="card"><span>Rekord streak</span><strong>${s.longestStreak} nap</strong></div><div class="card"><span>Legjobb nap</span><strong>${s.bestDay?fmtNum(s.bestDay.total)+' '+esc(ex.unit):'-'}</strong></div></div>
  <div class="card"><div class="section-head"><h3>📈 Minden rögzítés</h3><div class="chip-row"><button class="chip ${state.chartRange==='all'?'active':''}" data-range="all">Összes</button><button class="chip ${state.chartRange==='30'?'active':''}" data-range="30">30 nap</button><button class="chip ${state.chartRange==='7'?'active':''}" data-range="7">7 nap</button></div></div><canvas id="mainChart" height="280"></canvas><div class="chart-legend"><span>${esc(ex.unit)}</span><span>pont = egy rögzítés</span></div></div>
  <div class="card"><div class="section-head"><h3>🏆 Rekordok</h3></div><div class="log-row"><span>Első edzés</span><strong>${s.firstDate?dateOnly(s.firstDate):'-'}</strong></div><div class="log-row"><span>Legjobb nap</span><strong>${s.bestDay?`${dateOnly(s.bestDay.day)} · ${fmtNum(s.bestDay.total)} ${esc(ex.unit)}`:'-'}</strong></div></div>`;
  $('#statsEx').onchange = e => { state.activeExerciseId = e.target.value; loadStats(); };
  document.querySelectorAll('[data-range]').forEach(b => b.onclick = async () => { state.chartRange = b.dataset.range; await loadStats(); });
  drawPointChart($('#mainChart'), s.entries || [], ex.unit);
}

function drawPointChart(canvas, entries, unit) {
  const ctx = canvas.getContext('2d'); const dpr = devicePixelRatio||1; const rect=canvas.getBoundingClientRect(); canvas.width=rect.width*dpr; canvas.height=280*dpr; ctx.setTransform(dpr,0,0,dpr,0,0);
  const W=rect.width,H=280; ctx.clearRect(0,0,W,H); const cs=getComputedStyle(document.documentElement); const text=cs.getPropertyValue('--text').trim(); const grid=cs.getPropertyValue('--border').trim(); const accent=cs.getPropertyValue('--accent').trim();
  if (!entries.length){ctx.fillStyle=text;ctx.fillText('Még nincs adat',20,35);return;}
  const values=entries.map(e=>Number(e.amount)||0); const max=Math.max(...values,1); const left=48,right=18,top=20,bottom=48; const cw=W-left-right,ch=H-top-bottom;
  ctx.font='11px system-ui'; ctx.strokeStyle=grid; ctx.fillStyle=text;
  for(let i=0;i<=4;i++){const v=max*i/4;const y=H-bottom-(v/max)*ch;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(W-right,y);ctx.stroke();ctx.fillText(Math.round(v),5,y+4);}
  entries.forEach((e,i)=>{const x=left+(entries.length===1?cw/2:(i/(entries.length-1))*cw);const y=H-bottom-(Number(e.amount)/max)*ch;ctx.fillStyle=accent;ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();});
  ctx.fillStyle=text; ctx.font='10px system-ui'; const step=Math.max(1,Math.ceil(entries.length/6)); entries.forEach((e,i)=>{if(i%step!==0&&i!==entries.length-1)return;const x=left+(entries.length===1?cw/2:(i/(entries.length-1))*cw);const dt=new Date(e.recorded_at);const label=`${String(dt.getMonth()+1).padStart(2,'0')}.${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;ctx.save();ctx.translate(x-18,H-12);ctx.rotate(-0.25);ctx.fillText(label,0,0);ctx.restore();});
}

async function loadCalendar() {
  const ex=selectedExercise(); if(!ex)return; const now=new Date(); const y=now.getFullYear(),m=now.getMonth(); const map=await api('calendar',{exerciseId:ex.id,year:y,month:m});
  const first=new Date(y,m,1); const days=new Date(y,m+1,0).getDate(); let start=first.getDay(); start=start===0?6:start-1;
  let cells=''; for(let i=0;i<start;i++)cells+='<div></div>'; for(let day=1;day<=days;day++){const key=`${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`; const v=map[key]; let cls='calendar-day'; if(v?.rest_day)cls+=' rest'; else if(v?.completed)cls+=' done'; else if((v?.total||0)>0)cls+=' partial'; cells+=`<button class="${cls}" title="${v?`${fmtNum(v.total)} / ${fmtNum(v.target||ex.daily_goal)} ${esc(ex.unit)}`:''}">${day}</button>`;}
  $('#calendarView').innerHTML=`<div class="row between"><h2>📅 ${new Intl.DateTimeFormat('hu-HU',{month:'long',year:'numeric'}).format(now)}</h2><select id="calEx">${state.exercises.map(x=>`<option value="${x.id}" ${x.id===ex.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div><div class="calendar-head"><span>H</span><span>K</span><span>Sze</span><span>Cs</span><span>P</span><span>Szo</span><span>V</span></div><div class="calendar-grid">${cells}</div><div class="legend"><span><i class="dot done"></i>Cél teljesítve</span><span><i class="dot partial"></i>Részleges</span><span><i class="dot rest"></i>Pihenőnap</span></div>`;
  $('#calEx').onchange=e=>{state.activeExerciseId=e.target.value;loadCalendar();};
}

async function loadFriends() {
  const [friends, requests] = await Promise.all([api('friend-list'),api('friend-requests')]); state.friends=friends; state.requests=requests;
  $('#friendsView').innerHTML=`<div class="row between"><h2>👥 Barátok</h2><span class="badge">${requests.length} kérés</span></div><div class="card"><h3>Meghívás</h3><p class="muted">A barátodtól kapott 8 karakteres meghívókódot írd be.</p><div class="form-grid two"><input id="friendTarget" placeholder="Meghívókód"><button class="primary" id="sendFriend">Meghívás</button></div></div>${requests.length?`<div class="card"><h3>📥 Beérkező kérések</h3>${requests.map(r=>`<div class="friend-row"><div><strong>${esc(r.user.username)}</strong><small>meghívott téged</small></div><div class="row"><button class="success small" data-accept="${r.id}">✓</button><button class="danger small" data-reject="${r.id}">✕</button></div></div>`).join('')}</div>`:''}<div class="card"><h3>✅ Barátaim</h3>${friends.length?friends.map(f=>`<div class="friend-row"><div><strong>${esc(f.username)}</strong></div><button class="secondary small" data-friend="${f.id}">📊</button></div>`).join(''):'<div class="muted">Még nincs barátod.</div>'}</div>${state.friendStats?friendStatsHtml(state.friendStats):''}`;
  $('#sendFriend').onclick=async()=>{try{const r=await api('friend-invite',{code:$('#friendTarget').value.trim()});showToast(r.message,'success');$('#friendTarget').value='';await loadFriends();}catch(e){showToast(e.message,'error')}};
  document.querySelectorAll('[data-accept]').forEach(b=>b.onclick=async()=>{await api('friend-respond',{requestId:b.dataset.accept,accept:true});await loadFriends();});
  document.querySelectorAll('[data-reject]').forEach(b=>b.onclick=async()=>{await api('friend-respond',{requestId:b.dataset.reject,accept:false});await loadFriends();});
  document.querySelectorAll('[data-friend]').forEach(b=>b.onclick=async()=>{try{state.friendStats=await api('friend-stats',{friendId:b.dataset.friend});await loadFriends();}catch(e){showToast(e.message,'error')}});
}

function friendStatsHtml(fs){return `<div class="card"><h3>📈 ${esc(fs.profile.username)} statisztikái</h3>${(fs.exercises||[]).map(x=>`<div class="friend-stat"><div><strong>${esc(x.exercise.name)}</strong><small>${fmtNum(x.total)} ${esc(x.exercise.unit)} összesen</small></div><span>🔥 ${x.currentStreak}</span></div>`).join('')}</div>`}

async function loadChallenges(){
  const list=await api('challenge-list'); state.challenges=list;
  const friends=await api('friend-list');
  const ex=selectedExercise();
  $('#challengeView').innerHTML=`<div class="row between"><h2>⚔️ Kihívások</h2></div><div class="card"><h3>Új kihívás</h3><label>Név<input id="chName" placeholder="30 napos fekvőtámasz"></label><label>Gyakorlat<select id="chEx">${state.exercises.map(x=>`<option value="${x.id}" ${x.id===ex?.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label><label>Típus<select id="chType"><option value="team_total">Ketten együtt</option><option value="race">Ki éri el hamarabb?</option></select></label><label>Cél<input id="chGoal" type="number" value="1000"></label><label>Barát<select id="chFriend">${friends.map(f=>`<option value="${f.id}">${esc(f.username)}</option>`).join('')}</select></label><div class="form-grid two"><label>Kezdés<input id="chStart" type="date" value="${localDateKey()}"></label><label>Vége<input id="chEnd" type="date" value="${localDateKey(addDays(new Date(),30))}"></label></div><button class="primary full" id="createCh">⚔️ Létrehozás</button></div>${list.length?`<div class="card"><h3>Aktív / függő kihívások</h3>${list.map(c=>`<div class="challenge"><div class="row between"><strong>${esc(c.name)}</strong><span class="badge">${c.challenge_type==='race'?'verseny':'közös'}</span></div><div class="muted">${esc(c.exercise.name)} · ${fmtNum(c.goal)} ${esc(c.exercise.unit)}</div><div class="progress"><span style="width:${Math.min(100,c.progress||0)}%"></span></div><div class="row between"><span>${fmtNum(c.total)} ${esc(c.exercise.unit)}</span><span>${Math.round(c.progress||0)}%</span></div>${c.myStatus==='pending'?'<button class="primary full" data-chaccept="'+c.id+'">✅ Elfogadom</button>':''}<div class="challenge-members">${(c.memberTotals||[]).map(m=>`<span>${esc(m.username)}: ${fmtNum(m.total)}</span>`).join('')}</div></div>`).join('')}</div>`:'<div class="card muted">Még nincs kihívás.</div>'}`;
  $('#createCh').onclick=async()=>{try{await api('challenge-create',{name:$('#chName').value.trim(),exerciseId:$('#chEx').value,challengeType:$('#chType').value,goal:Number($('#chGoal').value),friendId:$('#chFriend').value,startAt:new Date($('#chStart').value+'T00:00:00').toISOString(),endAt:new Date($('#chEnd').value+'T23:59:59').toISOString()});showToast('Kihívás elküldve.','success');await loadChallenges();}catch(e){showToast(e.message,'error')}};
  document.querySelectorAll('[data-chaccept]').forEach(b=>b.onclick=async()=>{await api('challenge-respond',{challengeId:b.dataset.chaccept,accept:true});await loadChallenges();});
}

function renderSettings(){
  const exs=state.exercises;
  $('#settingsView').innerHTML=`<div class="row between"><h2>⚙️ Beállítások</h2></div><div class="card"><h3>Profil</h3><label>Név<input id="setName" value="${esc(state.profile.username)}"></label><button class="primary full" id="saveName">Név mentése</button></div><div class="card"><h3>Megjelenés</h3><div class="invite-box"><span class="muted">Saját meghívókód</span><strong class="invite-code">${esc(state.profile.invite_code||'')}</strong></div>${switchRow('darkMode','🌙 Sötét mód',!!state.settings.darkMode)}${switchRow('vibration','📳 Rezgés',state.settings.vibration!==false)}${switchRow('animations','🎉 Animációk',state.settings.animations!==false)}${switchRow('restDayHints','🛌 Pihenőnap-jelzések',state.settings.restDayHints!==false)}</div><div class="card"><div class="row between"><h3>Gyakorlatok</h3><button class="primary small" id="newExBtn">+ Új</button></div>${exs.map(e=>`<div class="exercise-setting"><div><strong>${esc(e.name)}</strong><small>${fmtNum(e.daily_goal)} ${esc(e.unit)} · ${e.quick_buttons.map(fmtNum).join(' / ')}</small></div><div class="row"><button class="secondary small" data-edit="${e.id}">✏️</button><button class="danger small" data-del="${e.id}">🗑️</button></div></div>`).join('')}</div><button class="danger full" id="logout2">Kijelentkezés</button>`;
  $('#saveName').onclick=async()=>{try{const name=$('#setName').value.trim();const d=await api('profile-update',{name});state.profile.username=d.username;showToast('Mentve.','success');}catch(e){showToast(e.message,'error')}};
  $('#newExBtn').onclick=()=>openExerciseManager();
  document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openExerciseManager(state.exercises.find(x=>x.id===b.dataset.edit)));
  document.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{if(confirm('Biztosan törlöd?')){await api('exercise-delete',{id:b.dataset.del});state.exercises=state.exercises.filter(x=>x.id!==b.dataset.del);if(state.activeExerciseId===b.dataset.del)state.activeExerciseId=state.exercises[0]?.id;renderSettings();}});
  $('#logout2').onclick=logout;
  document.querySelectorAll('[data-setting]').forEach(el=>el.onchange=async()=>{state.settings[el.dataset.setting]=el.checked;applyTheme();await api('settings-save',{settings:state.settings});});
}

function switchRow(id,label,checked){return `<div class="switch-row"><span>${label}</span><label class="switch"><input type="checkbox" data-setting="${id}" ${checked?'checked':''}><span class="slider"></span></label></div>`}

async function apiUpdateProfileName(name){
}

function openExerciseManager(existing){
  const e=existing||{name:'',category:'strength',unit:'db',daily_goal:20,is_time_based:false,is_set_based:true,quick_buttons:[5,10,15,20,30],goal_rise_enabled:true,goal_rise_success_days:4,goal_rise_count:4,suggested_sets_enabled:false,suggested_sets_count:5};
  const modal=document.createElement('div');modal.className='modal';modal.innerHTML=`<div class="modal-card"><div class="row between"><h2>${existing?'Gyakorlat szerkesztése':'Új gyakorlat'}</h2><button class="icon-btn" id="closeModal">✕</button></div><div class="form-grid two"><label>Név<input id="eName" value="${esc(e.name)}"></label><label>Kategória<select id="eCategory"><option ${e.category==='strength'?'selected':''} value="strength">Erő</option><option ${e.category==='cardio'?'selected':''} value="cardio">Kardió</option><option ${e.category==='time'?'selected':''} value="time">Idő</option><option ${e.category==='generic'?'selected':''} value="generic">Egyéb</option></select></label><label>Mértékegység<input id="eUnit" value="${esc(e.unit)}"></label><label>Napi cél<input id="eGoal" type="number" step="any" value="${e.daily_goal}"></label><label>Gyorsgombok<input id="eButtons" value="${(e.quick_buttons||[]).join(',')}"></label><label>Célemelés után ennyi sikeres nap<input id="eRiseDays" type="number" value="${e.goal_rise_success_days||4}"></label><label>Célemeléshez felhasznált első ennyi érték<input id="eRiseCount" type="number" value="${e.goal_rise_count||4}"></label><label>Ajánlott sorozatok száma<input id="eSetCount" type="number" value="${e.suggested_sets_count||5}"></label></div><div class="toggle-grid"><label><input type="checkbox" id="eTime" ${e.is_time_based?'checked':''}> Időalapú</label><label><input type="checkbox" id="eSets" ${e.is_set_based?'checked':''}> Sorozatos</label><label><input type="checkbox" id="eRise" ${e.goal_rise_enabled?'checked':''}> Automatikus cél-emelés</label><label><input type="checkbox" id="eSuggested" ${e.suggested_sets_enabled?'checked':''}> Sorozat-ajánló</label></div><button class="primary full" id="saveEx">💾 Mentés</button></div>`;document.body.appendChild(modal);
  $('#closeModal').onclick=()=>modal.remove();$('#saveEx').onclick=async()=>{try{const payload={name:$('#eName').value.trim(),category:$('#eCategory').value,unit:$('#eUnit').value.trim()||'db',dailyGoal:Number($('#eGoal').value),quickButtons:$('#eButtons').value.split(',').map(x=>Number(x.trim())).filter(x=>x>0),goalRiseSuccessDays:Number($('#eRiseDays').value),goalRiseCount:Number($('#eRiseCount').value),goalRiseEnabled:$('#eRise').checked,isTimeBased:$('#eTime').checked,isSetBased:$('#eSets').checked,suggestedSetsEnabled:$('#eSuggested').checked,suggestedSetsCount:Number($('#eSetCount').value)};const saved=existing?await api('exercise-update',{id:existing.id,...payload}):await api('exercise-create',payload);if(existing){state.exercises=state.exercises.map(x=>x.id===existing.id?saved:x);}else{state.exercises.push(saved);state.activeExerciseId=saved.id;}modal.remove();renderSettings();showToast('Gyakorlat mentve.','success');}catch(err){showToast(err.message,'error')}};
}

if ('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
boot();
