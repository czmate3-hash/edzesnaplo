const CACHE = 'edzesnaplo-v6';
const CORE = ['./', './index.html', './styles.css', './app.js', './auth-route.js', './qa-fixes.js', './manifest.webmanifest', './icons/icon-192.svg', './icons/icon-512.svg'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const r=event.request;if(r.method!=='GET')return;const u=new URL(r.url);
  if(u.hostname.endsWith('.supabase.co')||r.headers.has('Authorization'))return;
  if(r.mode==='navigate'||/\/(app|auth-route|qa-fixes|styles)\.js$|\/(styles)\.css$|manifest\.webmanifest$|\/icons\//.test(u.pathname)){
    event.respondWith(fetch(r).then(res=>{const c=res.clone();caches.open(CACHE).then(x=>x.put(r,c));return res}).catch(()=>caches.match(r).then(x=>x||caches.match('./index.html'))));return;
  }
  event.respondWith(caches.match(r).then(x=>x||fetch(r)));
});
