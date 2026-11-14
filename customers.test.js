import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createApp } from './server.js';

test('customer accounts, encrypted ID, isolated history, segments, campaigns and password recovery', async () => {
  const directory = await mkdtemp(path.join(tmpdir(),'happy-customers-'));
  const adminPassword = randomBytes(12).toString('hex'), customerPassword = randomBytes(12).toString('hex');
  const changedPassword = randomBytes(12).toString('hex'), temporaryPassword = randomBytes(12).toString('hex');
  const personalId = 'ID-' + randomBytes(12).toString('hex');
  const messages = [];
  const options = { dataFile:path.join(directory,'catalog.json'), passwordHash:createHash('sha256').update(adminPassword).digest('hex'), mailer:{ready:true,adminEmail:'admin@example.com',appUrl:'https://shop.example.com',send:async message=>{messages.push(message);}} };
  let server = await createApp(options), base;
  async function listen(){server.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}`;}
  const close=()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
  const request=(route,method='GET',data,cookie)=>fetch(base+route,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data?{body:JSON.stringify(data)}:{})});
  async function json(route,method,data,cookie,status=200){const res=await request(route,method,data,cookie);const dataOut=await res.json();assert.equal(res.status,status,JSON.stringify(dataOut));return dataOut;}
  async function loginAdmin(pwd=adminPassword){const res=await request('/api/admin/login','POST',{password:pwd});assert.equal(res.status,200);return res.headers.get('set-cookie').split(';')[0];}
  const profile={name:'Mona Test',email:'mona@example.com',phone:'+201000000000',address:{line1:'10 Gold Street',line2:'',city:'Cairo',region:'Cairo',postalCode:'12345',country:'Egypt'},preferences:['Rings','Gold'],birthDate:'1990-05-10',personalId,marketingConsent:true,password:customerPassword};
  await listen();
  try{
    let admin=await loginAdmin();
    await json('/api/admin/crm','GET',null,null,401);
    const register=await request('/api/account/register','POST',profile);assert.equal(register.status,201);
    const aliceCookie=register.headers.get('set-cookie').split(';')[0];let alice=(await register.json()).customer;
    assert.equal(alice.personalIdLast4,personalId.slice(-4));assert.equal(alice.passwordHash,undefined);assert.equal(alice.personalIdEncrypted,undefined);
    const disk=await readFile(path.join(directory,'customers.json'),'utf8');assert.ok(!disk.includes(personalId));assert.ok(!disk.includes(customerPassword));
    await json('/api/account/register','POST',profile,null,400);
    const second=await request('/api/account/register','POST',{...profile,email:'other@example.com',name:'Other Customer',marketingConsent:false});assert.equal(second.status,201);
    const secondCookie=second.headers.get('set-cookie').split(';')[0],bob=(await second.json()).customer;
    await json('/api/account/orders','GET',null,null,401);
    const requestOrder=await json('/api/account/orders','POST',{items:[{productId:1,quantity:2,unitPrice:1}],status:'completed',total:2},aliceCookie,201);
    assert.equal(requestOrder.order.total,850);assert.equal(requestOrder.order.status,'requested');
    assert.equal((await json('/api/account/orders','GET',null,secondCookie)).orders.length,0);
    await json('/api/admin/crm/orders','PUT',{id:requestOrder.order.id,status:'completed'},admin);
    const history=(await json('/api/account/orders','GET',null,aliceCookie)).orders;assert.equal(history[0].status,'completed');
    await json('/api/admin/crm/orders','POST',{customerId:bob.id,items:[{productId:1,quantity:1}],status:'completed'},admin,201);
    const segment=await json('/api/admin/crm/segments','POST',{name:'Cairo gold buyers',rules:{address:'Cairo',preference:'Gold',minOrders:1,minSpend:400,category:'Necklaces',purchasedAfter:'2020-01-01'}},admin);
    let crm=await json('/api/admin/crm','GET',null,admin);assert.equal(crm.segments[0].count,2);assert.equal(crm.customers.find(c=>c.id===alice.id).totalSpent,850);
    const template=await json('/api/admin/crm/templates','POST',{name:'Golden news',subject:'Hello {{name}}',body:'Dear {{name}}, discover our latest gold.'},admin);
    let preview=await json('/api/admin/crm/campaign-preview','POST',{segmentId:segment.segment.id,templateId:template.template.id},admin);assert.equal(preview.recipients.length,1);assert.equal(preview.excluded,1);assert.equal(messages.length,0);
    await json('/api/admin/crm/campaign-send','POST',{id:preview.id,confirm:true},admin,202);
    for(let i=0;i<100;i++){crm=await json('/api/admin/crm','GET',null,admin);if(crm.campaigns.find(c=>c.id===preview.id).status==='finished')break;await new Promise(resolve=>setTimeout(resolve,10));}
    assert.equal(crm.campaigns.find(c=>c.id===preview.id).sent,1);assert.equal(messages.length,1);assert.equal(messages[0].to,profile.email);assert.match(messages[0].text,/Dear Mona Test/);
    await json('/api/admin/crm/campaign-send','POST',{id:preview.id,confirm:true},admin,400);
    const unsubscribe=/unsubscribe=([a-f0-9]{64})/.exec(messages[0].text)[1];
    await json('/api/auth/unsubscribe','POST',{token:unsubscribe});
    preview=await json('/api/admin/crm/campaign-preview','POST',{segmentId:segment.segment.id,templateId:template.template.id},admin);assert.equal(preview.recipients.length,0);
    await json('/api/admin/crm/customer-reset','POST',{customerId:bob.id,password:temporaryPassword},admin);
    // Reset must affect only the selected customer and revoke that customer's existing sessions.
    assert.ok((await json('/api/account/session','GET',null,aliceCookie)).customer);
    assert.equal((await json('/api/account/session','GET',null,secondCookie)).customer,null);
    await json('/api/account/login','POST',{email:bob.email,password:customerPassword},null,401);
    const tempLogin=await request('/api/account/login','POST',{email:bob.email,password:temporaryPassword});assert.equal(tempLogin.status,200);const tempCookie=tempLogin.headers.get('set-cookie').split(';')[0];
    await json('/api/account/orders','POST',{items:[{productId:1,quantity:1}]},tempCookie,400);
    await json('/api/account/password','POST',{currentPassword:temporaryPassword,password:changedPassword},tempCookie);
    await json('/api/auth/forgot','POST',{role:'customer',email:profile.email});
    const resetToken=/token=([a-f0-9]{64})/.exec(messages.at(-1).text)[1];
    await json('/api/auth/reset','POST',{token:resetToken,password:changedPassword});
    await json('/api/auth/reset','POST',{token:resetToken,password:customerPassword},null,400);
    assert.equal((await json('/api/account/session','GET',null,aliceCookie)).customer,null);
    await json('/api/account/login','POST',{email:profile.email,password:changedPassword});
    await json('/api/admin/password','POST',{currentPassword:adminPassword,password:changedPassword},admin);
    await json('/api/admin/crm','GET',null,admin,401);admin=await loginAdmin(changedPassword);
    await json('/api/auth/forgot','POST',{role:'admin',email:'admin@example.com'});
    const adminToken=/token=([a-f0-9]{64})/.exec(messages.at(-1).text)[1];
    await json('/api/auth/reset','POST',{token:adminToken,password:adminPassword});
    await json('/api/admin/crm','GET',null,admin,401);
    await close();server=await createApp(options);await listen();admin=await loginAdmin();
    crm=await json('/api/admin/crm','GET',null,admin);assert.equal(crm.customers.length,2);assert.equal(crm.orders.length,2);assert.equal(crm.templates.length,1);
    assert.equal(crm.customers[0].unsubscribeHashes,undefined);
  }finally{await close();await rm(directory,{recursive:true,force:true});}
});
