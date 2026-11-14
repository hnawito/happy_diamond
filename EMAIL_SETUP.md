# Happy Diamond email setup

The local, Git-ignored `email-config.local.json` uses Gmail SMTP (`smtp.gmail.com:465`, TLS), with the sender and initial administrator recovery address requested during setup. It contains no password. Keep this local file private and change `appUrl` to the actual site URL before sending real emails. The local preview URL is currently `http://localhost:5174`.

## Enable delivery

Use a Gmail app password rather than the normal account password. Gmail app passwords require 2-Step Verification and may not be available for every account type. See [Google's app password instructions](https://support.google.com/accounts/answer/185833).

Set these environment variables in the server's launch terminal or hosting environment:

```powershell
$env:SMTP_PASSWORD = 'YOUR_GMAIL_APP_PASSWORD'
$env:APP_URL = 'https://YOUR_PUBLIC_DOMAIN'
$env:COOKIE_SECURE = 'true'
npm start
```

Use `COOKIE_SECURE=false` for a local HTTP preview. Never paste credentials into chat or commit them to Git. `.env` files are not automatically loaded. Changing environment variables requires restarting the server.

Optional overrides: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `MAIL_FROM`, `ADMIN_EMAIL`. `ADMIN_EMAIL` initializes the recovery email only when no saved account data exists. Once initialized, change the recovery email in the dashboard using the current admin password. Email credentials are never exposed in the dashboard or public APIs.

## Recovery

Customers and administrators can request a one-time reset link from `/recovery.html`. Links expire after 30 minutes and can be used once. New passwords are selected on the site; no plaintext passwords are emailed. Admins can also set a customer's temporary password in the dashboard, requiring the customer to change it before requesting an order.

## Templates, segments and bulk email

1. Create a segment using address and preferences plus completed-purchase count, spend, date, or purchased category. All filters use AND; address and preference filters are case-insensitive substring matches.
2. Save a plain text email template. `{{name}}` personalizes the recipient's name.
3. Choose a saved segment and template, then preview the exact recipient list and message.
4. Confirm sending. Only opted-in customers receive marketing messages, each addressed separately, with an unsubscribe link. Consent is rechecked at delivery.
5. Refresh delivery status. Sent means accepted by the mail provider, not proof of inbox delivery. Failed messages are not retried automatically. An interrupted delivery may be marked uncertain to avoid duplicate messages.

Campaigns run inside this single server process. Keep it running during delivery. Draft previews expire after an hour. Gmail applies provider sending limits; for a larger audience use a dedicated email provider with suitable limits. This implementation does not sync delivery events, spam complaints, or bounce webhooks.

No real emails are sent by the automated tests. Tests inject an in-memory mail service. Real SMTP delivery remains unverified until credentials are configured.
