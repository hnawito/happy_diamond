import { language, arabic, translate, dictionary } from './locale.js';
import './rtl.css';
export { language, arabic, translate, productText, formatMoney } from './locale.js';
export function catalogTranslations(catalog) {
  for(const [key,value] of Object.entries(catalog.categoryTranslations || {})) if(value)dictionary[key]=value;
  for(const product of catalog.products || [])for(const field of ['name','material','tag'])if(product[field] && product[field+'Ar'])dictionary[product[field]]=product[field+'Ar'];
  if(arabic)localize(document.documentElement);
}
document.documentElement.lang=language; document.documentElement.dir=arabic?'rtl':'ltr';
try{localStorage.setItem('hd-language',language);}catch{}
const switcher=document.createElement('button');switcher.type='button';switcher.className='language-switch';switcher.setAttribute('data-no-translate','');switcher.textContent=arabic?'English':'العربية';switcher.setAttribute('aria-label',arabic?'Switch to English':'التبديل إلى العربية');
switcher.onclick=()=>{const next=arabic?'en':'ar';try{localStorage.setItem('hd-language',next);}catch{}const url=new URL(location.href);url.searchParams.set('lang',next);location.href=url.href;};
document.querySelector('header')?.append(switcher);
function localize(root) {
  if(!arabic)return;
  if(root.nodeType===3){if(!root.parentElement?.closest('script,style,textarea,[data-no-translate]')){const text=translate(root.nodeValue);if(text!==root.nodeValue)root.nodeValue=text;}return;}
  if(root.nodeType!==1 || root.closest('script,style,textarea,[data-no-translate]'))return;
  // Preserve canonical option values: translated labels must never change status/category IDs.
  if(root.tagName==='OPTION' && !root.hasAttribute('value'))root.setAttribute('value',root.value);
  for(const attr of ['placeholder','aria-label','alt','title'])if(root.hasAttribute(attr)){const value=root.getAttribute(attr),translated=translate(value);if(value!==translated)root.setAttribute(attr,translated);}
  for(const child of root.childNodes)localize(child);
}
localize(document.documentElement);
new MutationObserver(records=>{for(const r of records){if(r.type==='childList')for(const node of r.addedNodes)localize(node);else localize(r.target);}}).observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['placeholder','aria-label','alt','title']});
document.addEventListener('invalid',e=>{if(arabic && e.target.setCustomValidity)e.target.setCustomValidity('يرجى إدخال قيمة صالحة في هذا الحقل.');},true);
document.addEventListener('input',e=>e.target.setCustomValidity?.(''),true);
