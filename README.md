# Edzésnapló

Ez a verzió a beállított Supabase projekthez van konfigurálva.

## FONTOS: indítás

Ne a `public/index.html` fájlra kattints dupla kattintással. Futtasd helyi webszerverrel:

```bash
cd public
py -m http.server 8000
```

Majd nyisd meg:

http://localhost:8000

A végleges használathoz a `public` mappát statikus webhelyként kell közzétenni (pl. Cloudflare Pages).

## Supabase

- Projekt: `ubskxxckecavlykftzju`
- Edge Function: `api`
- RLS: bekapcsolva
- Direct client access: tiltva; az alkalmazás Edge Functionön keresztül beszél az adatbázissal.
- A `MASTER_RECOVERY_CODE` Supabase secretként van beállítva.
