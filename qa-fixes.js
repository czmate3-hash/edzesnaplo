/* Edzésnapló QA fixes
 * Loaded after app.js. Keeps the existing UI/API while correcting presentation
 * and date-range behaviour without duplicating the whole application.
 */
(() => {
  if (window.__edzesnaploQaLoaded) return;
  window.__edzesnaploQaLoaded = true;

  const originalApi = window.api;
  const originalLoadStats = window.loadStats;
  const originalLoadCalendar = window.loadCalendar;
  const originalLoadHome = window.loadHome;
  const originalLoadChallenges = window.loadChallenges;

  const pad = n => String(n).padStart(2, '0');
  const key = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };

  if (typeof originalApi === 'function') {
    window.api = async (action, payload = {}, requiresAuth = true) => {
      const p = {...payload};
      if (action === 'stats' && state.chartRange && state.chartRange !== 'all') {
        const end = new Date();
        const days = state.chartRange === '7' ? 6 : 29;
        p.to = key(end);
        p.from = key(addDays(end, -days));
      }
      if (action === 'calendar') {
        if (!state.calendarCursor) state.calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        p.year = state.calendarCursor.getFullYear();
        p.month = state.calendarCursor.getMonth();
      }
      return originalApi(action, p, requiresAuth);
    };
  }

  window.loadHome = async function() {
    const result = await originalLoadHome();
    const ring = document.querySelector('.goal-ring');
    if (ring) {
      const total = Number(document.querySelector('.goal-ring strong')?.textContent?.replace(/[^0-9.,-]/g,'').replace(',','.') || 0);
      const goal = Number(document.querySelector('.goal-ring span')?.textContent?.match(/[0-9.,]+/)?.[0]?.replace(',','.') || 0);
      const pct = goal > 0 ? Math.min(100, Math.max(0, total / goal * 100)) : 0;
      ring.style.setProperty('--goal-pct', `${pct}%`);
    }
    return result;
  };

  window.loadStats = async function() {
    return originalLoadStats();
  };

  window.loadCalendar = async function() {
    const result = await originalLoadCalendar();
    const host = document.querySelector('#calendarView');
    if (!host || host.querySelector('.qa-calendar-nav')) return result;
    const nav = document.createElement('div');
    nav.className = 'qa-calendar-nav row between';
    nav.innerHTML = `<button class="secondary small" data-cal-prev>‹ Előző</button><strong class="qa-cal-label"></strong><button class="secondary small" data-cal-next>Következő ›</button>`;
    host.prepend(nav);
    const label = nav.querySelector('.qa-cal-label');
    const updateLabel = () => label.textContent = state.calendarCursor.toLocaleDateString('hu-HU', {year:'numeric', month:'long'});
    updateLabel();
    nav.querySelector('[data-cal-prev]').onclick = () => { state.calendarCursor.setMonth(state.calendarCursor.getMonth()-1); render(); };
    nav.querySelector('[data-cal-next]').onclick = () => { state.calendarCursor.setMonth(state.calendarCursor.getMonth()+1); render(); };
    return result;
  };

  window.loadChallenges = async function() {
    const result = await originalLoadChallenges();
    document.querySelectorAll('[data-challenge]').forEach(card => {
      const type = card.dataset.challengeType;
      if (type !== 'race') return;
      const winner = card.dataset.winnerName;
      if (winner) {
        const el = document.createElement('div');
        el.className = 'success-banner';
        el.textContent = `🏆 Győztes: ${winner}`;
        card.appendChild(el);
      }
    });
    return result;
  };

  // Re-run the active screen after the initial app mount so wrappers are used.
  if (window.state && state.screen === 'home' && state.profile) {
    setTimeout(() => { try { render(); } catch (_) {} }, 0);
  }
})();
