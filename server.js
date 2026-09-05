const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const path = require('path');
const fs = require('fs');

// ---------- Configuration ----------
const GRID_W = 300;
const GRID_H = 100;
const PRICE_PER_PIXEL = 1; // en euros
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'pixels.json');

// ---------- État en mémoire, persisté sur disque ----------
let pixels = {}; // clé "x,y" -> couleur hex
if (fs.existsSync(DATA_FILE)) {
  try {
    pixels = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    console.log(`[init] ${Object.keys(pixels).length} pixels charges depuis pixels.json`);
  } catch (err) {
    console.error('[init] pixels.json illisible, on repart de zero:', err.message);
    pixels = {};
  }
}

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return; // debounce : une seule sauvegarde par seconde max
  saveTimer = setTimeout(() => {
    fs.writeFile(DATA_FILE, JSON.stringify(pixels), (err) => {
      if (err) console.error('[save] echec de sauvegarde:', err.message);
    });
    saveTimer = null;
  }, 1000);
}

// ---------- Serveur HTTP + fichiers statiques ----------
const app = express();
app.use(express.static(path.join(__dirname, 'public')));

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

  // etat initial complet envoye au nouveau venu
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
      const { x, y, color } = msg;
      if (!Number.isInteger(x) || !Number.isInteger(y)) return;
      if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return;
      if (typeof color !== 'string' || !HEX_RE.test(color)) return;

      // --- Ici, dans la vraie version : verifier le paiement Stripe confirme ---
      // --- avant d'accepter le placement (voir /api/webhook prevu a l'etape 2) ---

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
  console.log(`Grille : ${GRID_W}x${GRID_H} — ${PRICE_PER_PIXEL}€/pixel`);
});
