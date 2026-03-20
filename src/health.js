const http = require('http');

function startHealthServer(port) {
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', ts: Date.now() }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(port, () => {
    console.log(`Health endpoint: http://localhost:${port}/health`);
  });
  return server;
}

module.exports = { startHealthServer };
