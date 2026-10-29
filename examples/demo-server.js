import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT harus berupa bilangan bulat 1–65535.');
  process.exit(2);
}

const server = createServer(async (request, response) => {
  const send = (status, data) => {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(data));
  };
  const path = new URL(request.url, 'http://localhost').pathname;
  if (request.method === 'GET' && path === '/health') return send(200, { status: 'ok' });
  if (request.method === 'GET' && path === '/users') return send(200, { users: [{ id: 1, name: 'Alfath' }], total: 1 });
  if (request.method === 'POST' && path === '/echo') {
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 65536) { send(413, { error: 'Body terlalu besar' }); request.resume(); return; }
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      return send(201, { received: body });
    } catch { if (!response.headersSent) return send(400, { error: 'JSON tidak valid' }); }
    return;
  }
  send(404, { error: 'Rute tidak ditemukan' });
});
server.requestTimeout = 5000;
server.on('error', error => { console.error(`Server gagal dijalankan (${error.code}).`); process.exitCode = 2; });
server.listen(port, '127.0.0.1', () => console.log(`API demo aktif: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(); server.closeAllConnections(); });
