/* StripeMuMu API - server.js
   Jalankan lokal : npm install && npm start   (http://localhost:3000)
   Deploy         : Vercel / Render / Railway (lihat vercel.json), lalu isi APIB di index.html
   Pakai di web lain:
     fetch('https://API-ANDA.vercel.app/api/songs?limit=10',{headers:{'x-api-key':'AAA-XXXXX'}}).then(r=>r.json()).then(console.log)
*/
const express = require('express');
const cors = require('cors');

const SB_URL = process.env.SUPABASE_URL || 'https://mumnmulvenjwhtvauhzd.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY || 'sb_publishable_VjvGjA1mIfF-Rj6doQYPKA_Dz7nE0Wm';
const LIMIT = +process.env.RATE_LIMIT || 60; // permintaan per menit per API key

const app = express();
// CORS: izinkan SEMUA domain (website mana pun boleh memanggil API ini)
app.use(cors({ origin: '*', methods: ['GET', 'OPTIONS'], allowedHeaders: ['Content-Type', 'x-api-key'], maxAge: 86400 }));

const sb = async (path, opt = {}) => {
  const r = await fetch(SB_URL + '/rest/v1/' + path, { ...opt, headers: { apikey: SB_KEY, 'Content-Type': 'application/json', ...opt.headers } });
  const t = await r.text(), j = t ? JSON.parse(t) : null;
  if (!r.ok) throw Object.assign(new Error((j && j.message) || 'Upstream error'), { status: r.status });
  return j;
};
const rpc = (f, a) => sb('rpc/' + f, { method: 'POST', body: JSON.stringify(a) });
const F = 'id,title,version,description,notes,category,dev_name,downloads,created_at';
const hits = new Map();

app.get('/', (req, res) => res.json({
  name: 'StripeMuMu API', musik: 'GET /api/songs , GET /api/songs/:id',
  auth: 'Header x-api-key: AAA-XXXXX (buat di aplikasi: Akun Developer > API)',
  query: 'q, category, limit (maks 100), offset'
}));
app.get('/health', (req, res) => res.json({ ok: true }));

// Autentikasi API key + pembatas laju
app.use('/api', async (req, res, next) => {
  const key = String(req.get('x-api-key') || req.query.key || '').trim().toUpperCase();
  if (!/^[A-Z]{3}-[A-Z0-9]{5}$/.test(key)) return res.status(401).json({ error: 'API key tidak ada atau formatnya salah (AAA-XXXXX)' });
  const now = Date.now(), h = (hits.get(key) || []).filter(t => now - t < 60000);
  if (h.length >= LIMIT) return res.status(429).json({ error: 'Terlalu banyak permintaan, coba lagi sebentar' });
  h.push(now); hits.set(key, h);
  try {
    const dev = await rpc('api_check', { k: key });
    if (!dev) return res.status(403).json({ error: 'API key tidak valid' });
    req.dev = dev; next();
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/me', (req, res) => res.json({ developer: req.dev }));

app.get('/api/songs', async (req, res) => {
  try {
    const q = String(req.query.q || '').replace(/[(),*%&#]/g, '').trim();
    const f = ['select=' + F, 'order=downloads.desc,created_at.desc', 'limit=' + Math.min(100, +req.query.limit || 20), 'offset=' + (+req.query.offset || 0)];
    if (q) f.push(`or=(title.ilike.*${encodeURIComponent(q)}*,dev_name.ilike.*${encodeURIComponent(q)}*)`);
    if (req.query.category) f.push('category=eq.' + encodeURIComponent(String(req.query.category)));
    const songs = await sb('songs?' + f.join('&'));
    res.json({ count: songs.length, songs });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

app.get('/api/songs/:id', async (req, res) => {
  const id = req.params.id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'ID lagu tidak valid' });
  try {
    const [m] = await sb(`songs?select=${F}&id=eq.${id}`);
    if (!m) return res.status(404).json({ error: 'Lagu tidak ditemukan' });
    res.json({ ...m, data: await rpc('song_download', { i: id }) }); // data = isi musik (JSON StripeMuMu)
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

app.use((req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan' }));

module.exports = app; // dipakai Vercel
if (require.main === module) {
  const P = process.env.PORT || 3000;
  app.listen(P, () => console.log('StripeMuMu API berjalan di http://localhost:' + P));
        }
