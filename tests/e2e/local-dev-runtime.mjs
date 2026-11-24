import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import path from 'node:path';

/** Only Wrangler's serialized proxy transport disconnect; never application/build errors. */
export function isProxyTransportDisconnect(event) {
  if (event?.type !== 'error' || event.source !== 'ProxyController' || event.reason !== 'Error inside ProxyWorker') return false;
  const error = event.cause?.cause;
  return event.cause instanceof Error && event.cause.message === '' &&
    error?.name === 'Error' && error.message === 'Network connection lost.' &&
    error.stack === 'Error: Network connection lost.';
}

/** Same Wrangler config/bundler/local bindings as CLI, without CLI's fatal disconnect policy. */
export async function startLocalDevRuntime({ config, persistence, port, origin, assets, cleanup }) {
  const { unstable_DevEnv } = await import('wrangler');
  const environment = new unstable_DevEnv();
  let stopping = false;
  let shutdownPromise;
  let server;
  async function shutdown(code) {
    if (shutdownPromise) return shutdownPromise;
    stopping = true;
    shutdownPromise = (async () => {
      try {
        if (server) {
          server.closeAllConnections();
          await new Promise(resolve => server.close(resolve));
        }
        await environment.teardown();
      }
      catch (error) { console.error('[e2e-runtime-api] teardown failed', error); code = 1; }
      finally { cleanup(); process.exit(code); }
    })();
    return shutdownPromise;
  }
  // Attach before config/bundling/runtime startup; unknown errors always fail closed.
  environment.on('error', event => {
    if (!stopping && isProxyTransportDisconnect(event)) {
      console.warn('[e2e-runtime-api] Failed request: Wrangler proxy transport disconnected; no request retry or server restart.');
      return;
    }
    if (!stopping) {
      console.error('[e2e-runtime-api] fatal controller error', event?.source, event?.reason, event?.cause);
      void shutdown(1);
    }
  });
  environment.on('buildFailed', event => {
    if (!stopping) {
      console.error('[e2e-runtime-api] build failed', event?.cause);
      void shutdown(1);
    }
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void shutdown(0); });
  try {
    const worker = await environment.startWorker({
      config,
      bindings: { APP_ORIGIN: { type: 'plain_text', value: origin } },
      dev: {
        remote: false,
        server: { hostname: '127.0.0.1', port: 0 },
        persist: persistence,
        liveReload: false,
        logLevel: 'warn',
      },
    });
    await worker.ready;
    const upstream = await worker.url;
    // Hundreds of simultaneous immutable imports were disconnecting Wrangler's
    // dev proxy on Windows. Serve those exact build files from disk.
    server = createServer(async (incoming, outgoing) => {
      const url = new URL(incoming.url ?? '/', origin);
      const type = { '.js': 'text/javascript', '.css': 'text/css' }[path.extname(url.pathname)];
      if (type && /^\/_app\/immutable\/(?:[\w-]+\/)*[\w.-]+\.(js|css)$/u.test(url.pathname)
          && (incoming.method === 'GET' || incoming.method === 'HEAD')) {
        const file = path.join(assets, url.pathname);
        const info = await stat(file).catch(() => null);
        if (info?.isFile()) {
          outgoing.writeHead(200, { 'content-type': type, 'content-length': info.size });
          if (incoming.method === 'HEAD') outgoing.end();
          else {
            const stream = createReadStream(file);
            stream.on('error', error => outgoing.destroy(error));
            outgoing.on('close', () => stream.destroy());
            stream.pipe(outgoing);
          }
          return;
        }
      }
      const proxied = request(upstream, {
        path: url.pathname + url.search, method: incoming.method, headers: incoming.headers,
      }, response => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers);
        response.on('error', error => outgoing.destroy(error));
        response.pipe(outgoing);
      });
      proxied.on('error', error => outgoing.destroy(error));
      outgoing.on('close', () => {
        if (!outgoing.writableFinished) proxied.destroy();
      });
      incoming.pipe(proxied);
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
    console.log(`[e2e-runtime-api] Ready at ${origin}; fresh local persistence, canonical Wrangler config.`);
    return { worker, shutdown };
  } catch (error) {
    console.error('[e2e-runtime-api] startup failed', error);
    await shutdown(1);
  }
}

