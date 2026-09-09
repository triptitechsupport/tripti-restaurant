import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {globalRateLimit, billingReadRateLimit, isBillingRead} from '../src/middleware/global-rate-limit.js';

test('only specific GET monitoring endpoints use the read budget', () => {
  assert.equal(isBillingRead({method:'GET',path:'/billing/settlements'}),true);
  assert.equal(isBillingRead({method:'POST',path:'/billing/settlements'}),false);
  assert.equal(isBillingRead({method:'GET',path:'/billing/dep7'}),false);
});
test('polling has its own bounded quota and does not exhaust mutations', async () => {
  const app=express(); app.use(globalRateLimit); app.use(billingReadRateLimit);
  app.use((_req,res)=>res.json({ok:true}));
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const url=`http://127.0.0.1:${server.address().port}`;
  try {
    for(let i=0;i<1200;i++) {
      const r=await fetch(`${url}/billing/settlements`); await r.text(); assert.equal(r.status,200);
    }
    const limited=await fetch(`${url}/billing/settlements`);await limited.text();assert.equal(limited.status,429);
    const mutation=await fetch(`${url}/billing/orders/example/generate`,{method:'POST'});await mutation.text();assert.equal(mutation.status,200);
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
