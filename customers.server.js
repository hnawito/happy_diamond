import { createHash, randomBytes, scrypt, timingSafeEqual, createCipheriv } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { createMailer } from './mail.server.js';

const derive = promisify(scrypt);
const digest = value => createHash('sha256').update(value).digest('hex');
const id = () => randomBytes(16).toString('hex');
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
const clean = (value, max = 200) => { requireValue(typeof value === 'string' && value.length <= max, 'Invalid or excessively long text.'); return value.trim(); };
const email = value => { const s = clean(value, 254).toLowerCase(); requireValue(/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s), 'Enter a valid email address.'); return s; };
const password = value => { requireValue(typeof value === 'string' && value.length >= 10 && value.length <= 128, 'Use a password of 10–128 characters.'); return value; };
async function hashPassword(value) { password(value); const salt = randomBytes(16).toString('hex'); return `scrypt:${salt}:${(await derive(value, salt, 64)).toString('hex')}`; }
async function checkPassword(value, stored) {
  if (typeof value !== 'string' || value.length > 128 || !stored) return false;
  if (!stored.startsWith('scrypt:')) return timingSafeEqual(Buffer.from(digest(value), 'hex'), Buffer.from(stored, 'hex'));
  const [,salt,hash] = stored.split(':'); return timingSafeEqual(await derive(value, salt, 64), Buffer.from(hash, 'hex'));
}
const safeProfile = customer => { const { passwordHash, personalIdEncrypted, unsubscribeHash, unsubscribeHashes, ...safe } = customer; return safe; };
const completed = order => ['completed', 'delivered'].includes(order.status);
export function segmentMatches(customer, orders, rules) {
  const history = orders.filter(o => o.customerId === customer.id && completed(o));
  return (!rules.preference || customer.preferences.some(p => p.toLowerCase().includes(rules.preference.toLowerCase())))
    && (!rules.address || Object.values(customer.address).join(' ').toLowerCase().includes(rules.address.toLowerCase()))
    && history.length >= rules.minOrders
    && history.reduce((s,o) => s + o.total, 0) >= rules.minSpend
    && (!rules.purchasedAfter || history.some(o => o.createdAt.slice(0,10) >= rules.purchasedAfter))
    && (!rules.category || history.some(o => o.items.some(i => i.category.toLowerCase() === rules.category.toLowerCase())));
}

