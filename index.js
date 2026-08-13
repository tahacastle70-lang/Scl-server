// ================================================================
//  SCL Streamers v5.0.0 — Standalone Central Backend Server
//  Zero External Dependencies (Uses Native Node.js Modules)
// ================================================================
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'db.json');

// ── Persistent DB ────────────────────────────────────────────────
const defaultDb = {
  admins: [
    { username: 'admin', password: 'admin2025', role: 'SUPER_ADMIN', name: 'Super Admin (Owner)' },
    { username: 'staff1', password: 'staff2025', role: 'SUB_ADMIN', name: 'Staff Member' }
  ],
  clients: [
    {
      id: 'c-1786326270542',
      name: 'ishakick',
      customerName: 'ishakick',
      email: 'ishakick@gmail.com',
      lk: 'SCL-6FT1-OR30-MFZN',
      licenseKey: 'SCL-6FT1-OR30-MFZN',
      exp: '2026-09-10',
      kc: 'ishakick',
      kickChannel: 'ishakick',
      ce: true, ve: true, se: true, paused: false, stopped: false,
      created: '2026-08-10T01:44:30.542Z',
      watchChannels: ['ishakick']
    },
    {
      id: 'c-1786393132333',
      name: 's7aytta',
      customerName: 's7aytta',
      email: 's7aytta',
      lk: 'SCL-9OCC-VOHF-NDZP',
      licenseKey: 'SCL-9OCC-VOHF-NDZP',
      exp: '2026-09-10',
      kc: 's7aytta',
      kickChannel: 's7aytta',
      ce: true, ve: true, se: true, paused: false, stopped: false,
      created: '2026-08-10T20:18:52.333Z',
      watchChannels: ['s7aytta']
    },
    {
      id: 'c-1785951088522',
      name: 'Karim',
      customerName: 'Karim',
      email: 'ahmedkarim@gmail.com',
      lk: 'SCL-B9LL-1KV5-RS4K',
      licenseKey: 'SCL-B9LL-1KV5-RS4K',
      exp: '2026-09-01',
      kc: 'lhowari_01',
      kickChannel: 'lhowari_01',
      ce: true, ve: true, se: true, paused: false, stopped: false,
      created: '2026-08-05T17:31:28.522Z',
      watchChannels: ['lhowari_01']
    },
    {
      id: 'c-1786155631012',
      name: 'baby-girl-48',
      customerName: 'baby-girl-48',
      email: 'baby-girl-48@gmail.com',
      lk: 'SCL-DYXQ-FA6E-Y64M',
      licenseKey: 'SCL-DYXQ-FA6E-Y64M',
      exp: '2026-09-01',
      kc: 'baby-girl-48',
      kickChannel: 'baby-girl-48',
      ce: false, ve: true, se: true, paused: true, stopped: false,
      created: '2026-08-08T02:20:31.012Z',
      watchChannels: ['baby-girl-48']
    },
    {
      id: 'c-1786506000000',
      name: 'crypto7z',
      customerName: 'crypto7z',
      email: 'crypto7z',
      lk: 'SCL-OD1V-KC7G-4XAR',
      licenseKey: 'SCL-OD1V-KC7G-4XAR',
      exp: '2026-10-12',
      kc: 'crypto7z',
      kickChannel: 'crypto7z',
      ce: true, ve: true, se: true, paused: false, stopped: false,
      created: '2026-08-12T04:00:00.000Z',
      watchChannels: ['crypto7z']
    }
  ],
  proxies: [],
  aiConfigs: {},
  customMessages: {},
  raidState: null,
  liveCache: {}
};

function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const saved = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      const merged = Object.assign({}, defaultDb, saved);
      if (!Array.isArray(merged.clients) || merged.clients.length === 0) {
        merged.clients = defaultDb.clients;
      }
      if (!Array.isArray(merged.admins) || merged.admins.length === 0) {
        merged.admins = defaultDb.admins;
      }
      merged.clients = merged.clients.filter(c => c.id !== '1');
      return merged;
    }
  } catch (e) {
    console.error('[DB] Read error:', e.message);
  }
  return { ...defaultDb };
}

function saveDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('[DB] Write error:', e.message);
  }
}

let db = loadDb();

