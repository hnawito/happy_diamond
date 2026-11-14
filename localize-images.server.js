// Run while the server is stopped: npm run images:local
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialCatalog, imageURL } from './catalog.js';
import { saveProductImage, localImagePath, MAX_IMAGE_BYTES } from './images.server.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataFile = process.env.CATALOG_FILE || path.join(root,'data','catalog.json');
const directory = process.env.PRODUCT_IMAGE_DIR || path.join(root,'uploads','products');
let catalog;
try { catalog = JSON.parse(await readFile(dataFile,'utf8')); }
catch(e) { if(e.code !== 'ENOENT')throw e;catalog=structuredClone(initialCatalog); }
const mapped = new Map();
for(const product of catalog.products) {
  const images=[];
  for(const value of product.images || [product.image]) {
    if(localImagePath(value)){images.push(value);continue;}
    if(!mapped.has(value)) {
      const url=new URL(imageURL(value));
      if(url.protocol!=='https:' || url.hostname!=='images.unsplash.com')throw new Error('Automatic import supports images.unsplash.com only. Upload other images through the dashboard.');
      const response=await fetch(url,{signal:AbortSignal.timeout(20000),redirect:'error'});
      if(!response.ok)throw new Error(`Image download failed (${response.status}).`);
      const chunks=[];let size=0;
      for await(const chunk of response.body){size+=chunk.length;if(size>MAX_IMAGE_BYTES)throw new Error('Remote image exceeds 5 MB.');chunks.push(chunk);}
      const mime=response.headers.get('content-type')?.split(';')[0];
      mapped.set(value,await saveProductImage(Buffer.concat(chunks),mime,directory));
    }
    images.push(mapped.get(value));
  }
  product.images=images;product.image=images[0];
}
await mkdir(path.dirname(dataFile),{recursive:true});
await writeFile(dataFile+'.tmp',JSON.stringify(catalog,null,2));await rename(dataFile+'.tmp',dataFile);
console.log(`Stored ${mapped.size} images locally; updated ${catalog.products.length} products.`);
