import { formatMoney, productText } from './i18n.js';
import { escapeHTML as esc } from './catalog.js';
export { esc };
export const money = formatMoney;
export async function api(url, method = 'GET', data) {
  const response = await fetch(url,{method,headers:{'Content-Type':'application/json'},...(data !== undefined ? {body:JSON.stringify(data)} : {})});
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Request failed.'); return result;
}
export function fields(profile = {}, readonlyEmail = false) {
  const input = (label,name,type='text',value='',extra='') => `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
  return input('Full name','name','text',profile.name || '', 'required maxlength="160" autocomplete="name"') + `<div class="field-row">${input('Email','email','email',profile.email || '',`required autocomplete="email" ${readonlyEmail ? 'readonly' : ''}`)}${input('Phone','phone','tel',profile.phone || '', 'required maxlength="40" autocomplete="tel"')}</div>` +
    input('Street address','line1','text',profile.address?.line1 || '', 'required maxlength="200" autocomplete="address-line1"') + input('Apartment / additional address','line2','text',profile.address?.line2 || '', 'maxlength="200" autocomplete="address-line2"') + `<div class="field-row">${input('City','city','text',profile.address?.city || '', 'required maxlength="200" autocomplete="address-level2"')}${input('State / region','region','text',profile.address?.region || '', 'maxlength="200" autocomplete="address-level1"')}</div><div class="field-row">${input('Postal code','postalCode','text',profile.address?.postalCode || '', 'maxlength="200" autocomplete="postal-code"')}${input('Country','country','text',profile.address?.country || '', 'required maxlength="200" autocomplete="country-name"')}</div>` + input('Birth date (optional)','birthDate','date',profile.birthDate || '',`min="1900-01-01" max="${new Date().toISOString().slice(0,10)}" autocomplete="bday"`) + input(`Personal ID (optional${profile.personalIdLast4 ? '; saved ID ending '+profile.personalIdLast4 : ''})`,'personalId','text','','maxlength="100" autocomplete="off"') + '<p class="field-help">Your ID is encrypted. Leave blank to keep the saved ID. Do not enter payment card details.</p>' + input('Jewelry preferences (separate with commas)','preferences','text',(profile.preferences || []).join(', '),'maxlength="2400" placeholder="Gold, rings, minimalist"') + `<label class="checkbox"><input name="marketingConsent" type="checkbox" ${profile.marketingConsent ? 'checked' : ''}> I would like to receive jewelry news and offers by email. I can unsubscribe at any time.</label>`;
}
export function profileData(form) {
  const data = Object.fromEntries(new FormData(form));
  return {...data, address:Object.fromEntries(['line1','line2','city','region','postalCode','country'].map(k=>[k,data[k]])),preferences:data.preferences.split(/[,،]/).map(p=>p.trim()).filter(Boolean),marketingConsent:form.elements.marketingConsent.checked};
}
export function orderCards(orders) {
  return [...orders].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(o=>`<details class="order-card"><summary><span>Order ${esc(o.id.slice(0,8))} · ${esc(o.createdAt.slice(0,10))}</span><span>${esc(o.status)} · ${money(o.total)}</span></summary><p>${o.status==='requested'?'Order request — no online payment has been collected.':'Order status: '+esc(o.status)}</p><ul>${o.items.map(i=>`<li>${esc(productText(i))} · ${i.quantity} × ${money(i.unitPrice)} = ${money(i.unitPrice*i.quantity)}</li>`).join('')}</ul><p>Delivery address: ${esc(Object.values(o.address).filter(Boolean).join(', '))}</p>${o.note?`<p>Note: ${esc(o.note)}</p>`:''}<strong>Total: ${money(o.total)} ${esc(o.currency)}</strong></details>`).join('') || '<p>Your order history will appear here after your first order.</p>';
}
