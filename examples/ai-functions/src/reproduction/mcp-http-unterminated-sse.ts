import http from 'node:http';
import type { Socket } from 'node:net';
import { createMCPClient } from '@ai-sdk/mcp';

const initializeResponseBody =
  'data: {"jsonrpc":"2.0","id":0,"result":{"protocolVersion":"2025-11-25","capabilities":{},"serverInfo":{"name":"test-server","version":"1.0.0"}}}\n';

async function readRequestBody(request: http.IncomingMessage): Promise<string> {
  let body = '';

  for await (const chunk of request) {
    body += chunk;
  }

  return body;
}

async function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);

      const address = server.address();
      if (address == null || typeof address === 'string') {
        reject(new Error('Server did not listen on a TCP port'));
        return;
      }

      resolve(address.port);
    });
  });
}

async function closeServer({
  server,
  sockets,
}: {
  server: http.Server;
  sockets: Set<Socket>;
}): Promise<void> {
  for (const socket of sockets) {
    socket.destroy();
  }

  await new Promise<void>(resolve => {
    server.close(() => resolve());
  });
}

async function main() {
  const sockets = new Set<Socket>();

  const server = http.createServer(async (request, response) => {
    if (request.method === 'GET') {
      response.writeHead(405);
      response.end();
      return;
    }

    if (request.method !== 'POST') {
      response.writeHead(404);
      response.end();
      return;
    }

    const requestBody = await readRequestBody(request);

    if (requestBody.includes('notifications/initialized')) {
      response.writeHead(202);
      response.end();
      return;
    }

    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    response.write(initializeResponseBody);
  });

  server.on('connection', socket => {
    sockets.add(socket);
    socket.on('close', () => {
      sockets.delete(socket);
    });
  });

  const port = await listen(server);
  const clientPromise = createMCPClient({
    transport: {
      type: 'http',
      url: `http://127.0.0.1:${port}`,
    },
  });
  void clientPromise.catch(() => undefined);

  try {
    const client = await Promise.race([
      clientPromise,
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              'createMCPClient timed out waiting for an unterminated SSE frame',
            ),
          );
        }, 5000);
      }),
    ]);

    await client.close();
    console.log('success: createMCPClient completed initialize');
  } finally {
    await closeServer({ server, sockets });
  }
}

main().catch(error => {
  console.error('failed:', error);
  process.exitCode = 1;
});
