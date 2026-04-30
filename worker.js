// Cloudflare Worker - 音樂置換點檢 API v4
// D1 綁定名稱：DB

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

function json(data, status=200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

async function initDB(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY, store TEXT NOT NULL, staff TEXT NOT NULL,
    dept TEXT, course TEXT, date TEXT, answers TEXT, nm_reason TEXT,
    pass_all INTEGER, pass_count INTEGER, total INTEGER,
    edit_log TEXT DEFAULT '[]', created_at INTEGER
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_course ON records(course)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_date_store ON records(date, store)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS stores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course TEXT NOT NULL, name TEXT NOT NULL,
    type TEXT DEFAULT 'M', grp TEXT DEFAULT '', last_date TEXT DEFAULT '',
    created_at INTEGER, UNIQUE(course, name)
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_stores_course ON stores(course)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course TEXT NOT NULL, name TEXT NOT NULL,
    created_at INTEGER, UNIQUE(course, name)
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_staff_course ON staff(course)`).run();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === 'OPTIONS') return new Response('', { headers: CORS });

    try {
      await initDB(env.DB);

      // ── 點檢記錄 ──────────────────────────────────────

      if (request.method === 'GET' && path === '/api/records') {
        const course = url.searchParams.get('course');
        const from   = url.searchParams.get('from');
        const to     = url.searchParams.get('to');
        let q = 'SELECT * FROM records WHERE 1=1';
        const p = [];
        if (course) { q += ' AND course=?'; p.push(course); }
        if (from)   { q += ' AND date>=?';  p.push(from); }
        if (to)     { q += ' AND date<=?';  p.push(to); }
        q += ' ORDER BY created_at DESC';
        const { results } = await env.DB.prepare(q).bind(...p).all();
        return json(results.map(r => ({
          id: r.id, store: r.store, staff: r.staff, dept: r.dept,
          course: r.course, date: r.date,
          answers: JSON.parse(r.answers||'{}'),
          nmReason: r.nm_reason,
          passAll: r.pass_all===1, passCount: r.pass_count, total: r.total,
          editLog: JSON.parse(r.edit_log||'[]')
        })));
      }

      if (request.method === 'POST' && path === '/api/records') {
        const body = await request.json();
        // 同月同店防重複
        const recYM = body.date ? body.date.substring(0,7) : '';
        const exist = recYM ? await env.DB.prepare(
          "SELECT id FROM records WHERE store=? AND substr(date,1,7)=? LIMIT 1"
        ).bind(body.store, recYM).first() : null;
        if (exist) return json({
          error: 'DUPLICATE',
          message: `「${body.store}」本月已有點檢記錄，同月不可重複登錄。`
        }, 409);
        const id = body.id || Date.now().toString();
        await env.DB.prepare(
          'INSERT INTO records (id,store,staff,dept,course,date,answers,nm_reason,pass_all,pass_count,total,edit_log,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
        ).bind(id, body.store, body.staff, body.dept, body.course, body.date,
          JSON.stringify(body.answers||{}), body.nmReason||null,
          body.passAll?1:0, body.passCount||0, body.total||4,
          JSON.stringify(body.editLog||[]), Date.now()
        ).run();
        return json({ success: true, id });
      }

      if (request.method === 'PUT' && path.startsWith('/api/records/')) {
        const id = path.split('/')[3];
        const body = await request.json();
        // 支援日期修改（後蓋前）
        if (body.date) {
          await env.DB.prepare(
            'UPDATE records SET date=?,answers=?,nm_reason=?,pass_all=?,pass_count=?,edit_log=? WHERE id=?'
          ).bind(body.date,
            JSON.stringify(body.answers||{}), body.nmReason||null,
            body.passAll?1:0, body.passCount||0,
            JSON.stringify(body.editLog||[]), id
          ).run();
        } else {
          await env.DB.prepare(
            'UPDATE records SET answers=?,nm_reason=?,pass_all=?,pass_count=?,edit_log=? WHERE id=?'
          ).bind(JSON.stringify(body.answers||{}), body.nmReason||null,
            body.passAll?1:0, body.passCount||0,
            JSON.stringify(body.editLog||[]), id
          ).run();
        }
        return json({ success: true });
      }

      // ── 店舖名單 ──────────────────────────────────────

      if (request.method === 'GET' && path === '/api/stores') {
        const course = url.searchParams.get('course');
        let q = 'SELECT * FROM stores';
        const p = [];
        if (course) { q += ' WHERE course=?'; p.push(course); }
        q += ' ORDER BY course, name';
        const { results } = await env.DB.prepare(q).bind(...p).all();
        return json(results.map(r => ({
          id: r.id, course: r.course, name: r.name,
          type: r.type, group: r.grp, lastDate: r.last_date
        })));
      }

      if (request.method === 'POST' && path === '/api/stores') {
        const body = await request.json();
        if (Array.isArray(body)) {
          let added = 0;
          for (const s of body) {
            try {
              await env.DB.prepare(
                'INSERT OR IGNORE INTO stores (course,name,type,grp,last_date,created_at) VALUES (?,?,?,?,?,?)'
              ).bind(s.course, s.name, s.type||'M', s.group||'', s.lastDate||'', Date.now()).run();
              added++;
            } catch(e) {}
          }
          return json({ success: true, added });
        }
        try {
          await env.DB.prepare(
            'INSERT OR IGNORE INTO stores (course,name,type,grp,last_date,created_at) VALUES (?,?,?,?,?,?)'
          ).bind(body.course, body.name, body.type||'M', body.group||'', body.lastDate||'', Date.now()).run();
        } catch(e) { return json({ error: e.message }, 400); }
        return json({ success: true });
      }

      if (request.method === 'DELETE' && path.startsWith('/api/stores/')) {
        await env.DB.prepare('DELETE FROM stores WHERE id=?').bind(path.split('/')[3]).run();
        return json({ success: true });
      }

      // ── 人員名單 ──────────────────────────────────────

      if (request.method === 'GET' && path === '/api/staff') {
        const course = url.searchParams.get('course');
        let q = 'SELECT * FROM staff';
        const p = [];
        if (course) { q += ' WHERE course=?'; p.push(course); }
        q += ' ORDER BY course, name';
        const { results } = await env.DB.prepare(q).bind(...p).all();
        return json(results.map(r => ({ id: r.id, course: r.course, name: r.name })));
      }

      if (request.method === 'POST' && path === '/api/staff') {
        const body = await request.json();
        if (Array.isArray(body)) {
          let added = 0;
          for (const s of body) {
            try {
              await env.DB.prepare(
                'INSERT OR IGNORE INTO staff (course,name,created_at) VALUES (?,?,?)'
              ).bind(s.course, s.name, Date.now()).run();
              added++;
            } catch(e) {}
          }
          return json({ success: true, added });
        }
        try {
          await env.DB.prepare(
            'INSERT OR IGNORE INTO staff (course,name,created_at) VALUES (?,?,?)'
          ).bind(body.course, body.name, Date.now()).run();
        } catch(e) { return json({ error: e.message }, 400); }
        return json({ success: true });
      }

      if (request.method === 'DELETE' && path.startsWith('/api/staff/')) {
        await env.DB.prepare('DELETE FROM staff WHERE id=?').bind(path.split('/')[3]).run();
        return json({ success: true });
      }

      return json({ error: 'Not found' }, 404);
    } catch(e) {
      return json({ error: e.message }, 500);
    }
  }
};
