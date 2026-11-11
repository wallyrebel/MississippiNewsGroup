// Dependency-free local preview of the whole site, including the functions.
// Mirrors the routing in netlify.toml closely enough to check a change before
// pushing:  npm run dev  →  http://127.0.0.1:4174
//
//   /                      → home function (front page with stories pre-rendered)
//                            home.mjs uses Netlify's Request → Response API
//   /index.html            → the raw template (what readers get if home fails)
//   /.netlify/functions/*  → the function handlers
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT) || 4174;
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.geojson': 'application/geo+json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};
const { pathToFileURL } = require('node:url');
const functions = ['rss', 'ads', 'weather-data', 'weather-cameras'];
const homeModule = import(pathToFileURL(path.join(root, 'netlify/functions/home.mjs')).href);
const handlers = Object.fromEntries(
  functions.map((name) => [`/.netlify/functions/${name}`, require(`../netlify/functions/${name}`).handler])
);
// Only these top-level paths are public; never serve .git, node_modules, functions or config.
const PUBLIC = /^\/(?:weather\/|assets\/|content\/|admin\/|thanks\/|index\.html$|404\.html$|styles\.css$|app\.js$|render\.js$|sites\.js$|robots\.txt$|sitemap\.xml$|site\.webmanifest$|favicon\.ico$)/;

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    let pathname = decodeURIComponent(url.pathname);

    if (pathname === '/') {
      const home = (await homeModule).default;
      const response = await home(new Request(url.href, { headers: { host: url.host } }), {});
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
      return;
    }

    const fn = pathname;
    if (handlers[fn]) {
      const result = await handlers[fn]({
        httpMethod: req.method,
        rawUrl: url.href,
        headers: req.headers,
        queryStringParameters: Object.fromEntries(url.searchParams),
      });
      res.writeHead(result.statusCode, result.headers);
      res.end(result.body);
      return;
    }

    if (pathname === '/hiring') { res.writeHead(302, { Location: '/#hiring' }); res.end(); return; }
    if (pathname === '/weather/live' || pathname === '/weather/live/') pathname = '/weather/index.html';
    if (pathname === '/weather' || pathname === '/admin' || pathname === '/thanks') pathname += '/';
    if (pathname.endsWith('/')) pathname += 'index.html';

    const allowed = PUBLIC.test(pathname) && !pathname.split('/').some((p) => p.startsWith('.'));
    const file = path.resolve(root, '.' + pathname);
    if (!allowed || !file.startsWith(root + path.sep)) throw Object.assign(new Error('Not found'), { code: 'ENOENT' });

    const body = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch (error) {
    if (error.code === 'ENOENT') {
      const notFound = await fs.readFile(path.join(root, '404.html')).catch(() => 'Not found');
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(notFound);
    } else {
      console.error(error);
      res.writeHead(500);
      res.end('Server error');
    }
  }
}).listen(port, '127.0.0.1', () => console.log(`Site preview: http://127.0.0.1:${port}`));
