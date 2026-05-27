// [SECURITY] CORS 限縮為正式前端域名，拒絕其他來源
const ALLOWED_ORIGIN = 'https://music-inspection.pages.dev';
const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const GAS_URL = 'https://script.google.com/a/macros/fme.com.tw/s/AKfycbzflj4bYTiLefla5gV1epG-9B_cKh6VqVIxAW9ypAaifHu2N2C1g1IdiXzkl5PITOBeHA/exec';

// [SECURITY] IP 速率限制：每 IP 每分鐘最多 10 次 /api/auth 請求
const authRateLimit = new Map(); // ip -> { count, resetAt }
function checkRateLimit(ip) {
  const now = Date.now();
  const entry = authRateLimit.get(ip);
  if (!entry || now > entry.resetAt) {
    authRateLimit.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      // ── Auth Proxy（FME CheckUserId）──────────────────────
      if (path === '/api/auth' && method === 'POST') {
        return await handleAuth(request);
      }

      // ── Records ────────────────────────────────────────────
      if (path === '/api/records') {
        if (method === 'GET')  return await getRecords(request, env);
        if (method === 'POST') return await createRecord(request, env);
      }
      const recMatch = path.match(/^\/api\/records\/(.+)$/);
      if (recMatch) {
        if (method === 'PUT')    return await updateRecord(request, env, recMatch[1]);
        if (method === 'DELETE') return await deleteRecord(request, env, recMatch[1]);
      }

      // ── Stores ─────────────────────────────────────────────
      if (path === '/api/stores') {
        if (method === 'GET')  return await getStores(request, env);
        if (method === 'POST') return await createStore(request, env);
      }
      const storeMatch = path.match(/^\/api\/stores\/(\d+)$/);
      if (storeMatch) {
        if (method === 'DELETE') return await deleteStore(request, env, storeMatch[1]);
      }

      // ── Staff ──────────────────────────────────────────────
      if (path === '/api/staff') {
        if (method === 'GET')  return await getStaff(request, env);
        if (method === 'POST') return await createStaff(request, env);
      }
      const staffMatch = path.match(/^\/api\/staff\/(\d+)$/);
      if (staffMatch) {
        if (method === 'DELETE') return await deleteStaff(request, env, staffMatch[1]);
      }

      return json({ error: 'Not found' }, 404);
    } catch (e) {
      // [SECURITY] 不回傳內部錯誤細節
      return json({ error: 'Internal server error' }, 500);
    }
  }
};

// ── Auth Proxy ────────────────────────────────────────────────
async function handleAuth(request) {
  // [SECURITY] 速率限制：每 IP 每分鐘最多 10 次
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!checkRateLimit(ip)) {
    return json({ MSG: '429 請求過於頻繁，請稍後再試' }, 429);
  }
  const body = await request.json();

  // 透過 GCP Cloud Run 代理呼叫 FME CheckUserId API
  // （Cloudflare IP 被 FME 封鎖，GCP 可正常存取公司內網）
  const proxyUrl = 'https://music-inspect-403438157899.asia-east1.run.app/auth';

  const r = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ USER_ID: body.USER_ID, PSW: body.PSW }),
  });
  const data = await r.json();
  return json(data);
}

// ── Records ───────────────────────────────────────────────────
async function getRecords(request, env) {
  const p = new URL(request.url).searchParams;
  const course = p.get('course');
  const from   = p.get('from');
  const to     = p.get('to');

  let sql = 'SELECT * FROM records WHERE 1=1';
  const args = [];
  if (course) { sql += ' AND course=?'; args.push(course); }
  if (from)   { sql += ' AND date>=?';  args.push(from); }
  if (to)     { sql += ' AND date<=?';  args.push(to); }
  sql += ' ORDER BY created_at DESC';

  const { results } = await env.DB.prepare(sql).bind(...args).all();
  return json(results);
}

