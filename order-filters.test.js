import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterOrders } from './order-filters.js';
const customers=[{id:'a',name:'Mona',email:'mona@example.com',phone:'01012345678'},{id:'b',name:'Ali',email:'ali@example.com'}];
const orders=[
 {id:'order-one',customerId:'a',status:'completed',createdAt:'2026-11-01T23:59:00Z',total:250,items:[{name:'Gold ring'}],address:{city:'Cairo'}},
 {id:'order-two',customerId:'b',status:'requested',createdAt:'2026-11-14T10:00:00Z',total:100,items:[{name:'Bracelet'}],address:{city:'Giza'}},
 {id:'order-three',customerId:'a',status:'completed',createdAt:'2026-11-14T23:59:59Z',total:500,items:[{name:'Gold necklace'}],address:{city:'Cairo'}}
];
const ids=filters=>filterOrders(orders,customers,filters).orders.map(o=>o.id);
test('all orders, case-insensitive search and customer/status filtering',()=>{
 assert.deepEqual(ids({}),['order-three','order-two','order-one']);
 for(const search of ['MONA','mona@example.com','01012345678','Cairo'])assert.equal(ids({search}).length,2);
 assert.deepEqual(ids({search:'bracelet'}),['order-two']);
 assert.deepEqual(ids({search:'order-three'}),['order-three']);
 assert.deepEqual(ids({customerId:'a',status:'completed',search:'necklace'}),['order-three']);
 assert.deepEqual(ids({customerId:'b',status:'completed'}),[]);
});
test('inclusive dates and amounts, combined criteria and validation',()=>{
 assert.deepEqual(ids({from:'2026-11-14',to:'2026-11-14'}),['order-three','order-two']);
 assert.deepEqual(ids({customerId:'a',status:'completed',from:'2026-11-01',to:'2026-11-14',minTotal:'250',maxTotal:'250'}),['order-one']);
 for(const filters of [{from:'2026-11-14',to:'2026-11-01'},{minTotal:'500',maxTotal:'100'},{minTotal:'-1'},{maxTotal:'no'}])assert.ok(filterOrders(orders,customers,filters).error);
});
test('sorting does not mutate the source order list',()=>{
 assert.deepEqual(ids({sort:'lowest'}),['order-two','order-one','order-three']);
 assert.deepEqual(ids({sort:'highest'}),['order-three','order-one','order-two']);
 assert.deepEqual(ids({sort:'oldest'}),['order-one','order-two','order-three']);
 assert.deepEqual(orders.map(o=>o.id),['order-one','order-two','order-three']);
});
