import { productText, catalogTranslations } from './i18n.js';
import { api, fields, profileData, orderCards, esc, money } from './member-client.js';
const $ = s => document.querySelector(s);
let customer, catalog;
const message = text => { $('#account-message').textContent = text; $('#account-message').scrollIntoView({behavior:'smooth',block:'center'}); };
$('#registration-fields').innerHTML = fields();
async function home() {
  const session = await api('/api/account/session'); customer = session.customer;
  $('#account-auth').hidden = Boolean(customer); $('#account-home').hidden = !customer; $('#account-logout').hidden = !customer;
  if (!customer) return;
  $('#customer-greeting').textContent = `Welcome, ${customer.name}.`;
  $('#profile-fields').innerHTML = fields(customer,true);
  $('#temporary-password-note').textContent = customer.mustChangePassword ? 'Your administrator set a temporary password. Choose your own password before submitting an order request.' : 'Use at least 10 characters.';
  const {orders} = await api('/api/account/orders');
  $('#customer-orders').innerHTML = orderCards(orders);
  const purchases = orders.filter(o=>['completed','delivered'].includes(o.status));
  $('#purchase-summary').textContent = `${purchases.length} completed purchases · ${money(purchases.reduce((s,o)=>s+o.total,0))} total spent`;
  catalog = await api('/api/catalog'); catalogTranslations(catalog); renderBag();
}
function bagItems() {
  let bag; try { bag = JSON.parse(localStorage.getItem('hd-bag') || '[]'); } catch { return []; }
  if (!Array.isArray(bag)) return [];
  return [...new Set(bag)].map(id=>({productId:id,quantity:bag.filter(x=>x===id).length})).filter(line=>catalog.products.some(p=>p.id===line.productId));
}
function renderBag() {
  const items = bagItems();
  $('#account-basket').innerHTML = items.length ? `<ul>${items.map(line=>{ const p=catalog.products.find(p=>p.id===line.productId);return `<li>${esc(productText(p))} · ${line.quantity} × ${money(p.price)}</li>`; }).join('')}</ul><p>Total: ${money(items.reduce((sum,line)=>sum+catalog.products.find(p=>p.id===line.productId).price*line.quantity,0))}</p><button id="submit-request" class="button dark" ${customer.mustChangePassword?'disabled':''}>Confirm unpaid order request →</button>` : '<p>Your bag is empty. <a class="underlink" href="/#collections">Find your next favorite ↗</a></p>';
}
function formAction(selector, fn) { $(selector).onsubmit = async e => { e.preventDefault(); const button = e.submitter; button.disabled=true; try { await fn(e.target); } catch(err){message(err.message);}finally{button.disabled=false;} }; }
formAction('#customer-login',async form=>{ await api('/api/account/login','POST',Object.fromEntries(new FormData(form))); form.reset(); await home(); message('Welcome back.'); });
formAction('#customer-register',async form=>{ await api('/api/account/register','POST',profileData(form)); form.reset(); await home(); message('Your account is ready.'); });
formAction('#customer-profile',async form=>{ await api('/api/account/profile','PUT',profileData(form)); await home(); message('Your details have been saved.'); });
formAction('#customer-password',async form=>{ await api('/api/account/password','POST',Object.fromEntries(new FormData(form))); form.reset(); await home(); message('Password updated.'); });
$('#account-logout').onclick=async()=>{try{await api('/api/account/logout','POST',{});await home();message('You have signed out.');}catch(err){message(err.message);}};
$('#account-basket').onclick=async e=>{if(e.target.id!=='submit-request')return;const b=e.target;b.disabled=true;try{await api('/api/account/orders','POST',{items:bagItems()});localStorage.removeItem('hd-bag');await home();message('Your order request was sent. No payment was collected.');}catch(err){message(err.message);b.disabled=false;}};
try{await home();}catch(err){message(err.message);}
