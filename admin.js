import { productText, catalogTranslations, formatMoney } from './i18n.js';
import './crm.js';
import { escapeHTML as esc, imageURL } from './catalog.js';
const $ = s => document.querySelector(s);
let catalog, editingCategory = null, confirmation;
let editorImages = [], uploadingImages = false;
async function api(url, method = 'GET', data) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}) });
  const result = await res.json();
  if (!res.ok) {
    if (res.status === 401 && url !== '/api/admin/login') loginView();
    throw new Error(result.error || 'Something went wrong. Please try again.');
  }
  return result;
}
function loginView() { $('#dashboard').hidden = true; $('#logout').hidden = true; $('#login-panel').hidden = false; $('#product-editor').close(); }
function status(message) { $('#admin-status').textContent = message; }
async function load() {
  catalog = await api('/api/catalog'); catalogTranslations(catalog); $('#login-panel').hidden = true; $('#dashboard').hidden = false; $('#logout').hidden = false; render(); document.dispatchEvent(new Event('admin-authenticated'));
}
function render() {
  $('#stat-products').textContent = catalog.products.length;
  $('#stat-categories').textContent = catalog.categories.length;
  $('#category-list').innerHTML = catalog.categories.map((c, index) => `<div class="category-chip"><span>${esc(c)}</span><button data-rename="${index}">Rename</button><button data-delete-category="${index}" ${catalog.products.some(p => p.category === c) ? 'disabled title="Move or remove products before deleting this category"' : ''}>Delete</button></div>`).join('');
  const current = $('#admin-filter').value;
  $('#admin-filter').innerHTML = '<option value="">All categories</option>' + catalog.categories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  $('#admin-filter').value = catalog.categories.includes(current) ? current : '';
  renderProducts();
}
function renderProducts() {
  const query = $('#admin-search').value.toLowerCase(), category = $('#admin-filter').value;
  const products = catalog.products.filter(p => (!category || p.category === category) && `${p.name} ${p.nameAr || ''} ${p.material} ${p.materialAr || ''}`.toLowerCase().includes(query));
  $('#product-rows').innerHTML = products.map(p => `<tr><td><div class="table-product"><img src="${esc(imageURL(p.image))}" alt=""><div>${esc(productText(p))}<small>${esc(productText(p,'material'))}</small></div></div></td><td>${esc(p.category)}</td><td>${formatMoney(p.price)}</td><td>${esc(productText(p,'tag'))}</td><td><button data-edit="${p.id}">Edit</button><button data-delete="${p.id}">Delete</button></td></tr>`).join('') || '<tr><td colspan="5">No products found. Add a product or change your filters.</td></tr>';
}
let saving = false;
async function save(next, message) {
  if (saving) throw new Error('A save is already in progress. Please wait.');
  saving = true;
  try { catalog = await api('/api/admin/catalog', 'PUT', next); catalogTranslations(catalog); render(); status(message); }
  finally { saving = false; }
}
$('#login-form').onsubmit = async e => {
  e.preventDefault(); const button = e.submitter; button.disabled = true; $('#login-error').textContent = '';
  try { await api('/api/admin/login', 'POST', { password: $('#password').value }); $('#password').value = ''; await load(); }
  catch (err) { $('#login-error').textContent = err.message; }
  finally { button.disabled = false; }
};
$('#logout').onclick = async () => { try { await api('/api/admin/logout', 'POST', {}); loginView(); } catch (err) { status(err.message); } };
$('#admin-search').oninput = renderProducts; $('#admin-filter').onchange = renderProducts;
function editor(product) {
  if (!catalog.categories.length) { status('Add a category before adding products.'); return; }
  const form = $('#product-form'); form.reset();
  form.elements.category.innerHTML = catalog.categories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  form.elements.id.value = '';
  if (product) for (const key of ['id','name','category','price','material','tag','image','nameAr','materialAr','tagAr']) form.elements[key].value = product[key] || '';
  editorImages = product ? [...(product.images || [product.image])] : [];
  $('#upload-status').textContent = ''; renderImagePreviews();
  $('#editor-title').textContent = product ? 'Edit product' : 'Add product'; $('#editor-error').textContent = ''; $('#product-editor').showModal();
}
$('#new-product').onclick = () => editor();
$('#editor-close').onclick = $('#editor-cancel').onclick = () => $('#product-editor').close();
$('#product-form').onsubmit = async e => {
  e.preventDefault(); const button = e.submitter; button.disabled = true;
  const data = Object.fromEntries(new FormData(e.target));
  if (uploadingImages || !editorImages.length) { $('#editor-error').textContent = uploadingImages ? 'Please wait for image uploads to finish.' : 'Add at least one product image.'; button.disabled = false; return; }
  data.image = editorImages[0]; data.images = [...editorImages];
  const isNew = !data.id; data.id = isNew ? Math.max(0, ...catalog.products.map(p => p.id)) + 1 : Number(data.id); data.price = Number(data.price);
  const next = structuredClone(catalog);
  if (isNew) next.products.push(data); else next.products = next.products.map(p => p.id === data.id ? data : p);
  try { await save(next, `${data.name} saved. Storefront updated.`); $('#product-editor').close(); }
  catch (err) { $('#editor-error').textContent = err.message; }
  finally { button.disabled = false; }
};
function confirmDelete(message, action) { $('#confirm-message').textContent = message; confirmation = action; $('#confirm-dialog').showModal(); }
$('#confirm-cancel').onclick = () => $('#confirm-dialog').close();
$('#confirm-delete').onclick = async () => { const b = $('#confirm-delete'); b.disabled = true; try { await confirmation(); $('#confirm-dialog').close(); } catch (err) { $('#confirm-message').textContent = err.message; } finally { b.disabled = false; } };
document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || !catalog) return;
  if (b.dataset.edit) editor(catalog.products.find(p => p.id === Number(b.dataset.edit)));
  if (b.dataset.delete) { const p = catalog.products.find(p => p.id === Number(b.dataset.delete)); confirmDelete(`Delete “${p.name}”? This removes it from the storefront.`, () => save({ ...catalog, products: catalog.products.filter(item => item.id !== p.id) }, 'Product deleted.')); }
  if (b.dataset.rename !== undefined) { editingCategory = catalog.categories[Number(b.dataset.rename)]; $('#new-category').value = editingCategory; $('#new-category-ar').value = catalog.categoryTranslations?.[editingCategory] || ''; $('#category-form button').textContent = 'Save category →'; $('#new-category').focus(); }
  if (b.dataset.deleteCategory !== undefined) { const c = catalog.categories[Number(b.dataset.deleteCategory)]; confirmDelete(`Delete the empty category “${c}”?`, () => save({ ...catalog, categories: catalog.categories.filter(item => item !== c) }, 'Category deleted.')); }
});
$('#category-form').onsubmit = async e => {
  e.preventDefault(); const name = $('#new-category').value.trim(), button = e.submitter; button.disabled = true;
  const next = structuredClone(catalog);
  next.categoryTranslations ||= {};
  next.categoryTranslations[name] = $('#new-category-ar').value.trim();
  if (editingCategory && editingCategory !== name) delete next.categoryTranslations[editingCategory];
  if (editingCategory) { next.categories = next.categories.map(c => c === editingCategory ? name : c); next.products.forEach(p => { if (p.category === editingCategory) p.category = name; }); }
  else next.categories.push(name);
  try { await save(next, 'Category saved. Storefront updated.'); editingCategory = null; e.target.reset(); button.textContent = 'Add category +'; }
  catch (err) { status(err.message); }
  finally { button.disabled = false; }
};
try { const session = await api('/api/admin/session'); if (session.authenticated) await load(); } catch (err) { $('#login-error').textContent = 'Unable to connect to the catalog server. ' + err.message; }

