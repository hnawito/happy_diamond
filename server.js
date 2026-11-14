import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialCatalog } from './catalog.js';
import { createCustomers } from './customers.server.js';
import { localImagePath, receiveProductImage, serveProductImage } from './images.server.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const production = process.argv.includes('--production');
const defaultHash = '7d3fa8e317a86149f71bec0f37053f0448715d600acf1522d8aba20c0cb5475e';
const text = (v, max, required = true) => typeof v === 'string' && v.length <= max && (!required || v.trim().length > 0);
export function validateCatalog(data) {
  if (!data || !Array.isArray(data.categories) || data.categories.length > 100 || !Array.isArray(data.products) || data.products.length > 2000) throw new Error('Invalid catalog.');
  const categories = data.categories.map(c => { if (!text(c, 80) || c.trim() === 'All') throw new Error('Category names must be 1–80 characters and cannot be All.'); return c.trim(); });
  if (new Set(categories.map(c => c.toLowerCase())).size !== categories.length) throw new Error('Category names must be unique.');
  const categoryTranslations = {};
  for (const category of categories) {
    const value = data.categoryTranslations?.[category] ?? initialCatalog.categoryTranslations?.[category] ?? '';
    if (!text(value, 80, false)) throw new Error('Arabic category names must be at most 80 characters.');
    categoryTranslations[category] = value.trim();
  }
  const ids = new Set();
  const products = data.products.map(p => {
    if (!p || !Number.isSafeInteger(p.id) || p.id < 1 || ids.has(p.id)) throw new Error('Each product needs a unique positive numeric ID.');
    ids.add(p.id);
    if (!text(p.name, 160) || !text(p.material, 250, false) || !text(p.tag, 60, false) || !categories.includes(p.category)) throw new Error('Check the product name, category, material and label.');
    if (typeof p.price !== 'number' || !Number.isFinite(p.price) || p.price < 0 || p.price > 100000000 || Math.abs(p.price * 100 - Math.round(p.price * 100)) > 0.0001) throw new Error('Prices must be between 0 and 100,000,000 with at most two decimal places.');
    for (const [field,limit] of [['nameAr',160],['materialAr',250],['tagAr',60]]) if (p[field] !== undefined && !text(p[field],limit,false)) throw new Error('Invalid Arabic product text.');
    const images = p.images === undefined ? [p.image] : p.images;
    if (!Array.isArray(images) || images.length < 1 || images.length > 8 || images.some(image => !text(image, 2048) || !(localImagePath(image) || /^photo-[a-zA-Z0-9-]+$/.test(image) || (() => { try { return new URL(image).protocol === 'https:'; } catch { return false; } })()))) throw new Error('Choose 1–8 product images.');
    if (p.image !== images[0]) throw new Error('The main image must be the first product image.');
    return { nameAr: (p.nameAr || '').trim(), materialAr: (p.materialAr || '').trim(), tagAr: (p.tagAr || '').trim(), id: p.id, name: p.name.trim(), category: p.category, material: p.material.trim(), price: p.price, image: images[0], images: [...new Set(images)], tag: p.tag.trim() };
  });
  return { categories, categoryTranslations, products };
}

