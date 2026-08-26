(() => {
  const AUTH_URL = EDZESNAPLO_AUTH_URL;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    try {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url.endsWith('/functions/v1/api') && init?.body) {
        const body = JSON.parse(init.body);
        if (body?.action === 'login' || body?.action === 'recover-pin') {
          return originalFetch(AUTH_URL, { ...init, body: JSON.stringify(body) });
        }
      }
    } catch (_) {}
    return originalFetch(input, init);
  };
})();
