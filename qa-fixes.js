/* Final QA layer: range filtering, calendar navigation, dynamic goal ring, startup finalization, milestone feedback and challenge state presentation. */
(() => {
  if (window.__edzesnaploQaLoaded) return;
  window.__edzesnaploQaLoaded = true;
  const originalApi = window.api;
  const originalLoadHome = window.loadHome;
  const originalLoadStats = window.loadStats;
  const originalLoadChallenges = window.loadChallenges;
  const pad = n => String(n).padStart(2, '0');
  const key = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const addDays = (d,n) => { const x=new Date(d); x.setDate(x.getDate()+n); return x; };
  if (!state.calendarCursor) state.calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  async function startupFinalize() {
    if (!state.profile || !state.token) return;
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/finalize-day`, {
        method:'POST', headers:{'Content-Type':'application/json','apikey':SUPABASE_ANON_KEY,'Authorization':`Bearer ${state.token}`},
        body:JSON.stringify({timezone:Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Budapest'})
      });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(data.error || `Napzárási hiba (${res.status})`);
      if (Array.isArray(data.changed) && data.changed.length) showToast('A tegnapi nem teljesített megemelt cél visszaállt.','info');
      if (state.screen === 'home' && typeof originalLoadHome === 'function') await originalLoadHome();
    } catch (e) { console.warn('finalize-day:', e); }
  }

  if (typeof originalApi === 'function') {
    window.api = async (action, payload = {}, requiresAuth = true) => {
      const p = {...payload};
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Budapest';
      if (action === 'stats' && state.chartRange !== 'all') {
        const end = new Date(); const days = state.chartRange === '7' ? 6 : 29;
        p.from = key(addDays(end, -days)); p.to = key(end);
      }
      if (action === 'calendar') { p.year = state.calendarCursor.getFullYear(); p.month = state.calendarCursor.getMonth(); }
      if (['stats','calendar','today','workout-add','challenge-list','challenge-create'].includes(action)) p.timezone = tz;
      const before = action === 'workout-add' ? Number(state.stats?.total || 0) : null;
      const result = await originalApi(action, p, requiresAuth);
      if (action === 'workout-add' && result?.exercise) {
        const amount = Number(result.workout?.amount || 0), oldTotal = before, newTotal = oldTotal + amount, goal = Number(result.exercise.daily_goal || 0);
        if (goal > 0 && newTotal >= goal && oldTotal < goal) celebrate('🎯 Napi cél teljesítve!');
        if (result.exercise.targetRaised) celebrate(`🚀 Új napi cél: ${fmtNum(result.exercise.daily_goal)} ${unitText(result.exercise)}`);
        if (result.restTomorrow) showToast('🛌 Holnap pihenőnap. A streakedet nem rontja.','info');
      }
      return result;
    };
  }

  window.loadHome = async function() {
    const result = await originalLoadHome();
    const ring = document.querySelector('.goal-ring');
    if (ring) {
      const total = Number((document.querySelector('.goal-ring strong')?.textContent || '').replace(/[^0-9.,-]/g,'').replace(',','.')) || 0;
      const goal = Number((document.querySelector('.goal-ring span')?.textContent || '').match(/[0-9.,]+/)?.[0]?.replace(',','.')) || 0;
      const pct = goal > 0 ? Math.min(100, Math.max(0, total / goal * 100)) : 0;
      ring.style.background = `radial-gradient(circle at center,var(--card) 57%,transparent 58%),conic-gradient(var(--accent) 0 ${pct}%,var(--border) ${pct}% 100%)`;
    }
    return result;
  };

  window.loadStats = async function() { return originalLoadStats(); };

  window.loadCalendar = async function() {
    const ex = selectedExercise(); if (!ex) return;
    const map = await window.api('calendar', {exerciseId: ex.id});
    const d = state.calendarCursor, y=d.getFullYear(), m=d.getMonth();
    const first=new Date(y,m,1), days=new Date(y,m+1,0).getDate(); let start=first.getDay(); start=start===0?6:start-1;
    let cells=''; for(let i=0;i<start;i++) cells+='<div aria-hidden="true"></div>';
    for(let day=1;day<=days;day++) { const k=`${y}-${pad(m+1)}-${pad(day)}`,v=map[k]; let cls='calendar-day'; if(v?.rest_day)cls+=' rest'; else if(v?.completed)cls+=' done'; else if(Number(v?.total||0)>0)cls+=' partial'; cells+=`<button type="button" class="${cls}" aria-label="${k}" title="${v?`${fmtNum(v.total)} / ${fmtNum(v.target||ex.daily_goal)} ${esc(ex.unit)}`:''}">${day}</button>`; }
    $('#calendarView').innerHTML=`<div class="row between"><button class="secondary small" id="calPrev" aria-label="Előző hónap">‹</button><h2>📅 ${new Intl.DateTimeFormat('hu-HU',{month:'long',year:'numeric'}).format(d)}</h2><button class="secondary small" id="calNext" aria-label="Következő hónap">›</button></div><select id="calEx" aria-label="Gyakorlat">${state.exercises.map(x=>`<option value="${x.id}" ${x.id===ex.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select><div class="calendar-head"><span>H</span><span>K</span><span>Sze</span><span>Cs</span><span>P</span><span>Szo</span><span>V</span></div><div class="calendar-grid">${cells}</div><div class="legend"><span><i class="dot done"></i>Cél teljesítve</span><span><i class="dot partial"></i>Részleges</span><span><i class="dot rest"></i>Pihenőnap</span></div>`;
    $('#calPrev').onclick=()=>{state.calendarCursor=new Date(y,m-1,1);render()}; $('#calNext').onclick=()=>{state.calendarCursor=new Date(y,m+1,1);render()}; $('#calEx').onchange=e=>{state.activeExerciseId=e.target.value;render()};
  };

  window.loadChallenges = async function() {
    const result = await originalLoadChallenges();
    document.querySelectorAll('[data-chaccept]').forEach(btn => {
      if (btn.parentElement.querySelector('[data-chreject]')) return;
      const reject=document.createElement('button'); reject.className='danger full'; reject.dataset.chreject=btn.dataset.chaccept; reject.textContent='❌ Elutasítom';
      btn.parentElement.appendChild(reject); reject.onclick=async()=>{await api('challenge-respond',{challengeId:reject.dataset.chreject,accept:false});await window.loadChallenges();};
    });
    const list=state.challenges||[];
    document.querySelectorAll('.challenge').forEach((card,i)=>{
      const c=list[i]; if(!c)return;
      const expired = c.end_at && new Date(c.end_at) < new Date() && c.status !== 'completed';
      if(c.winner){const b=document.createElement('div');b.className='success-banner';b.textContent=`🏆 Győztes: ${c.winner.username}`;card.appendChild(b);}
      if(c.winner_user_id && !c.winner){const b=document.createElement('div');b.className='success-banner';b.textContent='🏆 A versenyt már megnyerték.';card.appendChild(b);}
      if(expired){const b=document.createElement('div');b.className='warn-banner';b.textContent='⌛ A kihívás lejárt.';card.appendChild(b);}
      if(c.challenge_type==='race' && c.memberTotals?.length){const sorted=[...c.memberTotals].sort((a,b)=>Number(b.total)-Number(a.total));const summary=document.createElement('div');summary.className='muted';summary.textContent='Verseny: '+sorted.map((m,idx)=>`${idx+1}. ${m.username} ${fmtNum(m.total)}`).join(' · ');card.appendChild(summary);}
    });
    return result;
  };

  const bootWait = setInterval(() => { if (state.profile && state.token) { clearInterval(bootWait); startupFinalize(); } }, 100);
  setTimeout(() => clearInterval(bootWait), 10000);
})();
