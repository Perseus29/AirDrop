// Simple WebSocket signaling server for peer discovery
// Install: npm install ws
// Run: node server.js

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 8080;

// Get local IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Create HTTP server to serve the web app
const server = http.createServer((req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, filePath);
  
  const extname = path.extname(filePath);
  const contentType = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css'
  }[extname] || 'text/plain';
  
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File not found. Make sure index.html is in the same directory as server.js');
      } else {
        res.writeHead(500);
        res.end('Server error: ' + err.code);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

// WebSocket server for signaling
const wss = new WebSocket.Server({ server });

const peers = new Map(); // id -> {ws, name}

wss.on('connection', (ws) => {
  let peerId = null;
  
  console.log('New connection established');
  
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      
      switch (msg.type) {
        case 'register':
          peerId = msg.id;
          peers.set(peerId, { ws, name: msg.name });
          console.log(`✓ Peer registered: ${msg.name} (${peerId})`);
          console.log(`  Total peers: ${peers.size}`);
          
          // Send current peer list
          broadcastPeerList();
          break;
          
        case 'signal':
          // Forward signaling data to target peer
          const target = peers.get(msg.target);
          if (target && target.ws.readyState === WebSocket.OPEN) {
            target.ws.send(JSON.stringify({
              type: 'signal',
              from: peerId,
              data: msg.data
            }));
          } else {
            console.warn(`Cannot forward signal: target ${msg.target} not found or not connected`);
          }
          break;
          
        default:
          console.warn(`Unknown message type: ${msg.type}`);
      }
    } catch (e) {
      console.error('Error processing message:', e.message);
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error.message);
  });
  
  ws.on('close', () => {
    if (peerId) {
      peers.delete(peerId);
      console.log(`✗ Peer disconnected: ${peerId}`);
      console.log(`  Total peers: ${peers.size}`);
      broadcastPeerList();
    }
  });
});

function broadcastPeerList() {
  const peerList = Array.from(peers.entries()).map(([id, info]) => ({
    id,
    name: info.name
  }));
  
  const message = JSON.stringify({
    type: 'peers',
    peers: peerList
  });
  
  peers.forEach(({ ws }, id) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    } else {
      console.warn(`Peer ${id} connection not open, removing...`);
      peers.delete(id);
    }
  });
}

server.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log('\n═══════════════════════════════════════════════════');
  console.log('🚀 P2P File Sharing Server Started');
  console.log('═══════════════════════════════════════════════════');
  console.log(`\n📡 Server running on port ${PORT}`);
  console.log(`\n🌐 Access from:`);
  console.log(`   This computer:  http://localhost:${PORT}`);
  console.log(`   Local network:  http://${localIP}:${PORT}`);
  console.log('\n💡 Share the local network URL with other devices');
  console.log('   on the same Wi-Fi/LAN to start transferring files\n');
  console.log('═══════════════════════════════════════════════════\n');
});