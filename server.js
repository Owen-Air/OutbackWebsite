const http = require('http');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const port = process.env.PORT || 8080;

const mime = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
  '.wasm': 'application/wasm',
  '.xml': 'application/xml',
  '.webp': 'image/webp'
};

function streamFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const type = mime[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', type);
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => { res.statusCode = 500; res.end('Server error'); });
  stream.pipe(res);
}

http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/index.html';

  const filePath = path.join(root, reqPath);
  const safePath = path.normalize(filePath);
  if (!safePath.startsWith(root)) { res.statusCode = 403; res.end('Forbidden'); return; }

  fs.stat(safePath, (err, stats) => {
    if (err) { res.statusCode = 404; res.end('Not found'); return; }
    if (stats.isDirectory()) {
      const indexFile = path.join(safePath, 'index.html');
      fs.stat(indexFile, (e) => {
        if (e) { res.statusCode = 403; res.end('Directory access denied'); return; }
        streamFile(indexFile, res);
      });
    } else {
      streamFile(safePath, res);
    }
  });
}).listen(port, () => console.log(`Server running at http://localhost:${port}`));
