const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ---------- Configuration ----------
const GRID_W = 300;
const GRID_H = 100;
const PRICE_PER_PIXEL = 1; // en euros
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'pixels.json');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123';
const ADMIN_SESSION_TTL = 12 * 60 * 60 * 1000; // 12h

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || '';
const PAYPAL_ENV = process.env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox';
const PAYPAL_API_BASE = PAYPAL_ENV === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

if (ADMIN_PASSWORD === 'changeme123') {
  console.warn('[avertissement] ADMIN_PASSWORD non defini : mot de passe admin par defaut utilise. A changer sur Render (Environment Variables).');
}
if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
  console.warn('[avertissement] PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET non definis : les paiements PayPal echoueront.');
}

// ---------- État en mémoire, persisté sur disque ----------
let pixels = {}; // clé "x,y" -> couleur hex
let totalRevenue = 0; // cumul des paiements PayPal reussis, en euros

if (fs.existsSync(DATA_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    pixels = saved.pixels || saved; // compatibilite avec l'ancien format (pixels seuls)
    totalRevenue = saved.totalRevenue || 0;
    console.log(`[init] ${Object.keys(pixels).length} pixels charges, revenu cumule ${totalRevenue}EUR`);
  } catch (err) {
    console.error('[init] pixels.json illisible, on repart de zero:', err.message);
  }
}

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    fs.writeFile(DATA_FILE, JSON.stringify({ pixels, totalRevenue }), (err) => {
      if (err) console.error('[save] echec de sauvegarde:', err.message);
    });
    saveTimer = null;
  }, 1000);
}

// ---------- Sessions admin (en mémoire) ----------
const adminSessions = new Map(); // token -> expiration (timestamp)

function isValidAdminToken(token) {
  if (!token) return false;
  const expiry = adminSessions.get(token);
  if (!expiry) return false;
  if (Date.now() > expiry) { adminSessions.delete(token); return false; }
  return true;
}

function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!isValidAdminToken(token)) return res.status(401).json({ error: 'Non autorise' });
  next();
}

// ---------- PayPal : commandes réelles via l'API REST ----------
async function getPaypalAccessToken() {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error('Echec authentification PayPal (' + res.status + ')');
  const data = await res.json();
  return data.access_token;
}

const capturedOrders = new Set(); // orderID payes, pas encore utilises pour poser un pixel

// ---------- Serveur HTTP + fichiers statiques ----------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/config', (req, res) => {
  res.json({
    paypalClientId: PAYPAL_CLIENT_ID,
    pricePerPixel: PRICE_PER_PIXEL,
    currency: 'EUR',
  });
});

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  adminSessions.set(token, Date.now() + ADMIN_SESSION_TTL);
  res.json({ token });
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  res.json({
    totalPixels: Object.keys(pixels).length,
    totalRevenue,
    gridW: GRID_W,
    gridH: GRID_H,
    price: PRICE_PER_PIXEL,
  });
});

app.post('/api/paypal/create-order', async (req, res) => {
  try {
    const accessToken = await getPaypalAccessToken();
    const order = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{ amount: { currency_code: 'EUR', value: PRICE_PER_PIXEL.toFixed(2) } }],
      }),
    });
    const data = await order.json();
    if (!order.ok) throw new Error(JSON.stringify(data));
    res.json({ orderID: data.id });
  } catch (err) {
    console.error('[paypal] create-order:', err.message);
    res.status(500).json({ error: 'Erreur creation commande PayPal' });
  }
});

app.post('/api/paypal/capture-order', async (req, res) => {
  const { orderID } = req.body || {};
  if (!orderID) return res.status(400).json({ error: 'orderID manquant' });
  try {
    const accessToken = await getPaypalAccessToken();
    const capture = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const data = await capture.json();
    if (data.status === 'COMPLETED') {
      capturedOrders.add(orderID);
      totalRevenue += PRICE_PER_PIXEL;
      scheduleSave();
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'Paiement non complete', detail: data });
    }
  } catch (err) {
    console.error('[paypal] capture-order:', err.message);
    res.status(500).json({ error: 'Erreur capture PayPal' });
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

wss.on('connection', (ws) => {
  console.log(`[ws] client connecte (${wss.clients.size} au total)`);

  ws.send(JSON.stringify({
    type: 'init',
    gridW: GRID_W,
    gridH: GRID_H,
    pricePerPixel: PRICE_PER_PIXEL,
    pixels,
  }));

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'place') {
      const { x, y, color, orderID, adminToken } = msg;
      if (!Number.isInteger(x) || !Number.isInteger(y)) return;
      if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return;
      if (typeof color !== 'string' || !HEX_RE.test(color)) return;

      const isAdmin = isValidAdminToken(adminToken);
      if (!isAdmin) {
        // utilisateur normal : le paiement PayPal doit avoir ete capture avant
        if (!orderID || !capturedOrders.has(orderID)) return;
        capturedOrders.delete(orderID); // usage unique, evite de reutiliser le meme paiement
      }

      pixels[`${x},${y}`] = color;
      scheduleSave();
      broadcast({ type: 'place', x, y, color });
    }
  });

  ws.on('close', () => {
    console.log(`[ws] client deconnecte (${wss.clients.size} restants)`);
  });
});

server.listen(PORT, () => {
  console.log(`Pixel War server pret sur http://localhost:${PORT}`);
  console.log(`Grille : ${GRID_W}x${GRID_H} — ${PRICE_PER_PIXEL}EUR/pixel — PayPal: ${PAYPAL_ENV}`);
});
