import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createApp } from './server.js';

test('catalog authentication, validation, CRUD, persistence, conflicts and logout', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'happy-diamond-'));
  const options = { dataFile: path.join(dir, 'catalog.json') };
  let server = await createApp(options), base;
  async function listen() { server.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`; }
  const close = () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  const request = (url, method = 'GET', data, cookie, extra = {}) => fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...extra }, ...(data ? { body: JSON.stringify(data) } : {}) });
  await listen();
  try {
    let catalog = await request('/api/catalog').then(r => r.json());
    assert.equal(catalog.products.length, 4);
    assert.equal((await request('/api/admin/catalog', 'PUT', catalog)).status, 401);
    assert.equal((await request('/api/admin/login', 'POST', { password: 'wrong' })).status, 401);
    assert.equal((await request('/api/admin/login', 'POST', { password: 'goldlover123' }, null, { Origin: 'https://other.example' })).status, 403);
    const login = await request('/api/admin/login', 'POST', { password: 'goldlover123' });
    assert.equal(login.status, 200); assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const stale = structuredClone(catalog);
    catalog.categories.push('Pendants');
    catalog.products.push({ id: 5, name: 'New pendant', category: 'Pendants', material: '22k gold', price: 123.45, image: 'https://example.com/pendant.jpg', tag: 'NEW' });
    let res = await request('/api/admin/catalog', 'PUT', catalog, cookie);
    assert.equal(res.status, 200); catalog = await res.json();
    assert.equal((await request('/api/admin/catalog', 'PUT', stale, cookie)).status, 409);
    for (const patch of [{ price: -1 }, { price: 1.001 }, { image: 'javascript:alert(1)' }, { category: 'Missing' }, { name: '' }]) {
      const invalid = structuredClone(catalog); Object.assign(invalid.products[0], patch);
      assert.equal((await request('/api/admin/catalog', 'PUT', invalid, cookie)).status, 400);
    }
    catalog.categories = catalog.categories.map(c => c === 'Pendants' ? 'Fine pendants' : c);
    catalog.products[4].category = 'Fine pendants'; catalog.products[4].price = 250.99;
    res = await request('/api/admin/catalog', 'PUT', catalog, cookie); assert.equal(res.status, 200);
    await close(); server = await createApp(options); await listen();
    catalog = await request('/api/catalog').then(r => r.json());
    assert.equal(catalog.products[4].price, 250.99); assert.equal(catalog.products[4].category, 'Fine pendants');
    assert.equal((await request('/api/admin/catalog', 'PUT', catalog, cookie)).status, 401);
    const nextLogin = await request('/api/admin/login', 'POST', { password: 'goldlover123' });
    const nextCookie = nextLogin.headers.get('set-cookie').split(';')[0];
    catalog.products = catalog.products.filter(p => p.id !== 5); catalog.categories = catalog.categories.filter(c => c !== 'Fine pendants');
    assert.equal((await request('/api/admin/catalog', 'PUT', catalog, nextCookie)).status, 200);
    assert.equal((await request('/api/admin/logout', 'POST', {}, nextCookie)).status, 200);
    assert.equal((await request('/api/admin/catalog', 'PUT', catalog, nextCookie)).status, 401);
    for (let i = 0; i < 5; i++) assert.equal((await request('/api/admin/login', 'POST', { password: 'bad' })).status, 401);
    assert.equal((await request('/api/admin/login', 'POST', { password: 'goldlover123' })).status, 429);
  } finally { await close(); await rm(dir, { recursive: true, force: true }); }
});