export async function createApp({ dataFile = process.env.CATALOG_FILE || path.join(root, 'data', 'catalog.json'), passwordHash = process.env.ADMIN_PASSWORD_SHA256 || defaultHash, secureCookies = process.env.COOKIE_SECURE === 'true', fallback, mailer, imageDirectory = process.env.PRODUCT_IMAGE_DIR || path.join(root, 'uploads', 'products') } = {}) {
  if (!/^[a-f0-9]{64}$/i.test(passwordHash)) throw new Error('ADMIN_PASSWORD_SHA256 must be a SHA-256 hex digest.');
  let catalog;
  try { catalog = validateCatalog(JSON.parse(await readFile(dataFile, 'utf8'))); }
  catch (err) { if (err.code !== 'ENOENT') throw err; catalog = structuredClone(initialCatalog); }
  let revision = 1;
  const sessions = new Map(), attempts = new Map();
  const customers = await createCustomers({ directory: path.dirname(dataFile), initialAdminHash: passwordHash, secureCookies, mailer, invalidateAdmins: () => sessions.clear() });
  const cleanup = setInterval(() => { const now = Date.now(); for (const [k,v] of sessions) if (v < now) sessions.delete(k); for (const [k,v] of attempts) if (v.until < now) attempts.delete(k); }, 60000);
  cleanup.unref();
  const send = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data)); };
  async function body(req) { let size = 0, chunks = []; for await (const chunk of req) { size += chunk.length; if (size > 2_000_000) throw new Error('Request is too large.'); chunks.push(chunk); } return JSON.parse(Buffer.concat(chunks).toString()); }
  let saving = false;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/uploads/')) return serveProductImage(req, res, url.pathname, imageDirectory);
    if (!url.pathname.startsWith('/api/')) return fallback ? fallback(req, res) : send(res, 404, { error: 'Not found.' });
    try {
      if (!['GET', 'HEAD'].includes(req.method)) {
        // JSON plus same-origin checks block cross-site form requests and CSRF.
        const imageUpload = req.method === 'POST' && url.pathname === '/api/admin/images';
        if (imageUpload ? !['image/jpeg','image/png','image/webp'].includes(req.headers['content-type']?.split(';')[0]) : !req.headers['content-type']?.startsWith('application/json')) return send(res, 415, { error: imageUpload ? 'Choose a JPEG, PNG, or WebP image.' : 'JSON required.' });
        if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)) return send(res, 403, { error: 'Request origin is not allowed.' });
      }
      const token = /(?:^|;\s*)hd_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
      const authenticated = token && sessions.get(token) > Date.now();
      if (req.method === 'GET' && url.pathname === '/api/catalog') return send(res, 200, { ...catalog, revision });
      if (req.method === 'GET' && url.pathname === '/api/admin/session') return send(res, 200, { authenticated: Boolean(authenticated) });
      if (req.method === 'POST' && url.pathname === '/api/admin/login') {
        const ip = req.socket.remoteAddress;
        const attempt = attempts.get(ip);
        if (attempt && attempt.until > Date.now() && attempt.count >= 5) return send(res, 429, { error: 'Too many attempts. Please try again in 15 minutes.' });
        const data = await body(req);
        if (!await customers.verifyAdmin(data.password)) {
          attempts.set(ip, { count: attempt && attempt.until > Date.now() ? attempt.count + 1 : 1, until: attempt && attempt.until > Date.now() ? attempt.until : Date.now() + 900000 });
          return send(res, 401, { error: 'Incorrect password.' });
        }
        attempts.delete(ip);
        if (token) sessions.delete(token);
        const next = randomBytes(32).toString('hex'); sessions.set(next, Date.now() + 8 * 3600000);
        res.setHeader('Set-Cookie', `hd_session=${next}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=28800${secureCookies ? '; Secure' : ''}`);
        return send(res, 200, { authenticated: true });
      }
      if (await customers.handle({ req, res, url, authenticated, send, body, catalog })) return;
      if (!authenticated) return send(res, 401, { error: 'Please sign in to continue.' });
      if (req.method === 'POST' && url.pathname === '/api/admin/images') {
        const image = await receiveProductImage(req, imageDirectory);
        return send(res, 201, { image });
      }
      if (req.method === 'POST' && url.pathname === '/api/admin/logout') {
        sessions.delete(token); res.setHeader('Set-Cookie', 'hd_session=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0'); return send(res, 200, { ok: true });
      }
      if (req.method === 'PUT' && url.pathname === '/api/admin/catalog') {
        const data = await body(req);
        if (saving || data.revision !== revision) return send(res, 409, { error: 'The catalog changed in another session. Reload the dashboard before saving again.' });
        const next = validateCatalog(data);
        for (const product of next.products) for (const image of product.images) if (localImagePath(image)) {
          try { await readFile(path.join(imageDirectory, image.split('/').pop())); }
          catch { return send(res, 400, { error: 'An image is missing. Upload it again before saving.' }); }
        }
        if (saving || data.revision !== revision) return send(res, 409, { error: 'The catalog changed in another session. Reload the dashboard before saving again.' });
        saving = true;
        try { await mkdir(path.dirname(dataFile), { recursive: true }); await writeFile(`${dataFile}.tmp`, JSON.stringify(next, null, 2)); await rename(`${dataFile}.tmp`, dataFile); catalog = next; revision++; }
        finally { saving = false; }
        return send(res, 200, { ...catalog, revision });
      }
      send(res, 404, { error: 'Not found.' });
    } catch (err) { send(res, err.status || (err.code ? 500 : 400), { error: err.code ? 'Unable to save changes. Please try again.' : err.message }); }
  });
  server.on('close', () => { clearInterval(cleanup); customers.close(); });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let fallback;
  if (!production) {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'mpa' });
    fallback = (req, res) => vite.middlewares(req, res, () => { res.writeHead(404); res.end('Not found'); });
  } else {
    const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
    fallback = async (req, res) => {
      let pathname;
      try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); return res.end(); }
      if (pathname === '/admin' || pathname === '/admin/') pathname = '/admin.html';
      if (pathname === '/') pathname = '/index.html';
      const target = path.resolve(root, 'dist', `.${pathname}`);
      if (!target.startsWith(path.join(root, 'dist') + path.sep)) { res.writeHead(403); return res.end(); }
      try { const data = await readFile(target); res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' }); res.end(data); }
      catch { res.writeHead(404); res.end('Not found'); }
    };
  }
  const server = await createApp({ fallback });
  const port = Number(process.env.PORT || 5173);
  server.listen(port, '0.0.0.0', () => console.log(`Happy Diamond: http://localhost:${port} · Admin: http://localhost:${port}/admin.html`));
}
