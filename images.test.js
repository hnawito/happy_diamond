import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import sharp from 'sharp';
import { createApp } from './server.js';
import { MAX_IMAGE_BYTES } from './images.server.js';

test('authenticated local image uploads, validation, galleries, file serving and restart persistence', async () => {
  const directory = await mkdtemp(path.join(tmpdir(),'happy-images-'));
  const password = randomBytes(16).toString('hex');
  const imageDirectory = path.join(directory,'uploads');
  const options = {dataFile:path.join(directory,'data','catalog.json'),imageDirectory,passwordHash:createHash('sha256').update(password).digest('hex')};
  let server=await createApp(options),base;
  const close=()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
  async function listen(){server.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}`;}
  const image=await sharp({create:{width:2200,height:1000,channels:3,background:'#bb9955'}}).png().toBuffer();
  const upload=(data,mime='image/png',cookie='',headers={})=>fetch(base+'/api/admin/images',{method:'POST',headers:{'Content-Type':mime,Cookie:cookie,...headers},body:data});
  const save=(catalog,cookie)=>fetch(base+'/api/admin/catalog',{method:'PUT',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(catalog)});
  await listen();
  try{
    assert.equal((await upload(image)).status,401);
    const login=await fetch(base+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
    const cookie=login.headers.get('set-cookie').split(';')[0];
    assert.equal((await upload(image,'image/png',cookie,{Origin:'https://other.example'})).status,403);
    assert.equal((await upload(Buffer.from('<svg/>'),'image/svg+xml',cookie)).status,415);
    assert.equal((await upload(Buffer.from('<svg/>'),'image/png',cookie)).status,400);
    assert.equal((await upload(image,'image/jpeg',cookie)).status,400);
    assert.equal((await upload(Buffer.alloc(MAX_IMAGE_BYTES+1),'image/png',cookie)).status,413);
    const first=await upload(image,'image/png',cookie);assert.equal(first.status,201);const {image:local}=await first.json();
    assert.match(local,/^\/uploads\/products\/[a-f0-9]{32}\.webp$/);
    const bytes=await readFile(path.join(imageDirectory,local.split('/').pop()));
    const metadata=await sharp(bytes).metadata();assert.equal(metadata.format,'webp');assert.equal(metadata.width,2000);assert.equal(metadata.exif,undefined);
    const second=await upload(image,'image/png',cookie);const {image:other}=await second.json();assert.notEqual(local,other);
    let catalog=await fetch(base+'/api/catalog').then(r=>r.json());
    catalog.products=[{...catalog.products[0],image:local,images:[local,other]}];
    let result=await save(catalog,cookie);assert.equal(result.status,200);catalog=await result.json();assert.deepEqual(catalog.products[0].images,[local,other]);
    const bad={...catalog,products:[{...catalog.products[0],image:'/uploads/products/'+ '0'.repeat(32)+'.webp',images:undefined}]};
    assert.equal((await save(bad,cookie)).status,400);
    const response=await fetch(base+local);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/webp');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
    const head=await fetch(base+local,{method:'HEAD'});assert.equal(head.status,200);assert.equal((await head.text()).length,0);
    assert.equal((await fetch(base+'/uploads/products/not-an-image.webp')).status,404);
    assert.equal((await fetch(base+'/uploads/products/%2e%2e%2fdata%2fcustomers.json')).status,404);
    await close();server=await createApp(options);await listen();
    const persisted=await fetch(base+'/api/catalog').then(r=>r.json());assert.deepEqual(persisted.products[0].images,[local,other]);assert.equal((await fetch(base+local)).status,200);
    assert.equal((await readdir(imageDirectory)).length,2);
  }finally{await close();await rm(directory,{recursive:true,force:true});}
});
