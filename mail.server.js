import nodemailer from 'nodemailer';
import { readFile } from 'node:fs/promises';

export async function createMailer() {
  let config = {};
  try { config = JSON.parse(await readFile(new URL('./email-config.local.json', import.meta.url), 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  const user = process.env.SMTP_USER || config.user;
  const password = process.env[config.passwordEnv || 'SMTP_PASSWORD'];
  const host = process.env.SMTP_HOST || config.host;
  const port = Number(process.env.SMTP_PORT || config.port || 465);
  const from = process.env.MAIL_FROM || config.from;
  const appUrl = process.env.APP_URL || config.appUrl;
  const adminEmail = process.env.ADMIN_EMAIL || config.adminEmail || '';
  if (appUrl && !/^https?:\/\//.test(appUrl)) throw new Error('APP_URL must use HTTP or HTTPS.');
  const ready = Boolean(user && password && host && from && appUrl);
  const transport = ready ? nodemailer.createTransport({ host, port, secure: port === 465, requireTLS: port !== 465, auth: { user, pass: password }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000, disableFileAccess: true, disableUrlAccess: true }) : null;
  return {
    ready, adminEmail, appUrl,
    async send(message) {
      if (!transport) throw new Error('Email is not configured. Set SMTP_PASSWORD and APP_URL on the server.');
      const result = await transport.sendMail({ from, ...message });
      if (result.rejected?.length || !result.accepted?.length) throw new Error('Email provider did not accept the message.');
    },
  };
}