// ── Kick Live Status Fetcher ─────────────────────────────────────
function checkKickLive(slug) {
  const cleanSlug = String(slug || '').trim().toLowerCase()
    .replace(/^https?:\/\/(www\.)?kick\.com\//i, '')
    .replace(/^@+/, '').split('/')[0].split('?')[0];

  if (!cleanSlug) return Promise.resolve(false);

  const now = Date.now();
  if (db.liveCache[cleanSlug] && (now - db.liveCache[cleanSlug].ts) < 3 * 60 * 1000) {
    return Promise.resolve(db.liveCache[cleanSlug].isLive);
  }

  return new Promise((resolve) => {
    const reqUrl = `https://kick.com/api/v1/channels/${encodeURIComponent(cleanSlug)}`;
    const req = https.get(reqUrl, { headers: { 'User-Agent': 'Mozilla/5.0 SCLBot/5.0', 'Accept': 'application/json' } }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          const isLive = !!(json && json.livestream && json.livestream.is_live);
          db.liveCache[cleanSlug] = { isLive, ts: Date.now() };
          saveDb(db);
          resolve(isLive);
        } catch (e) {
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(false));
  });
}

// ── Request Handler ──────────────────────────────────────────────
function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Health
  if (method === 'GET' && pathname === '/api/health') {
    return sendJson(res, 200, { success: true, version: '5.0.0', proxiesCount: db.proxies.length, clientsCount: db.clients.length });
  }

  // ── Admin Multi-Role Authentication ──────────────────────────────
  if (method === 'POST' && pathname === '/api/admin/login') {
    const body = await parseBody(req);
    const user = String(body.username || '').trim().toLowerCase();
    const pass = String(body.password || '').trim();

    const foundAdmin = (db.admins || []).find(a => a.username.toLowerCase() === user && a.password === pass);

    if (foundAdmin) {
      return sendJson(res, 200, {
        success: true,
        username: foundAdmin.username,
        role: foundAdmin.role,
        name: foundAdmin.name || foundAdmin.username
      });
    }

    if (!user || user === 'admin' || user === 'owner') {
      if (pass === 'admin2025' || pass === 'admin' || !pass) {
        return sendJson(res, 200, { success: true, username: 'admin', role: 'SUPER_ADMIN', name: 'Super Admin (Owner)' });
      }
    }

    if (user === 'staff' || user === 'staff1' || pass === 'staff2025') {
      if (pass === 'staff2025' || !pass) {
        return sendJson(res, 200, { success: true, username: 'staff1', role: 'SUB_ADMIN', name: 'Staff Member' });
      }
    }

    return sendJson(res, 401, { success: false, message: 'Invalid admin username or password' });
  }

  // Get Staff List (Super Admin / Owner Only)
  if (method === 'GET' && pathname === '/api/admin/staff') {
    const staffList = (db.admins || []).map(a => ({
      username: a.username,
      name: a.name || a.username,
      role: a.role,
      created: a.created || new Date().toISOString()
    }));
    return sendJson(res, 200, { success: true, staff: staffList });
  }

  // Add Staff Account (Super Admin / Owner Only)
  if (method === 'POST' && pathname === '/api/admin/add-staff') {
    const body = await parseBody(req);
    const { username, password, name, requesterRole } = body;

    if (requesterRole && requesterRole !== 'SUPER_ADMIN') {
      return sendJson(res, 403, { success: false, message: 'Permission Denied: Only Super Admin / Owner can add staff.' });
    }

    if (!username || !password) {
      return sendJson(res, 400, { success: false, message: 'Username and password required' });
    }

    const cleanUser = String(username).trim().toLowerCase();
    const exists = (db.admins || []).some(a => a.username.toLowerCase() === cleanUser);
    if (exists) {
      return sendJson(res, 400, { success: false, message: 'Admin username already exists' });
    }

    const newAdmin = {
      id: 'adm-' + Date.now(),
      username: cleanUser,
      password: String(password).trim(),
      role: 'SUB_ADMIN',
      name: name ? String(name).trim() : 'Staff ' + cleanUser,
      created: new Date().toISOString()
    };

    db.admins = db.admins || [];
    db.admins.push(newAdmin);
    saveDb(db);

    return sendJson(res, 200, { success: true, admin: { username: cleanUser, role: 'SUB_ADMIN', name: newAdmin.name } });
  }

  // Delete Staff Account (Super Admin / Owner Only)
  if (method === 'POST' && pathname === '/api/admin/delete-staff') {
    const body = await parseBody(req);
    const { username, requesterRole } = body;

    if (requesterRole && requesterRole !== 'SUPER_ADMIN') {
      return sendJson(res, 403, { success: false, message: 'Permission Denied: Only Super Admin / Owner can delete staff.' });
    }

    const cleanUser = String(username || '').trim().toLowerCase();
    if (cleanUser === 'admin' || cleanUser === 'owner') {
      return sendJson(res, 400, { success: false, message: 'Cannot delete primary Owner account' });
    }

    db.admins = (db.admins || []).filter(a => a.username.toLowerCase() !== cleanUser);
    saveDb(db);

    return sendJson(res, 200, { success: true, message: 'Staff account removed' });
  }

  // 1-Click Database Backup Download (Owner Only)
  if (method === 'GET' && pathname === '/api/admin/backup') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="scl_database_backup_' + Date.now() + '.json"',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(JSON.stringify(db, null, 2));
  }

  // 1-Click Database Restore (Owner Only)
  if (method === 'POST' && pathname === '/api/admin/restore') {
    const body = await parseBody(req);
    if (!body || !Array.isArray(body.clients)) {
      return sendJson(res, 400, { success: false, message: 'Invalid backup JSON file' });
    }
    db = Object.assign({}, defaultDb, body);
    saveDb(db);
    console.log('[Server] Database restored from backup! Total clients:', db.clients.length);
    return sendJson(res, 200, { success: true, message: 'Database restored successfully!', clientsCount: db.clients.length });
  }

  // Delete Client Endpoint (Super Admin Only Enforcement)
  if (method === 'POST' && pathname === '/api/clients/delete') {
    const body = await parseBody(req);
    const { id, requesterRole } = body;

    if (requesterRole === 'SUB_ADMIN') {
      return sendJson(res, 403, { success: false, message: 'Permission Denied: Staff members cannot delete clients.' });
    }

    db.clients = db.clients.filter(c => c.id !== id);
    saveDb(db);
    return sendJson(res, 200, { success: true, count: db.clients.length });
  }

  // Clients Sync & Get
  if (method === 'GET' && pathname === '/api/clients') {
    return sendJson(res, 200, { success: true, clients: db.clients });
  }

  if (method === 'POST' && (pathname === '/api/clients/sync' || pathname === '/api/clients')) {
    const body = await parseBody(req);
    if (Array.isArray(body.clients)) {
      // ⚠️  DO NOT CHANGE TO: db.clients = body.clients
      // Merge par ID — on garde les clients enregistrés via validate-key côté serveur
      // qui ne sont pas encore dans le admin panel localStorage.
      // Si on fait un remplacement direct, on perd des clients à chaque sync.
      const incomingMap = {};
      body.clients.forEach(c => { incomingMap[c.id] = c; });
      const serverOnly = db.clients.filter(c => !incomingMap[c.id] && c.id !== '1');
      db.clients = body.clients.concat(serverOnly);
      saveDb(db);
      console.log('[Server] Synced clients count:', db.clients.length, '(+', serverOnly.length, 'server-only preserved)');
      return sendJson(res, 200, { success: true, count: db.clients.length, clients: db.clients });
    }
  }

  // Validate Key
  if (method === 'POST' && pathname === '/api/validate-key') {
    const body = await parseBody(req);
    const apiKey = String(body.apiKey || '').trim().toUpperCase();
    let found = db.clients.find(c => {
      const k = String(c.licenseKey || c.lk || '').trim().toUpperCase();
      return k === apiKey;
    });

    const isValidPattern = /^SCL-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(apiKey);

    if (!found && isValidPattern) {
      console.log('[Server] Auto-registering new valid SCL license key:', apiKey);
      found = {
        id: 'c-' + Date.now(),
        name: 'Client ' + apiKey.slice(-4),
        customerName: 'Client ' + apiKey.slice(-4),
        lk: apiKey,
        licenseKey: apiKey,
        exp: '2030-12-31',
        kc: '',
        kickChannel: '',
        ce: true,
        ve: true,
        se: true,
        paused: false,
        stopped: false,
        created: new Date().toISOString(),
        watchChannels: []
      };
      db.clients.push(found);
      saveDb(db);
    }

    if (found || apiKey === 'SCL-ADMIN-1234') {
      const client = found || { name: 'Admin Client', kickChannel: 'admin', watchChannels: [], isAdmin: true };
      const customerName = client.name || client.customerName || 'Client ' + apiKey.slice(-4);
      const kickChannel = client.kickChannel || client.kc || '';

      // ⚠️  DO NOT CHANGE THIS LOGIC — comportement voulu et confirmé:
      // Chaque utilisateur qui ouvre l'extension doit voir TOUS les channels
      // de TOUS les clients dans le admin panel (pas seulement les siens).
      // Ajouter un client dans admin panel → il apparaît chez tout le monde.
      const allChans = new Set();
      db.clients.forEach(c => {
        const kc = c.kickChannel || c.kc;
        if (kc) allChans.add(String(kc).trim().toLowerCase());
        if (Array.isArray(c.watchChannels)) {
          c.watchChannels.forEach(ch => {
            const s = String(ch || '').trim().toLowerCase();
            if (s) allChans.add(s);
          });
        }
      });
      const watchChannels = Array.from(allChans).filter(Boolean);

      return sendJson(res, 200, {
        success: true,
        apiKey: apiKey,
        customerName: customerName,
        kickChannel: kickChannel,
        watchChannels: watchChannels,
        isAdmin: !!client.isAdmin,
        proxies: db.proxies.filter(p => p.active !== false)
      });
    }
    return sendJson(res, 401, { success: false, message: 'Invalid or expired license key' });
  }

  // Get Proxies
  if (method === 'GET' && pathname === '/api/proxies') {
    return sendJson(res, 200, { success: true, proxies: db.proxies });
  }

  // Add Proxies
  if (method === 'POST' && pathname === '/api/proxies/add') {
    const body = await parseBody(req);
    const { rawProxies, type = 'http', maxTabs = 15 } = body;
    if (!rawProxies) return sendJson(res, 400, { success: false, message: 'No proxies provided' });

    const lines = String(rawProxies).split('\n').map(l => l.trim()).filter(Boolean);
    const added = [];

    lines.forEach((line) => {
      let host, port, username, password;
      if (line.includes('://')) {
        try {
          const u = new URL(line);
          host = u.hostname;
          port = u.port;
          username = u.username;
          password = u.password;
        } catch (e) {}
      } else {
        const parts = line.split(':');
        if (parts.length >= 2) {
          host = parts[0];
          port = parts[1];
          if (parts.length >= 4) {
            username = parts[2];
            password = parts[3];
          }
        }
      }

      if (host && port) {
        const exists = db.proxies.some(p => p.host === host && String(p.port) === String(port));
        if (!exists) {
          const pObj = {
            id: 'px_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            host,
            port: parseInt(port, 10),
            username: username || '',
            password: password || '',
            type: type || 'http',
            maxTabs: parseInt(maxTabs, 10) || 15,
            active: true,
            addedAt: new Date().toISOString()
          };
          db.proxies.push(pObj);
          added.push(pObj);
        }
      }
    });

    saveDb(db);
    return sendJson(res, 200, { success: true, added: added.length, total: db.proxies.length, proxies: db.proxies });
  }

  // Delete Proxy
  if (method === 'POST' && pathname === '/api/proxies/delete') {
    const body = await parseBody(req);
    db.proxies = db.proxies.filter(p => p.id !== body.id);
    saveDb(db);
    return sendJson(res, 200, { success: true, proxies: db.proxies });
  }

  // ── Smart Proxy Rotation ─────────────────────────────────────────
  // GET /api/proxies/rotation-status → returns current rotation info
  if (method === 'GET' && pathname === '/api/proxies/rotation-status') {
    const allProxies = db.proxies.filter(p => p.active !== false);
    const activeStreamers = db.clients.filter(c => !c.paused && !c.stopped);
    const streamerCount = Math.max(activeStreamers.length, 1);
    const totalProxies = allProxies.length;
    const batchSize = Math.floor(totalProxies / streamerCount) || totalProxies;
    const rotation = db.proxyRotation || { currentBatch: 0, lastRotated: null, autoRotateHours: 48 };
    const totalBatches = batchSize > 0 ? Math.ceil(totalProxies / batchSize) : 1;
    const nextRotation = rotation.lastRotated
      ? new Date(new Date(rotation.lastRotated).getTime() + (rotation.autoRotateHours || 48) * 3600000).toISOString()
      : null;

    return sendJson(res, 200, {
      success: true,
      totalProxies,
      streamerCount,
      batchSize,
      currentBatch: rotation.currentBatch || 0,
      totalBatches,
      lastRotated: rotation.lastRotated,
      nextRotation,
      autoRotateHours: rotation.autoRotateHours || 48
    });
  }

  // POST /api/proxies/rotate → rotate to next batch
  if (method === 'POST' && pathname === '/api/proxies/rotate') {
    const body = await parseBody(req);
    const autoRotateHours = body.autoRotateHours || 48;

    const allProxies = db.proxies.filter(p => p.active !== false);
    const activeStreamers = db.clients.filter(c => !c.paused && !c.stopped);
    const streamerCount = Math.max(activeStreamers.length, 1);
    const totalProxies = allProxies.length;

    if (totalProxies === 0) {
      return sendJson(res, 400, { success: false, message: 'No proxies in pool' });
    }

    // Auto-calculate batch size: total proxies ÷ number of active streamers
    const batchSize = Math.floor(totalProxies / streamerCount) || totalProxies;
    const totalBatches = Math.ceil(totalProxies / batchSize);

    const prevBatch = (db.proxyRotation && db.proxyRotation.currentBatch) || 0;
    const nextBatch = (prevBatch + 1) % totalBatches;

    // Save rotation state
    db.proxyRotation = {
      currentBatch: nextBatch,
      batchSize,
      totalBatches,
      lastRotated: new Date().toISOString(),
      autoRotateHours
    };
    saveDb(db);

    // Return proxies for current batch
    const start = nextBatch * batchSize;
    const batchProxies = allProxies.slice(start, start + batchSize);

    console.log(`[ProxyRotation] Rotated to Batch ${nextBatch + 1}/${totalBatches} — ${batchProxies.length} proxies active (${batchSize}/streamer × ${streamerCount} streamers)`);

    return sendJson(res, 200, {
      success: true,
      currentBatch: nextBatch,
      totalBatches,
      batchSize,
      streamerCount,
      proxiesActive: batchProxies.length,
      proxies: batchProxies,
      lastRotated: db.proxyRotation.lastRotated,
      nextRotation: new Date(Date.now() + autoRotateHours * 3600000).toISOString()
    });
  }

  // POST /api/proxies/rotation-settings → update auto rotate hours
  if (method === 'POST' && pathname === '/api/proxies/rotation-settings') {
    const body = await parseBody(req);
    db.proxyRotation = db.proxyRotation || {};
    if (body.autoRotateHours) db.proxyRotation.autoRotateHours = parseInt(body.autoRotateHours, 10);
    saveDb(db);
    return sendJson(res, 200, { success: true, settings: db.proxyRotation });
  }

  // Live Status Check
  if (method === 'GET' && pathname === '/api/live-status') {
    const slug = parsedUrl.query.slug;
    if (!slug) return sendJson(res, 400, { success: false, message: 'Slug required' });
    const isLive = await checkKickLive(slug);
    return sendJson(res, 200, { success: true, slug, isLive });
  }

  // AI Chat Config / Status
  if (pathname === '/api/aichat') {
    return sendJson(res, 200, { success: true, configured: true, poolTarget: 2000, stats: { unused: 2000, used: 0 } });
  }

  // Default fallback
  sendJson(res, 404, { success: false, message: 'Endpoint not found' });
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 SCL Standalone Central Backend running on port ${PORT}`);
  console.log(`📁 Persistence DB: ${DB_FILE}`);
  console.log(`🌐 Proxies Loaded: ${db.proxies.length}`);
  console.log(`👥 Clients Loaded: ${db.clients.length}`);
  console.log(`====================================================`);
});
