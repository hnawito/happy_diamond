import sharp from 'sharp';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const localImagePath = value => typeof value === 'string' && /^\/uploads\/products\/[a-f0-9]{32}\.webp$/.test(value);
const mimeFormats = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };
export async function saveProductImage(buffer, mime, directory) {
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new Error('Choose an image up to 5 MB.');
  if (!mimeFormats[mime]) throw new Error('Choose a JPEG, PNG, or WebP image.');
  let output;
  try {
    const image = sharp(buffer, { limitInputPixels: 40000000, failOn: 'warning' });
    const metadata = await image.metadata();
    if (metadata.format !== mimeFormats[mime] || (metadata.pages || 1) > 1) throw new Error();
    output = await image.rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
  } catch { throw new Error('This image could not be read. Use a valid, non-animated JPEG, PNG, or WebP image under 40 megapixels.'); }
  const filename = randomBytes(16).toString('hex') + '.webp';
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, filename), output, { flag: 'wx' });
  return '/uploads/products/' + filename;
}
export async function receiveProductImage(req, directory) {
  if (Number(req.headers['content-length']) > MAX_IMAGE_BYTES) {
    const error = new Error('Choose an image up to 5 MB.'); error.status = 413; throw error;
  }
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_IMAGE_BYTES) { const error = new Error('Choose an image up to 5 MB.'); error.status = 413; throw error; }
    chunks.push(chunk);
  }
  return saveProductImage(Buffer.concat(chunks), req.headers['content-type']?.split(';')[0], directory);
}
export async function serveProductImage(req, res, pathname, directory) {
  if (!localImagePath(pathname)) { res.writeHead(404); res.end('Image not found'); return; }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
  try {
    const data = await readFile(path.join(directory, pathname.split('/').pop()));
    res.writeHead(200, { 'Content-Type': 'image/webp', 'Content-Length': data.length, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=31536000, immutable' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch (error) { res.writeHead(error.code === 'ENOENT' ? 404 : 500); res.end('Image unavailable'); }
}
