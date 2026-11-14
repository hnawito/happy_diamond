# Happy Diamond

Responsive jewelry storefront and authenticated catalog dashboard.

For required components, storage, configuration, and deployment steps, see [INSTALLATION_REQUIREMENTS.md](INSTALLATION_REQUIREMENTS.md).

## Run locally

```sh
npm install
npm run dev
```
administrator Password is goldlover123
Storefront: http://localhost:5173
Admin: http://localhost:5173/admin.html (also linked in the storefront footer)

Sign in with the password supplied during setup. The initial admin SHA-256 hash is stored in server code. Password changes save a new hash in private server data. SHA-256 is hashing, not encryption. Login uses an HttpOnly, SameSite session cookie valid for eight hours. Sessions end on server restart. Five incorrect admin login attempts per client IP block login for 15 minutes.

## Managing the catalog

Use Add product or Edit to maintain names, categories, USD prices (including cents), materials, labels, and images. Choose photos from your computer in Product photos. Each product supports up to eight JPEG, PNG, or WebP images (5 MB each). Preview images, remove them from the product, or choose Make main. Save product to publish the changes. Product details include a thumbnail gallery. Product deletion asks for confirmation.

Product images are ordinary files in `uploads/products/`, served at `/uploads/products/<filename>.webp`. The server validates and converts uploads to WebP, corrects orientation, strips metadata, and limits dimensions to 2000 pixels. Catalog records store file paths rather than binary data. Files persist across builds and server restarts. Existing example product images have been copied locally; editorial homepage images remain external.

Back up `uploads/products/` along with `data/`. For deployment, mount persistent storage for uploads as well as data, or set `PRODUCT_IMAGE_DIR` to another persistent image folder. The public URL remains `/uploads/products/`. Uploads require an admin session; viewing product photos is public. Files are retained when removed from products so existing order references and other products remain valid. Cancelled or failed product edits may leave unused uploaded files; there is no automatic disk cleanup.

Legacy HTTPS URLs and Unsplash IDs can still be read for compatibility. To migrate an older catalog's Unsplash product photos, stop the server and run `npm run images:local`, then restart it. Other external sources should be downloaded manually and uploaded in the dashboard. Product uploads require the Node server in both development and production; `dist/` alone is insufficient.

Add and rename categories. Renaming updates assigned products. Move or delete products before deleting their category. Search and category filters help manage products.

Changes save on the server in data/catalog.json. All visitors receive this shared catalog. Open storefronts refresh on focus and every 30 seconds. Conflicting edits are rejected; reload the dashboard before retrying. catalog.js supplies the initial catalog only until a saved catalog exists.

## Production

```sh
npm run build
npm start
```

A Node.js server is required. Uploading only dist/ does not provide login or catalog APIs. Deploy behind HTTPS with COOKIE_SECURE=true. PORT defaults to 5173. Mount persistent storage at data/, or set CATALOG_FILE to another persistent JSON file path. Back up that file. Use one Node process; multiple instances need a shared database and session store.

Override the initial password hash with ADMIN_PASSWORD_SHA256 (64 hex characters). After account data is saved, change the admin password through the dashboard. Set environment variables in the hosting environment; .env is not automatically loaded. Never expose server source or the data directory through static hosting. Admin SHA-256 is retained as requested; a slow salted hash is preferable for a public production service. Customer passwords use salted scrypt hashes.

## Arabic and English

Use the العربية / English button in the header of any screen. The preference is saved in the browser and follows navigation between the storefront, account, recovery and admin pages. Direct links can select a language with `?lang=ar` or `?lang=en`. Arabic uses right-to-left layouts and localized USD formatting; prices are not converted to another currency.

Products have `nameAr`, `materialAr`, and `tagAr` fields, editable in Add product / Edit. Categories have an Arabic display name maintained alongside the English name. English category keys, product IDs, status codes and API values remain stable. Existing sample products and categories include Arabic translations. New product names and category names require Arabic text in the dashboard; untranslated legacy or custom data falls back to its original text. Customer names, addresses, preferences, and email template content remain as entered by their authors.

Shared interface translations and dynamic-message patterns live in `locale.js`; `i18n.js` applies them to static and newly rendered text and accessible labels. Keep new interface strings translated there. `rtl.css` contains direction-specific styles. New order snapshots include the Arabic product name; older order names can use matching catalog translations. No external translation service is used.

## Customer accounts and CRM

Customer registration and login: `/account.html`. Customers can maintain their name, phone, address, jewelry preferences, optional birth date and optional personal ID. Emails are fixed after registration. IDs are encrypted with AES-256-GCM; only the last four characters appear in APIs and the UI. Passwords are never returned. Order history is restricted to the signed-in customer. Customers can submit unpaid order requests using their bag; admins can record in-store purchases and update order status. Purchase segments count only completed or delivered orders.

The dashboard includes a customer directory, targeted password resets, order recording, saved segment rules, editable email templates, recipient previews, campaign confirmation, delivery counts, admin password changes, and recovery email settings. Marketing requires explicit customer opt-in and includes an unsubscribe link. See [EMAIL_SETUP.md](EMAIL_SETUP.md) for the Gmail configuration and remaining credential setup.

Private records are stored in `data/customers.json`, alongside the catalog. A private AES key is generated in `data/personal-id.key`, or supply a separate 64-character hex `PERSONAL_ID_KEY` environment variable. Back up the data and the key securely; losing the key prevents ID recovery. Keep the key separate from backups where possible. Use HTTPS and persistent private storage before collecting real customer details. The app does not implement identity verification, email verification, or payment processing.

## Checks

```sh
npm test
npm run build
```

Tests cover catalog authentication, unauthorized writes, origin protection, validation, product CRUD, category updates, persistence, conflicting edits, logout, and rate limiting. Image tests cover upload authentication, origin checks, size/type/content validation, local file storage, gallery persistence, missing files, safe public serving, and restart persistence. Customer integration tests cover ID encryption, isolated purchase history, server-calculated order totals, segment matching, marketing consent, unsubscribe, one-time resets, temporary password restrictions, admin password changes and recovery, and persisted records. Email tests use a mock sender and never send real messages.

Product details, photos and prices start as examples. External images and Google Fonts require internet access. Payments, newsletter registration, and appointments remain previews.
