import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';

const host = '0.0.0.0';
const port = Number(process.env.PORT || '4173');
const root = join(process.cwd(), 'dist');

function isValidUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const rawBackendUrl = process.env.GITNEXUS_BACKEND_URL ?? null;
if (rawBackendUrl && !isValidUrl(rawBackendUrl)) {
  console.warn(
    `[gitnexus-web] GITNEXUS_BACKEND_URL "${rawBackendUrl}" is not a valid http/https URL — ignoring.`,
  );
}
const backendUrl = rawBackendUrl && isValidUrl(rawBackendUrl) ? rawBackendUrl : null;
const configScript = backendUrl
  ? `<script>window.__GITNEXUS_CONFIG__=${JSON.stringify({ backendUrl })};</script>`
  : '';

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function resolvePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const cleanPath = normalize(decoded.replace(/^\/+/, ''));
  const candidate = join(root, cleanPath);
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;
  return candidate;
}

const server = createServer(async (req, res) => {
  const requestPath = req.url?.split('?')[0] || '/';
  let filePath = resolvePath(requestPath);

  if (!filePath) {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }

  try {
    const fileStat = await stat(filePath).catch(() => null);
    if (fileStat?.isDirectory()) {
      filePath = join(filePath, 'index.html');
    } else if (!fileStat?.isFile()) {
      filePath = join(root, 'index.html');
    }

    const finalStat = await stat(filePath).catch(() => null);
    if (!finalStat?.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const isHtml = extname(filePath) === '.html' || !extname(filePath);
    const cacheControl = filePath.includes('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'no-cache';
    const contentType = contentTypes[extname(filePath)] || 'application/octet-stream';

    if (isHtml && configScript) {
      const raw = await readFile(filePath, 'utf8');
      if (!raw.includes('</head>')) {
        console.warn('[gitnexus-web] Could not inject config: no </head> tag found in HTML');
      }
      const html = raw.includes('</head>') ? raw.replace('</head>', `${configScript}</head>`) : raw;
      const buf = Buffer.from(html, 'utf8');
      res.writeHead(200, {
        'Cache-Control': cacheControl,
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': buf.length,
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      });
      res.end(buf);
    } else {
      res.writeHead(200, {
        'Cache-Control': cacheControl,
        'Content-Type': contentType,
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      });
      const stream = createReadStream(filePath);
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    }
  } catch (error) {
    res.writeHead(500);
    res.end(error instanceof Error ? error.message : 'Internal server error');
  }
});

server.listen(port, host, () => {
  console.log(`gitnexus-web listening on http://${host}:${port}`);
});