async function createRecord(request, env) {
  const d = await request.json();
  const ym = d.date.substring(0, 7);

  const dup = await env.DB.prepare(
    'SELECT id FROM records WHERE course=? AND store=? AND substr(date,1,7)=?'
  ).bind(d.course, d.store, ym).first();
  if (dup) return json({ error: '同月同店已有記錄', duplicate: true }, 409);

  const answers = typeof d.answers === 'string' ? d.answers : JSON.stringify(d.answers);
  await env.DB.prepare(
    `INSERT INTO records (id,store,staff,dept,course,date,answers,nm_reason,pass_all,pass_count,total,edit_log,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    d.id, d.store, d.staff, d.dept || '', d.course, d.date,
    answers, d.nm_reason || '', d.pass_all ? 1 : 0,
    d.pass_count || 0, d.total || 0, '[]', Date.now()
  ).run();

  await env.DB.prepare('UPDATE stores SET last_date=? WHERE course=? AND name=?')
    .bind(d.date, d.course, d.store).run();

  syncToSheets({ action: 'insert', record: d });
  return json({ ok: true });
}

async function updateRecord(request, env, id) {
  const d = await request.json();
  const existing = await env.DB.prepare('SELECT edit_log FROM records WHERE id=?').bind(id).first();
  if (!existing) return json({ error: '記錄不存在' }, 404);

  const log = JSON.parse(existing.edit_log || '[]');
  log.push({ editor: d.editor || 'unknown', time: new Date().toISOString() });

  const answers = typeof d.answers === 'string' ? d.answers : JSON.stringify(d.answers);
  await env.DB.prepare(
    'UPDATE records SET date=?,answers=?,nm_reason=?,pass_all=?,pass_count=?,total=?,edit_log=? WHERE id=?'
  ).bind(
    d.date, answers, d.nm_reason || '',
    d.pass_all ? 1 : 0, d.pass_count || 0, d.total || 0,
    JSON.stringify(log), id
  ).run();

  syncToSheets({ action: 'update', id, record: d });
  return json({ ok: true });
}

async function deleteRecord(request, env, id) {
  await env.DB.prepare('DELETE FROM records WHERE id=?').bind(id).run();
  syncToSheets({ action: 'delete', id });
  return json({ ok: true });
}

// ── Stores ────────────────────────────────────────────────────
async function getStores(request, env) {
  const course = new URL(request.url).searchParams.get('course');
  let sql = 'SELECT * FROM stores';
  const args = [];
  if (course) { sql += ' WHERE course=?'; args.push(course); }
  sql += ' ORDER BY name';
  const { results } = await env.DB.prepare(sql).bind(...args).all();
  return json(results);
}

async function createStore(request, env) {
  const body = await request.json();
  const items = Array.isArray(body) ? body : [body];
  for (const s of items) {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO stores (course,name,type,grp,last_date,created_at) VALUES (?,?,?,?,?,?)'
    ).bind(s.course, s.name, s.type || 'M', s.grp || '', s.last_date || '', Date.now()).run();
  }
  return json({ ok: true, count: items.length });
}

async function deleteStore(request, env, id) {
  await env.DB.prepare('DELETE FROM stores WHERE id=?').bind(id).run();
  return json({ ok: true });
}

// ── Staff ─────────────────────────────────────────────────────
async function getStaff(request, env) {
  const course = new URL(request.url).searchParams.get('course');
  let sql = 'SELECT * FROM staff';
  const args = [];
  if (course) { sql += ' WHERE course=?'; args.push(course); }
  sql += ' ORDER BY name';
  const { results } = await env.DB.prepare(sql).bind(...args).all();
  return json(results);
}

async function createStaff(request, env) {
  const body = await request.json();
  const items = Array.isArray(body) ? body : [body];
  for (const s of items) {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO staff (course,name,created_at) VALUES (?,?,?)'
    ).bind(s.course, s.name, Date.now()).run();
  }
  return json({ ok: true, count: items.length });
}

async function deleteStaff(request, env, id) {
  await env.DB.prepare('DELETE FROM staff WHERE id=?').bind(id).run();
  return json({ ok: true });
}

// ── Helpers ───────────────────────────────────────────────────
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function syncToSheets(payload) {
  fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}