export async function createCustomers({ directory, initialAdminHash, mailer, invalidateAdmins, secureCookies = false }) {
  const mail = mailer || await createMailer();
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, 'customers.json');
  const keyFile = path.join(directory, 'personal-id.key');
  let key;
  if (process.env.PERSONAL_ID_KEY) { requireValue(/^[a-f0-9]{64}$/i.test(process.env.PERSONAL_ID_KEY), 'PERSONAL_ID_KEY must be 64 hex characters.'); key = Buffer.from(process.env.PERSONAL_ID_KEY, 'hex'); }
  else { try { key = await readFile(keyFile); } catch (e) { if (e.code !== 'ENOENT') throw e; key = randomBytes(32); await writeFile(keyFile, key, { mode: 0o600, flag: 'wx' }); } }
  let state;
  try { state = JSON.parse(await readFile(file, 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw e; state = { admin: { passwordHash: initialAdminHash, email: mail.adminEmail || '' }, customers: [], orders: [], segments: [], templates: [], campaigns: [], resets: [] }; }
  // An interrupted delivery is never resent automatically: the provider may already have accepted it.
  for (const campaign of state.campaigns) if (campaign.status === 'sending') { campaign.status = 'interrupted'; for (const r of campaign.recipients) if (r.status === 'sending') r.status = 'uncertain'; }
  let queue = Promise.resolve();
  const mutate = operation => {
    const result = queue.then(async () => { const draft = structuredClone(state); const result = await operation(draft); await writeFile(file + '.tmp', JSON.stringify(draft, null, 2), { mode: 0o600 }); await rename(file + '.tmp', file); state = draft; return result; });
    queue = result.catch(() => {}); return result;
  };
  const sessions = new Map(), limits = new Map();
  const prune = setInterval(() => { for (const [k,v] of sessions) if (v.expires < Date.now()) sessions.delete(k); for (const [k,v] of limits) if (v.until < Date.now()) limits.delete(k); }, 60000); prune.unref();
  const invalidateCustomer = customerId => { for (const [k,v] of sessions) if (v.customerId === customerId) sessions.delete(k); };
  const encryptId = value => { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv); const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]); return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted.toString('hex')}`; };
  function profile(data, previous) {
    const name = clean(data.name, 160), phone = clean(data.phone, 40);
    requireValue(name.length > 0 && /^[+\d\s().-]{5,40}$/.test(phone) && /\d/.test(phone), 'Enter your name and a valid phone number.');
    requireValue(data.address && typeof data.address === 'object', 'Enter your address.');
    const address = Object.fromEntries(['line1','line2','city','region','postalCode','country'].map(k => [k, clean(data.address[k] || '', 200)]));
    requireValue(address.line1 && address.city && address.country, 'Street, city and country are required.');
    requireValue(Array.isArray(data.preferences) && data.preferences.length <= 30, 'Enter up to 30 preferences.');
    const preferences = [...new Set(data.preferences.map(p => clean(p, 80)).filter(Boolean))];
    const birthDate = clean(data.birthDate || '', 10);
    requireValue(!birthDate || (/^\d{4}-\d{2}-\d{2}$/.test(birthDate) && !Number.isNaN(Date.parse(birthDate)) && new Date(birthDate).toISOString().slice(0,10) === birthDate && birthDate <= new Date().toISOString().slice(0,10) && birthDate >= '1900-01-01'), 'Enter a valid birth date.');
    const personalId = clean(data.personalId || '', 100);
    requireValue(!personalId || personalId.length >= 4, 'Personal ID must contain at least four characters.');
    return { name, email: previous?.email || email(data.email), phone, address, preferences, birthDate, marketingConsent: data.marketingConsent === true, personalIdEncrypted: personalId ? encryptId(personalId) : previous?.personalIdEncrypted || '', personalIdLast4: personalId ? personalId.slice(-4) : previous?.personalIdLast4 || '' };
  }
  function rules(data) {
    const result = { preference: clean(data.preference || '', 80), address: clean(data.address || '', 200), category: clean(data.category || '', 80), purchasedAfter: clean(data.purchasedAfter || '', 10), minOrders: Number(data.minOrders || 0), minSpend: Number(data.minSpend || 0) };
    requireValue(Number.isSafeInteger(result.minOrders) && result.minOrders >= 0 && Number.isFinite(result.minSpend) && result.minSpend >= 0, 'Order and spend thresholds must be positive numbers.');
    requireValue(!result.purchasedAfter || /^\d{4}-\d{2}-\d{2}$/.test(result.purchasedAfter) && !Number.isNaN(Date.parse(result.purchasedAfter)), 'Enter a valid purchase date.');
    return result;
  }
  function buildOrder(data, catalog, customerId, isAdmin) {
    requireValue(Array.isArray(data.items) && data.items.length > 0 && data.items.length <= 100, 'Choose between 1 and 100 product lines.');
    const items = data.items.map(line => {
      const p = catalog.products.find(p => p.id === Number(line.productId));
      requireValue(p && Number.isInteger(line.quantity) && line.quantity > 0 && line.quantity <= 100, 'Choose an available product and quantity from 1 to 100.');
      return { productId: p.id, name: p.name, nameAr: p.nameAr || '', category: p.category, unitPrice: p.price, quantity: line.quantity, image: p.image };
    });
    const status = isAdmin ? data.status || 'completed' : 'requested';
    requireValue(['requested','processing','completed','delivered','cancelled'].includes(status), 'Invalid order status.');
    return { id: id(), customerId, items, total: Math.round(items.reduce((s,i) => s + i.unitPrice * i.quantity, 0) * 100) / 100, currency: 'USD', status, createdAt: new Date().toISOString(), address: structuredClone(state.customers.find(c => c.id === customerId).address), note: clean(data.note || '', 1000) };
  }
  async function resetRequest(role, target) {
    requireValue(mail.ready && mail.appUrl, 'Email delivery is not configured. Set SMTP_PASSWORD on the server.');
    const customer = state.customers.find(c => c.email === target);
    const found = role === 'admin' ? target === state.admin.email : Boolean(customer);
    if (!found) return;
    const token = randomBytes(32).toString('hex'), tokenHash = digest(token);
    await mutate(s => { s.resets = s.resets.filter(r => r.expires > Date.now() && !(r.role === role && r.target === target)); s.resets.push({ tokenHash, role, target, expires: Date.now() + 30 * 60000 }); });
    try { await mail.send({ to: target, subject: 'Reset your Happy Diamond password', text: `A password reset was requested for your ${role} account. Choose a new password using this one-time link (expires in 30 minutes):\n\n${mail.appUrl.replace(/\/$/,'')}/recovery.html#token=${token}\n\nIf you did not request this, ignore this email.` }); }
    catch { await mutate(s => { s.resets = s.resets.filter(r => r.tokenHash !== tokenHash); }); throw new Error('Email could not be sent. Please check the mail configuration.'); }
  }
  function summary() {
    return { customers: state.customers.map(c => ({ ...safeProfile(c), orderCount: state.orders.filter(o => o.customerId === c.id && completed(o)).length, totalSpent: state.orders.filter(o => o.customerId === c.id && completed(o)).reduce((sum,o) => sum + o.total, 0) })), orders: state.orders, segments: state.segments.map(s => ({ ...s, count: state.customers.filter(c => segmentMatches(c,state.orders,s.rules)).length })), templates: state.templates, campaigns: state.campaigns.map(({ recipients, ...c }) => ({ ...c, total: recipients.length, sent: recipients.filter(r => r.status === 'sent').length, failed: recipients.filter(r => r.status === 'failed').length, skipped: recipients.filter(r => r.status === 'skipped').length, uncertain: recipients.filter(r => r.status === 'uncertain').length })), settings: { adminEmail: state.admin.email, emailConfigured: mail.ready, appUrl: mail.appUrl || '' } };
  }
  let delivering = false;
  async function deliver(campaignId) {
    delivering = true;
    try {
      const recipientIds = state.campaigns.find(c => c.id === campaignId).recipients.map(r => r.customerId);
      for (const customerId of recipientIds) {
        const customer = state.customers.find(c => c.id === customerId);
        const campaign = state.campaigns.find(c => c.id === campaignId);
        if (!customer?.marketingConsent) { await mutate(s => { s.campaigns.find(c => c.id === campaignId).recipients.find(r => r.customerId === customerId).status = 'skipped'; }); continue; }
        const unsubscribeToken = randomBytes(32).toString('hex');
        await mutate(s => { const c = s.customers.find(c => c.id === customerId); c.unsubscribeHashes = [...(c.unsubscribeHashes || []), digest(unsubscribeToken)]; s.campaigns.find(c => c.id === campaignId).recipients.find(r => r.customerId === customerId).status = 'sending'; });
        const personalize = value => value.replace(/\{\{name\}\}/g, customer.name);
        try {
          await mail.send({ to: customer.email, subject: personalize(campaign.subject).replace(/[\r\n]/g, ' '), text: personalize(campaign.body) + `\n\nManage email preferences or unsubscribe:\n${mail.appUrl.replace(/\/$/,'')}/recovery.html#unsubscribe=${unsubscribeToken}` });
          await mutate(s => { s.campaigns.find(c => c.id === campaignId).recipients.find(r => r.customerId === customerId).status = 'sent'; });
        } catch { await mutate(s => { s.campaigns.find(c => c.id === campaignId).recipients.find(r => r.customerId === customerId).status = 'failed'; }); }
      }
      await mutate(s => { s.campaigns.find(c => c.id === campaignId).status = 'finished'; });
    } catch { try { await mutate(s => { const c = s.campaigns.find(c => c.id === campaignId); c.status = 'interrupted'; for (const r of c.recipients) if (r.status === 'sending') r.status = 'uncertain'; }); } catch {} }
    finally { delivering = false; }
  }

  return {
    verifyAdmin: value => checkPassword(value, state.admin.passwordHash),
    close: () => clearInterval(prune),
    async handle({ req, res, url, authenticated, send, body, catalog }) {
      const route = url.pathname, method = req.method;
      if (!route.startsWith('/api/account/') && !route.startsWith('/api/auth/') && !route.startsWith('/api/admin/crm') && route !== '/api/admin/password' && route !== '/api/admin/settings') return false;
      const reply = (code, data) => { send(res,code,data); return true; };
      const token = /(?:^|;\s*)hd_customer=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
      const session = sessions.get(token);
      const customer = session?.expires > Date.now() ? state.customers.find(c => c.id === session.customerId) : null;
      const setSession = customerId => { const token = randomBytes(32).toString('hex'); sessions.set(token, { customerId, expires: Date.now() + 8 * 3600000 }); res.setHeader('Set-Cookie', `hd_customer=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=28800${secureCookies ? '; Secure' : ''}`); };
      if (['/api/account/login','/api/account/register','/api/auth/forgot','/api/auth/reset'].includes(route) && method === 'POST') {
        const key = `${req.socket.remoteAddress}:${route}`, current = limits.get(key);
        if (current?.until > Date.now() && current.count >= 10) return reply(429,{ error: 'Too many requests. Try again in 15 minutes.' });
        limits.set(key, { count: current?.until > Date.now() ? current.count + 1 : 1, until: current?.until > Date.now() ? current.until : Date.now() + 900000 });
      }
      if (route.startsWith('/api/admin/') && !authenticated) return reply(401,{ error: 'Please sign in as admin.' });
      if (route === '/api/auth/forgot' && method === 'POST') { const data = await body(req); requireValue(['admin','customer'].includes(data.role), 'Choose an account type.'); await resetRequest(data.role,email(data.email)); return reply(200,{ message: 'If this email matches an account, a reset link has been sent.' }); }
      if (route === '/api/auth/reset' && method === 'POST') {
        const data = await body(req), tokenHash = digest(clean(data.token || '', 64)); password(data.password);
        const hash = await hashPassword(data.password);
        const reset = await mutate(s => {
          const r = s.resets.find(r => r.tokenHash === tokenHash && r.expires > Date.now()); requireValue(r, 'This reset link is invalid or expired.');
          if (r.role === 'admin') s.admin.passwordHash = digest(data.password);
          else { const c = s.customers.find(c => c.email === r.target); requireValue(c, 'Account no longer exists.'); c.passwordHash = hash; c.mustChangePassword = false; }
          s.resets = s.resets.filter(item => !(item.role === r.role && item.target === r.target)); return r;
        });
        if (reset.role === 'admin') invalidateAdmins(); else invalidateCustomer(state.customers.find(c => c.email === reset.target).id);
        return reply(200,{ message: 'Password changed. Sign in with your new password.' });
      }
      if (route === '/api/auth/unsubscribe' && method === 'POST') {
        const data = await body(req), tokenHash = digest(clean(data.token || '',64));
        await mutate(s => { const c = s.customers.find(c => c.unsubscribeHash === tokenHash || c.unsubscribeHashes?.includes(tokenHash)); requireValue(c, 'This unsubscribe link is invalid.'); c.marketingConsent = false; });
        return reply(200,{ message: 'You are unsubscribed from marketing emails.' });
      }
      if (route === '/api/account/register' && method === 'POST') {
        const data = await body(req), values = profile(data), hash = await hashPassword(data.password);
        const customerId = id();
        await mutate(s => { requireValue(!s.customers.some(c => c.email === values.email), 'An account with this email already exists.'); s.customers.push({ ...values, id: customerId, passwordHash: hash, createdAt: new Date().toISOString(), mustChangePassword: false }); });
        setSession(customerId); return reply(201,{ customer: safeProfile(state.customers.find(c => c.id === customerId)) });
      }
      if (route === '/api/account/login' && method === 'POST') {
        const data = await body(req), c = state.customers.find(c => c.email === email(data.email));
        const valid = await checkPassword(data.password, c?.passwordHash || '0'.repeat(64));
        if (!c || !valid) return reply(401,{ error: 'Incorrect email or password.' });
        if (token) sessions.delete(token); setSession(c.id); return reply(200,{ customer: safeProfile(c) });
      }
      if (route === '/api/account/session' && method === 'GET') return reply(200,{ customer: customer ? safeProfile(customer) : null });
      if (route.startsWith('/api/account/') && !customer) return reply(401,{ error: 'Please sign in to your customer account.' });
      if (route === '/api/account/logout' && method === 'POST') { sessions.delete(token); res.setHeader('Set-Cookie','hd_customer=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0'); return reply(200,{ ok: true }); }
      if (route === '/api/account/profile' && method === 'PUT') { const values = profile(await body(req),customer); await mutate(s => Object.assign(s.customers.find(c => c.id === customer.id),values)); return reply(200,{ customer: safeProfile(state.customers.find(c => c.id === customer.id)) }); }
      if (route === '/api/account/password' && method === 'POST') {
        const data = await body(req); requireValue(await checkPassword(data.currentPassword,customer.passwordHash), 'Current password is incorrect.');
        const hash = await hashPassword(data.password); await mutate(s => { const c = s.customers.find(c => c.id === customer.id); c.passwordHash = hash; c.mustChangePassword = false; s.resets = s.resets.filter(r => r.target !== c.email); }); invalidateCustomer(customer.id); setSession(customer.id); return reply(200,{ message: 'Password updated.' });
      }
      if (route === '/api/account/orders' && method === 'GET') return reply(200,{ orders: state.orders.filter(o => o.customerId === customer.id) });
      if (route === '/api/account/orders' && method === 'POST') {
        requireValue(!customer.mustChangePassword, 'Change your temporary password before placing an order request.');
        const order = buildOrder(await body(req),catalog,customer.id,false); await mutate(s => s.orders.push(order)); return reply(201,{ order });
      }
      if (route === '/api/admin/password' && method === 'POST') {
        const data = await body(req); requireValue(await checkPassword(data.currentPassword,state.admin.passwordHash), 'Current password is incorrect.'); password(data.password);
        await mutate(s => { s.admin.passwordHash = digest(data.password); s.resets = s.resets.filter(r => r.role !== 'admin'); }); invalidateAdmins(); return reply(200,{ message: 'Admin password updated. Please sign in again.' });
      }
      if (route === '/api/admin/settings' && method === 'PUT') {
        const data = await body(req); requireValue(await checkPassword(data.currentPassword,state.admin.passwordHash), 'Current password is incorrect.'); const value = email(data.email);
        await mutate(s => { s.admin.email = value; s.resets = s.resets.filter(r => r.role !== 'admin'); }); return reply(200,{ message: 'Recovery email updated.' });
      }
      if (route === '/api/admin/crm' && method === 'GET') return reply(200,summary());
      if (route === '/api/admin/crm/customer-reset' && method === 'POST') {
        const data = await body(req); const c = state.customers.find(c => c.id === data.customerId); requireValue(c, 'Customer not found.');
        if (data.sendEmail) await resetRequest('customer',c.email);
        else { const hash = await hashPassword(data.password); await mutate(s => { const next = s.customers.find(item => item.id === c.id); next.passwordHash = hash; next.mustChangePassword = true; s.resets = s.resets.filter(r => r.target !== c.email); }); invalidateCustomer(c.id); }
        return reply(200,{ message: data.sendEmail ? 'Reset email sent.' : 'Temporary password set. Customer must change it after signing in.' });
      }
      if (route === '/api/admin/crm/orders' && method === 'POST') { const data = await body(req); requireValue(state.customers.some(c => c.id === data.customerId),'Choose a customer.'); const order = buildOrder(data,catalog,data.customerId,true); await mutate(s => s.orders.push(order)); return reply(201,{ order }); }
      if (route === '/api/admin/crm/orders' && method === 'PUT') {
        const data = await body(req); requireValue(['requested','processing','completed','delivered','cancelled'].includes(data.status),'Choose a valid status.');
        await mutate(s => { const order = s.orders.find(o => o.id === data.id); requireValue(order,'Order not found.'); order.status = data.status; order.updatedAt = new Date().toISOString(); }); return reply(200,{ ok: true });
      }
      if (route === '/api/admin/crm/segments' && method === 'POST') {
        const data = await body(req); const segment = { id: data.id || id(), name: clean(data.name,100), rules: rules(data.rules || {}) }; requireValue(segment.name,'Enter a segment name.');
        await mutate(s => { s.segments = s.segments.filter(item => item.id !== segment.id); s.segments.push(segment); }); return reply(200,{ segment });
      }
      if (route === '/api/admin/crm/templates' && method === 'POST') {
        const data = await body(req), template = { id: data.id || id(), name: clean(data.name,100), subject: clean(data.subject,200), body: clean(data.body,20000) };
        requireValue(template.name && template.subject && template.body && !/[\r\n]/.test(template.subject),'Template name, subject and message are required.');
        await mutate(s => { s.templates = s.templates.filter(t => t.id !== template.id); s.templates.push(template); }); return reply(200,{ template });
      }
      if ((route === '/api/admin/crm/segments' || route === '/api/admin/crm/templates') && method === 'DELETE') {
        const data = await body(req); const key = route.endsWith('segments') ? 'segments' : 'templates'; await mutate(s => { s[key] = s[key].filter(item => item.id !== data.id); }); return reply(200,{ ok: true });
      }
      if (route === '/api/admin/crm/campaign-preview' && method === 'POST') {
        const data = await body(req), segment = state.segments.find(s => s.id === data.segmentId), template = state.templates.find(t => t.id === data.templateId);
        requireValue(segment && template,'Choose a saved segment and template.');
        const matches = state.customers.filter(c => segmentMatches(c,state.orders,segment.rules));
        const recipients = matches.filter(c => c.marketingConsent).map(c => ({ customerId: c.id, name: c.name, email: c.email, status: 'queued' }));
        const campaign = { id: id(), name: `${template.name} / ${segment.name}`, subject: template.subject, body: template.body, createdAt: new Date().toISOString(), status: 'draft', recipients };
        await mutate(s => s.campaigns.push(campaign));
        return reply(200,{ id: campaign.id, subject: campaign.subject, body: campaign.body, excluded: matches.length - recipients.length, recipients: recipients.map(({name,email}) => ({name,email})) });
      }
      if (route === '/api/admin/crm/campaign-send' && method === 'POST') {
        requireValue(mail.ready,'Configure Gmail SMTP_PASSWORD before sending.'); requireValue(!delivering,'Another campaign is sending. Please wait.');
        const data = await body(req); requireValue(data.confirm === true,'Confirm the recipient preview before sending.');
        await mutate(s => { requireValue(!s.campaigns.some(c => c.status === 'sending'),'Another campaign is sending. Please wait.'); const c = s.campaigns.find(c => c.id === data.id); requireValue(c?.status === 'draft','This campaign is missing or has already been sent.'); requireValue(c.recipients.length > 0,'No opted-in recipients match this segment.'); requireValue(Date.parse(c.createdAt) > Date.now() - 3600000,'Preview expired. Create a new preview.'); c.status = 'sending'; });
        void deliver(data.id); return reply(202,{ message: 'Campaign started. Delivery results will appear below.' });
      }
      return reply(404,{ error: 'Not found.' });
    },
  };
}
