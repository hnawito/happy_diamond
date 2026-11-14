import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { validateCatalog } from './server.js';
import { initialCatalog } from './catalog.js';

test('Arabic pages, RTL, dynamic messages, canonical form values and catalog translations', async () => {
  const html=await readFile(new URL('./index.html',import.meta.url),'utf8');
  const dom=new JSDOM(html,{url:'http://localhost/?lang=ar'});
  for(const key of ['document','location','MutationObserver','localStorage'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
  const locale=await import('./locale.js');
  const source=(await readFile(new URL('./i18n.js',import.meta.url),'utf8')).replaceAll("'./locale.js'",JSON.stringify(new URL('./locale.js',import.meta.url).href)).replace("import './rtl.css';",'');
  const i18n=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  assert.equal(document.documentElement.lang,'ar');assert.equal(document.documentElement.dir,'rtl');
  assert.equal(document.querySelector('.language-switch').textContent,'English');
  assert.equal(localStorage.getItem('hd-language'),'ar');
  assert.match(document.querySelector('h1').textContent,/القليل من الذهب/);
  const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
  for(const file of ['account.html','admin.html','recovery.html']){
    const page=new JSDOM(await readFile(new URL('./'+file,import.meta.url),'utf8'));
    document.body.innerHTML=page.window.document.body.innerHTML;
    await settle();
    const texts=[];
    const walker=document.createTreeWalker(document.body,dom.window.NodeFilter.SHOW_TEXT);
    while(walker.nextNode()){const node=walker.currentNode;if(node.parentElement.closest('script,style,textarea'))continue;const value=node.nodeValue.trim();if(/[A-Za-z]/.test(value))texts.push(value);}
    // JPEG/PNG/WebP format names intentionally remain recognizable in upload guidance.
    assert.deepEqual(texts.filter(value=>!/[\u0600-\u06ff]/.test(value)),[],file+' contains untranslated static UI');
  }
  document.body.innerHTML='<select id="status"><option>requested</option><option>completed</option></select><input id="email" type="email" value="customer@example.com"><p id="message">Incorrect password.</p>';
  await settle();
  assert.equal(document.querySelector('#status').options[0].textContent,'طلب جديد');
  assert.equal(document.querySelector('#status').options[0].value,'requested');
  assert.equal(document.querySelector('#status').options[1].value,'completed');
  assert.equal(document.querySelector('#email').value,'customer@example.com');
  assert.equal(document.querySelector('#message').textContent,'كلمة المرور غير صحيحة.');
  document.querySelector('#message').textContent='Welcome, منى.';await settle();assert.equal(document.querySelector('#message').textContent,'مرحبًا، منى.');
  i18n.catalogTranslations({categoryTranslations:{Pendants:'المعلقات'}});assert.equal(locale.translate('Pendants'),'المعلقات');
  assert.equal(locale.productText({name:'Ring',nameAr:'خاتم'}),'خاتم');
  assert.equal(locale.productText({name:'The Eternal Ring'}),'خاتم الخلود');
  assert.equal(locale.getLanguage({getItem:()=>null},'?lang=en'),'en');
  assert.equal(locale.getLanguage({getItem:()=> 'ar'},''),'ar');
  dom.window.close();
});

test('Arabic catalog fields survive server validation without changing identifiers',()=>{
  const catalog=structuredClone(initialCatalog);
  catalog.products[0].nameAr='قلادة ذهبية جديدة';catalog.products[0].materialAr='ذهب عيار ٢١';catalog.categoryTranslations.Necklaces='عقود وقلائد';
  const validated=validateCatalog(catalog);
  assert.equal(validated.products[0].nameAr,'قلادة ذهبية جديدة');assert.equal(validated.products[0].materialAr,'ذهب عيار ٢١');
  assert.equal(validated.products[0].category,'Necklaces');assert.equal(validated.categoryTranslations.Necklaces,'عقود وقلائد');
  catalog.products[0].nameAr='س'.repeat(161);assert.throws(()=>validateCatalog(catalog));
});