function renderImagePreviews() {
  $('#product-image-previews').innerHTML = editorImages.map((image,index) => `<div class="image-preview"><img src="${esc(imageURL(image))}" alt="Product image ${index+1}"><span>${index === 0 ? 'Main image' : 'Image '+(index+1)}</span><div>${index ? `<button type="button" data-primary-image="${index}">Make main</button>` : ''}<button type="button" data-remove-image="${index}">Remove</button></div></div>`).join('') || '<p>No images yet. Choose photos from your computer.</p>';
  $('#product-form').elements.image.value = editorImages[0] || '';
}
$('#product-image-previews').onclick = e => {
  const b = e.target.closest('button'); if (!b || uploadingImages) return;
  if (b.dataset.removeImage !== undefined) editorImages.splice(Number(b.dataset.removeImage),1);
  if (b.dataset.primaryImage !== undefined) editorImages.unshift(...editorImages.splice(Number(b.dataset.primaryImage),1));
  renderImagePreviews();
};
$('#product-images').onchange = async e => {
  const files = [...e.target.files]; if (!files.length) return;
  if (files.length + editorImages.length > 8) { $('#upload-status').textContent = 'A product can have up to 8 images. Remove an image before adding more.'; e.target.value=''; return; }
  uploadingImages = true;
  const buttons = [$('#product-form button[type="submit"]'),$('#editor-close'),$('#editor-cancel')];
  buttons.forEach(b => b.disabled = true); e.target.disabled = true;
  let done = 0; const failures = [];
  try {
    for (const file of files) {
      $('#upload-status').textContent = `Uploading image ${done + failures.length + 1} of ${files.length}…`;
      try {
        if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 5*1024*1024) throw new Error('Choose JPEG, PNG or WebP files up to 5 MB each.');
        const res = await fetch('/api/admin/images',{method:'POST',headers:{'Content-Type':file.type},body:file});
        const result = await res.json(); if (!res.ok) throw new Error(result.error || 'Upload failed.');
        editorImages.push(result.image); done++; renderImagePreviews();
      } catch (err) { failures.push(`${file.name}: ${err.message}`); }
    }
    $('#upload-status').textContent = `${done} image(s) stored locally. Save the product to apply them.${failures.length ? ' '+failures.join(' ') : ''}`;
  } finally { uploadingImages = false; buttons.forEach(b=>b.disabled=false); e.target.disabled=false; e.target.value=''; }
};
$('#product-editor').addEventListener('cancel',e=>{if(uploadingImages)e.preventDefault();});
