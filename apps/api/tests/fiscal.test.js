import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Ajv from 'ajv';
import {buildReceipt, cancellationPayload} from '../src/services/fiscalReceipt.js';
import {createBillingService} from '../src/services/billingService.js';
import {createFiskalyClient, FiscalError} from '../src/services/fiskalyClient.js';
import {OUTAGE_NOTICE} from '../src/services/fiscalFallback.js';
import {fiscalPrintModel} from '../../web/src/lib/fiscalPrintModel.js';
const company = {name: 'TEST', address: 'TEST', vatId: 'ATU12345678'};
const kots = [{id:'k1',status:'completed',items:[{id:'food',name:'Food',quantity:2,price:10.1,cleared:true}, {id:'drink',name:'Drink',quantity:1,price:3} ]},
  {id:'k2',status:'cancelled',items:[{name:'Cancelled',quantity:1,price:99}]}];
const menu = [{id:'food',vat_Rate:'REDUCED_1'}, {id:'drink',vat_Rate:'STANDARD'}];
test('paid lines remain; cancelled KOTs are excluded; mixed VAT totals match', () => {
  const result = buildReceipt(kots, menu, 'CARD', 'order', company);
  assert.equal(result.amount,23.2);
  assert.deepEqual(result.requestPayload.schema.standard_v1.amounts_per_vat_rate,[{vat_rate:'REDUCED_1',amount:'20.20'},{vat_rate:'STANDARD',amount:'3.00'}]);
  assert.equal(result.requestPayload.schema.standard_v1.amounts_per_payment_type[0].payment_type,'NON_CASH');
});
test('payload matches the official SIGN AT standard_v1 schema', () => {
  const spec = JSON.parse(fs.readFileSync(new URL('../../../docs/rksv/sign-at.openapi.json', import.meta.url)));
  const schema = structuredClone(spec.components.schemas.ReceiptSchemaStandardV1);
  schema.properties.amounts_per_vat_rate.items.properties.vat_rate = spec.components.schemas.VatRateContainer;
  const validate = new Ajv().compile(schema);
  assert.equal(validate(buildReceipt(kots,menu,'CASH','order',company).requestPayload.schema.standard_v1),true,JSON.stringify(validate.errors));
});
test('missing VAT, invalid quantity and precision are rejected', () => {
  assert.throws(() => buildReceipt(kots,[],'CASH','order',company), /VAT/);
  assert.throws(() => buildReceipt([{items:[{quantity:0,price:1,vat_Rate:'ZERO'}]}],[],'CASH','order',company), /quantities/);
  assert.throws(() => buildReceipt([{items:[{quantity:1,price:1.001,vat_Rate:'ZERO'}]}],[],'CASH','order',company), /decimals/);
});
test('VAT snapshots take precedence over subsequent menu changes', () => {
  const copy = structuredClone(kots); copy[0].items[0].vat_Rate='STANDARD';
  assert.deepEqual(buildReceipt(copy,menu,'CASH','order',company).requestPayload.schema.standard_v1.amounts_per_vat_rate,[{vat_rate:'STANDARD',amount:'23.20'}]);
});
test('cancellation reverses quantities, VAT and payment totals and retains original', () => {
  const original = {...buildReceipt(kots,menu,'CASH','order',company),fiskalyReceiptId:'uuid'};
  const reversed = cancellationPayload(original);
  assert.equal(reversed.receipt_type,'CANCELLATION');
  assert.equal(reversed.schema.standard_v1.line_items[0].quantity,'-2');
  assert.equal(reversed.schema.standard_v1.amounts_per_payment_type[0].amount,'-23.20');
  assert.equal(original.requestPayload.schema.standard_v1.line_items[0].quantity,'2');
});
const cfg = () => ({enabled:true, environment:'TEST'});
function engine(remote, failSave = false) {
  const transaction = {...buildReceipt(kots, menu, 'CASH', 'order', company), id:'tx',cashRegister:'reg',fiskalyReceiptId:'stable-uuid',orderId:'order',paymentType:'CASH',receiptType:'NORMAL',status:'pending'};
  const db = {collection: name => ({getOne: async () => name === 'fiskaly_transactions' ? structuredClone(transaction) : ({fiskalyCashRegisterId:'reg-uuid',environment:'TEST'}),
    update: async (_id,data) => {if (failSave && data.status === 'signed') {failSave=false;throw new Error('Database unavailable');} Object.assign(transaction,data);return {...transaction};}})};
  return {service:createBillingService({db,remote,config:cfg}),transaction,db};
}
const signed = {signed:true,qr_code_data:'qr',receipt_number:'42',time_signature:1234567890};
test('timeout queues and retries the same UUID and frozen payload', async () => {
  const calls=[]; let first=true;
  const {service,transaction}=engine(async (path,options) => { calls.push({path,options}); if (!options) throw new FiscalError('missing',404); if(first){first=false;throw new FiscalError('timeout',503,true);}return signed; });
  await service.process(transaction); assert.equal(transaction.status,'queued');
  await service.process(transaction); assert.equal(transaction.status,'signed');
  assert.equal(new Set(calls.map(c=>c.path)).size,1);
  assert.deepEqual(calls.filter(c=>c.options).map(c=>c.options.body),[transaction.requestPayload,transaction.requestPayload]);
});
test('remote success + database failure is recovered by GET without another PUT', async () => {
  let puts=0; let exists=false;
  const {service,transaction}=engine(async (_path,options) => {if(options){puts++;exists=true;return signed;}if(exists)return signed;throw new FiscalError('missing',404);},true);
  await service.process(transaction); assert.equal(transaction.status,'queued');
  assert.equal(transaction.fallbackReceipt, undefined, 'database save errors are not SIGN AT outages');
  await service.process(transaction); assert.equal(transaction.status,'signed'); assert.equal(puts,1);
});
test('SCU outage receipt is retained with its notice and is not re-signed', async () => {
  const receipt={...signed,signed:false,hints:['Sicherheitseinrichtung ausgefallen']};
  const {service,transaction}=engine(async()=>receipt);
  await service.process(transaction); assert.equal(transaction.status,'outage'); assert.deepEqual(transaction.responsePayload.hints,receipt.hints);
});
test('environment guard rejects LIVE credentials before any receipt mutation', async () => {
  let calls=0;
  const client=createFiskalyClient({config:cfg,credentials:()=>({api_key:'test',api_secret:'test'}),fetchImpl:async()=>{calls++;return {ok:true,json:async()=>({access_token:'abc',access_token_claims:{env:'LIVE'}})};}});
  await assert.rejects(client('/cash-register/x',{method:'PUT',body:{}}),/environment/); assert.equal(calls,1);
});


test('outage copy is saved once and survives restart and late signing with the same UUID', async () => {
  const calls = [];
  const {service, transaction, db} = engine(async (path) => {
    calls.push(path); throw new FiscalError('network down', 503, true, true);
  });
  const payload = structuredClone(transaction.requestPayload);
  await service.process(transaction);
  const saved = structuredClone(transaction.fallbackReceipt);
  assert.equal(transaction.status, 'queued');
  assert.equal(saved.qrCodeData, OUTAGE_NOTICE);
  assert.equal(saved.notice, OUTAGE_NOTICE);
  assert.equal(saved.environment, 'TEST');
  assert.equal(saved.reference, 'OUT-stable-uuid');
  assert.deepEqual(saved.receiptSnapshot, transaction.receiptSnapshot);
  await service.process(transaction);
  assert.deepEqual(transaction.fallbackReceipt, saved);
  const restarted = createBillingService({db, config: cfg, remote: async (path, options) => {
    calls.push(path);
    if (!options) throw new FiscalError('not found', 404);
    assert.deepEqual(options.body, payload);
    return signed;
  }});
  await restarted.process(transaction);
  assert.equal(transaction.status, 'signed');
  assert.deepEqual(transaction.fallbackReceipt, saved);
  assert.deepEqual(transaction.requestPayload, payload);
  assert.equal(new Set(calls).size, 1);
  const copy = fiscalPrintModel({...transaction, printVariant:'fallback'});
  assert.equal(copy.status, 'fallback');
  assert.equal(copy.signedAt, saved.issuedAt);
  assert.equal(copy.fiskalyReceiptNumber, undefined);
  assert.equal(copy.responsePayload.cash_register_serial_number, undefined);
  assert.equal(copy.qrCodeData, OUTAGE_NOTICE);
  assert.equal(fiscalPrintModel(transaction).qrCodeData, 'qr');
});

test('ambiguous signing timeout retains outage copy, then reconciles without another PUT', async () => {
  let exists = false; let puts = 0;
  const {service, transaction} = engine(async (_path, options) => {
    if (!options) { if (exists) return signed; throw new FiscalError('not found', 404); }
    puts++; exists = true;
    throw new FiscalError('response lost', 503, true, true);
  });
  await service.process(transaction);
  assert(transaction.fallbackReceipt);
  await service.process(transaction);
  assert.equal(transaction.status, 'signed');
  assert.equal(puts, 1);
});

test('permanent rejection does not issue a fallback; existing outage copy survives rejection', async () => {
  let outage = false;
  const {service, transaction} = engine(async () => {
    if (outage) throw new FiscalError('offline', 503, true, true);
    throw new FiscalError('invalid receipt', 400);
  });
  await service.process(transaction);
  assert.equal(transaction.status, 'failed');
  assert.equal(transaction.fallbackReceipt, undefined);
  outage = true; await service.process(transaction);
  const copy = structuredClone(transaction.fallbackReceipt);
  outage = false; await service.process(transaction);
  assert.equal(transaction.status, 'failed');
  assert.deepEqual(transaction.fallbackReceipt, copy);
});

test('cancellation outage copy retains negative amounts, VAT, reason and receipt type', async () => {
  const {service, transaction} = engine(async () => {throw new FiscalError('offline', 503, true, true);});
  transaction.requestPayload = cancellationPayload(transaction);
  transaction.receiptType = 'CANCELLATION'; transaction.amount *= -1;
  transaction.receiptSnapshot.lines.forEach(line => {line.quantity = String(-Number(line.quantity));});
  transaction.receiptSnapshot.vatTotals = transaction.requestPayload.schema.standard_v1.amounts_per_vat_rate;
  transaction.receiptSnapshot.cancellationReason = 'Duplicate order';
  await service.process(transaction);
  const copy = fiscalPrintModel({...transaction, printVariant: 'fallback'});
  assert.equal(copy.receiptType, 'CANCELLATION');
  assert.equal(copy.amount, -23.2);
  assert.equal(copy.receiptSnapshot.lines[0].quantity, '-2');
  assert.equal(copy.receiptSnapshot.vatTotals[0].amount, '-20.20');
  assert.equal(copy.receiptSnapshot.cancellationReason, 'Duplicate order');
});

test('no printable fallback is exposed if the database cannot retain the copy', async () => {
  const {transaction} = engine(async () => {});
  const service = createBillingService({config: cfg, remote: async () => {throw new FiscalError('offline',503,true,true);},
    db: {collection: name => ({getOne: async () => name === 'fiskaly_transactions' ? structuredClone(transaction) : ({environment:'TEST',fiskalyCashRegisterId:'reg'}), update: async () => {throw new Error('DB unavailable');}})}});
  await assert.rejects(service.process(transaction), /DB unavailable/);
  assert.equal(fiscalPrintModel({...transaction, printVariant:'fallback'}), null);
});

for (const status of [400, 401, 403, 408, 429, 500, 502, 503, 504]) {
  test(`HTTP ${status} classification preserves status even for non-JSON errors`, async () => {
    const client = createFiskalyClient({config: cfg, credentials: () => ({api_key:'x',api_secret:'y'}),
      fetchImpl: async () => ({ok:false,status,json:async()=>{throw new SyntaxError('HTML response');}})});
    await assert.rejects(client('/cash-register/test'), error => {
      assert.equal(error.status,status);
      assert.equal(error.outageEligible,[408,429].includes(status) || status >= 500);
      return true;
    });
  });
}

test('network failure is fallback eligible; missing credentials and environment mismatch are not', async () => {
  const options = {config:cfg,credentials:()=>({api_key:'x',api_secret:'y'})};
  const offline = createFiskalyClient({...options,fetchImpl:async()=>{throw new TypeError('fetch failed');}});
  await assert.rejects(offline('/test'), e => e.outageEligible && e.retryable);
  const missing = createFiskalyClient({...options,credentials:()=>({})});
  await assert.rejects(missing('/test'), e => !e.outageEligible && !e.retryable);
  const mismatch = createFiskalyClient({...options,fetchImpl:async()=>({ok:true,json:async()=>({access_token_claims:{env:'LIVE'}})})});
  await assert.rejects(mismatch('/test'), e => !e.outageEligible && e.status === 409);
});

test('backed-off queue entries do not prevent later orders from retaining outage copies', async () => {
  const base = engine(async () => {}).transaction;
  const rows = [
    {...structuredClone(base),id:'old',status:'queued',nextRetryAt:new Date(Date.now()+60000).toISOString()},
    {...structuredClone(base),id:'new1',fiskalyReceiptId:'new-uuid-1'},
    {...structuredClone(base),id:'new2',fiskalyReceiptId:'new-uuid-2'},
  ];
  const db = {collection: name => name === 'cash_registers'
    ? {getOne:async()=>({environment:'TEST',fiskalyCashRegisterId:'reg'})}
    : {getOne:async id=>structuredClone(rows.find(t=>t.id===id)),getFullList:async()=>rows,update:async(id,data)=>Object.assign(rows.find(t=>t.id===id),data)}};
  const service = createBillingService({db,config:cfg,remote:async()=>{throw new FiscalError('offline',503,true,true);}});
  await service.drain();
  assert.equal(rows[0].fallbackReceipt,undefined);
  assert(rows[1].fallbackReceipt); assert(rows[2].fallbackReceipt);
  assert.notEqual(rows[1].fallbackReceipt.reference,rows[2].fallbackReceipt.reference);
});

function remoteError(path, method, status, code) {
  return Object.assign(new FiscalError(code, status), {code, remotePath:path, remoteMethod:method});
}
function recoveryEngine() {
  let exists = false; let unavailable = false; let lookupCode = 'E_RECEIPT_NOT_FOUND';
  const calls = []; let released = 0;
  const {transaction, db} = engine(async () => {});
  const remote = async (path, options) => {
    calls.push({path, method: options?.method || 'GET'});
    if (unavailable) throw new FiscalError('offline',503,true,true);
    if (!path.includes('/receipt/')) return {_env:'TEST',state:'INITIALIZED'};
    if (options) throw remoteError(path, 'PUT', 400, 'E_BAD_REQUEST');
    if (exists) return signed;
    throw remoteError(path, 'GET', 404, lookupCode);
  };
  db.send = async (_path, {body}) => {
    assert.equal(body.proof.receiptId,transaction.fiskalyReceiptId);
    assert.equal(body.proof.code,'E_RECEIPT_NOT_FOUND');
    released++;
    Object.assign(transaction,{status:'superseded',businessReceiptKey:'SUPERSEDED:tx',recoveryDetails:body});
    return structuredClone(transaction);
  };
  const service = createBillingService({db,remote,config:cfg});
  return {transaction,service,calls,get released(){return released;},setExists:()=>{exists=true;},
    setUnavailable:()=>{unavailable=true;},setLookupCode:code=>{lookupCode=code;}};
}

test('confirmed rejected receipt can be archived only after a fresh register and receipt check', async () => {
  const context = recoveryEngine(); const {transaction,service} = context;
  await service.process(transaction);
  assert.equal(transaction.failureDetails.recoverable,true);
  const original = structuredClone(transaction.requestPayload);
  const result = await service.recover(transaction.id,'admin','Correct rejected details');
  assert.equal(result.outcome,'released'); assert.equal(transaction.status,'superseded');
  assert.equal(context.released,1);
  assert.deepEqual(transaction.requestPayload,original);
  assert.deepEqual(context.calls.slice(-2).map(c=>c.method),['GET','GET']);
  assert(context.calls.at(-2).path.endsWith('/cash-register/reg-uuid'));
  const callCount = context.calls.length;
  await service.process({...transaction,status:'queued'});
  assert.equal(context.calls.length,callCount,'stale queue entry must never sign a released UUID');
  await assert.rejects(service.retry(transaction.id),/released/);
  await service.recover(transaction.id,'admin','duplicate click');
  assert.equal(context.released,1,'duplicate recovery is idempotent');
});

test('recovery reconciles an existing remote receipt rather than releasing the order', async () => {
  const context = recoveryEngine();
  await context.service.process(context.transaction); context.setExists();
  const result = await context.service.recover('tx','admin','Correct details');
  assert.equal(result.outcome,'reconciled'); assert.equal(context.transaction.status,'signed');
  assert.equal(context.released,0);
});

test('outage and unrelated 404 errors never authorize releasing a rejected receipt', async () => {
  for (const kind of ['offline','E_CASH_REGISTER_NOT_FOUND','UNKNOWN_404']) {
    const context = recoveryEngine(); await context.service.process(context.transaction);
    if (kind === 'offline') context.setUnavailable(); else context.setLookupCode(kind);
    await assert.rejects(context.service.recover('tx','admin','Correct details'));
    assert.equal(context.released,0); assert.equal(context.transaction.status,'failed');
  }
});

test('recovery refuses issued copies, unknown failures, empty reasons and queued requests', async () => {
  for (const patch of [{fallbackReceipt:{reference:'issued'}},{failureDetails:null},{status:'queued'},{status:'signed'}]) {
    const context = recoveryEngine(); await context.service.process(context.transaction);
    Object.assign(context.transaction,patch);
    const count = context.calls.length;
    await assert.rejects(context.service.recover('tx','admin','Correct details'), /Only a confirmed/);
    assert.equal(context.calls.length,count); assert.equal(context.released,0);
  }
  const context = recoveryEngine(); await context.service.process(context.transaction);
  await assert.rejects(context.service.recover('tx','admin',' '),/reason/);
});

test('auth request errors cannot masquerade as rejected receipt payloads', async () => {
  const {service,transaction} = engine(async (path, options) => {
    if (!options) throw new FiscalError('not found',404);
    throw remoteError('/auth','POST',400,'E_BAD_REQUEST');
  });
  await service.process(transaction);
  assert.equal(transaction.status,'failed'); assert.equal(transaction.failureDetails.recoverable,false);
});

test('retry and stale processing cannot race a successful recovery', async () => {
  const context = recoveryEngine(); await context.service.process(context.transaction);
  const stale = structuredClone(context.transaction);
  const results = await Promise.allSettled([
    context.service.recover('tx','admin','Correct details'),
    context.service.retry('tx'),
    context.service.process(stale),
  ]);
  assert.equal(results[0].status,'fulfilled');
  assert.equal(results[1].status,'rejected');
  assert.equal(results[2].value.status,'superseded');
  assert.equal(context.calls.filter(call=>call.method==='PUT').length,1,'only initial rejected PUT');
});

test('queue continues after failed persistence, failed lookup and a mismatched environment', async () => {
  const base = engine(async () => {}).transaction;
  const rows = ['bad-save','bad-lookup','wrong-env','healthy'].map(id=>({...structuredClone(base),id,fiskalyReceiptId:id,cashRegister:id}));
  const reports = []; const putIds = [];
  const db = {collection:name => name === 'cash_registers'
    ? {getOne:async id=>({environment:id==='wrong-env'?'LIVE':'TEST',fiskalyCashRegisterId:id})}
    : {getFullList:async()=>structuredClone(rows),getOne:async id=>{
      if(id==='bad-lookup') throw new Error('Read unavailable'); return structuredClone(rows.find(t=>t.id===id));
    },update:async(id,data)=>{
      if(id==='bad-save') throw new Error('Write unavailable'); return Object.assign(rows.find(t=>t.id===id),data);
    }}};
  const service = createBillingService({db,config:cfg,onQueueError:id=>reports.push(id),remote:async(path,options)=>{
    if(!options) throw new FiscalError('not found',404); putIds.push(path); return signed;
  }});
  await service.drain();
  assert.deepEqual(reports,['bad-save','bad-lookup']);
  assert.equal(rows[2].status,'failed'); assert.equal(rows[2].failureDetails.recoverable,false);
  assert.equal(rows[3].status,'signed');
  assert(!putIds.some(path=>path.includes('wrong-env')));
});

test('Fiskaly error code and source operation survive client handling', async () => {
  const client = createFiskalyClient({config:cfg,credentials:()=>({api_key:'x',api_secret:'y'}),fetchImpl:async url=>
    url.endsWith('/auth') ? {ok:true,json:async()=>({access_token:'test',access_token_expires_at:9999999999,access_token_claims:{env:'TEST'}})}
    : {ok:false,status:400,json:async()=>({code:'E_BAD_REQUEST',message:'Invalid amount'})}});
  await assert.rejects(client('/cash-register/reg/receipt/uuid',{method:'PUT',body:{}}),error=>{
    assert.equal(error.code,'E_BAD_REQUEST'); assert.equal(error.remoteMethod,'PUT');
    assert.equal(error.remotePath,'/cash-register/reg/receipt/uuid'); return true;
  });
});

// All LIVE fixtures below use a mocked transport. No production API calls.
const liveConfig = () => ({enabled:true,environment:'LIVE',liveConfirmed:true,credentialsConfigured:true,
  registerId:'91fd570f-18db-4cc2-92a2-a53ba18f46c6',scuId:'693ca03e-0dc5-4d36-9e5c-61d9832618d5',
  company:{name:'Tripti Genusswelt GmbH',address:'Hauptstraße 42, 1010 Wien',vatId:'ATU65432109'}});
const liveCredentials = () => ({api_key:'opaque-key',api_secret:'opaque-secret'});

test('LIVE configuration never inherits development company defaults', async () => {
  const {readFiscalConfig,fiscalReadiness} = await import('../src/services/fiscalReadiness.js');
  const live = readFiscalConfig({FISKALY_ENABLED:'true',FISKALY_ENVIRONMENT:'LIVE'});
  assert.deepEqual(live.company,{name:'',address:'',vatId:''});
  assert.equal(fiscalReadiness(live).ready,false);
  const development = readFiscalConfig({FISKALY_ENABLED:'true',FISKALY_ENVIRONMENT:'TEST'});
  assert.match(development.company.name,/DEVELOPMENT/);
  assert.equal(fiscalReadiness(development).ready,true);
  assert.equal(fiscalReadiness(readFiscalConfig({FISKALY_ENABLED:'true',FISKALY_ENVIRONMENT:'LIV'})).ready,false);
});

test('dummy/missing details, invalid IDs, credentials and missing confirmation block LIVE before auth', async () => {
  const variants = [
    {company:{...liveConfig().company,name:'Tripti Genusswelt — DEVELOPMENT'}},
    {company:{...liveConfig().company,address:'Musterstraße 1, 1010 Wien'}},
    {company:{...liveConfig().company,name:'Your Restaurant'}},
    {company:{...liveConfig().company,address:'   '}},
    {company:{...liveConfig().company,vatId:'ATU12345678'}},
    {company:{...liveConfig().company,vatId:'ATU00000000'}},
    {company:{...liveConfig().company,vatId:'ATU87654321'}},
    {company:{...liveConfig().company,vatId:'invalid'}},
    {registerId:'not-a-uuid'}, {scuId:''}, {scuId:liveConfig().registerId},
    {liveConfirmed:false}, {environment:'PRODUCTION'},
  ];
  for(const patch of variants) {
    let calls=0;
    const client=createFiskalyClient({config:()=>({...liveConfig(),...patch}),credentials:liveCredentials,fetchImpl:async()=>{calls++;throw new Error('Should not call');}});
    await assert.rejects(client('/cash-register/x',{method:'PUT',body:{}}),error=>!error.retryable && !error.outageEligible);
    assert.equal(calls,0,JSON.stringify(patch));
  }
  for(const credentials of [()=>({}),()=>({api_key:'<LIVE key>',api_secret:'<LIVE secret>'})]) {
    let calls=0;const client=createFiskalyClient({config:liveConfig,credentials,fetchImpl:async()=>{calls++;}});
    await assert.rejects(client('/configuration'));assert.equal(calls,0);
  }
});

test('invalid LIVE generation does not write or lock an order', async () => {
  let dbCalls=0;
  const service=createBillingService({config:()=>({...liveConfig(),liveConfirmed:false}),
    db:{collection:()=>{dbCalls++;throw new Error('Must not access database');}},remote:async()=>{throw new Error('Must not contact Fiskaly');}});
  await assert.rejects(service.generate('order','CASH','admin'),/LIVE_CONFIRMED/);
  assert.equal(dbCalls,0);
});

test('saved dummy receipt is not sent to LIVE or converted to an outage receipt', async () => {
  const tx=engine(async()=>{}).transaction;let remoteCalls=0;
  const db={collection:name=>name==='cash_registers'?{getOne:async()=>({environment:'LIVE',fiskalyCashRegisterId:liveConfig().registerId})}
    :{getOne:async()=>structuredClone(tx),update:async(_id,data)=>Object.assign(tx,data)}};
  const service=createBillingService({db,config:liveConfig,remote:async()=>{remoteCalls++;}});
  await service.process(tx);
  assert.equal(tx.status,'failed');assert.equal(tx.fallbackReceipt,undefined);
  assert.match(tx.errorMessage,/Saved receipt/);assert.equal(remoteCalls,0);
});

test('valid mocked LIVE configuration signs only with a LIVE token', async () => {
  const calls=[];
  const client=createFiskalyClient({config:liveConfig,credentials:liveCredentials,fetchImpl:async(url,options)=>{
    calls.push({url,options});return {ok:true,json:async()=>url.endsWith('/auth')
      ? {access_token:'live-token',access_token_expires_at:9999999999,access_token_claims:{env:'LIVE'}} : {_env:'LIVE',...signed}};
  }});
  await client('/cash-register/x/receipt/y',{method:'PUT',body:{}});
  assert.equal(calls.length,2);assert.equal(calls[1].options.headers.Authorization,'Bearer live-token');
});

test('cached TEST token cannot be reused after switching configuration to LIVE', async () => {
  let configuration={enabled:true,environment:'TEST'};const calls=[];
  const client=createFiskalyClient({config:()=>configuration,credentials:liveCredentials,fetchImpl:async(url)=>{
    calls.push(url);return {ok:true,json:async()=>url.endsWith('/auth')
      ? {access_token:'test-token',access_token_expires_at:9999999999,access_token_claims:{env:'TEST'}} : {_env:'TEST'}};
  }});
  await client('/configuration');configuration=liveConfig();
  await assert.rejects(client('/cash-register/x',{method:'PUT',body:{}}),/environment/);
  assert.equal(calls.filter(url=>url.endsWith('/auth')).length,2);
  assert.equal(calls.filter(url=>url.endsWith('/cash-register/x')).length,0);
});

test('cached token does not bypass a later invalid merchant configuration', async () => {
  let configuration=liveConfig();let calls=0;
  const client=createFiskalyClient({config:()=>configuration,credentials:liveCredentials,fetchImpl:async(url)=>{
    calls++;return {ok:true,json:async()=>url.endsWith('/auth')
      ? {access_token:'live-token',access_token_expires_at:9999999999,access_token_claims:{env:'LIVE'}} : {_env:'LIVE'}};
  }});
  await client('/configuration');configuration={...configuration,company:{...configuration.company,address:''}};
  await assert.rejects(client('/cash-register/x',{method:'PUT',body:{}}),/configuration blocked/);
  assert.equal(calls,2);
});

test('configuration becoming invalid during authentication prevents the resource request', async () => {
  let configuration=liveConfig();let calls=0;
  const client=createFiskalyClient({config:()=>configuration,credentials:liveCredentials,fetchImpl:async()=>{
    calls++;configuration={...configuration,liveConfirmed:false};
    return {ok:true,json:async()=>({access_token:'live-token',access_token_expires_at:9999999999,access_token_claims:{env:'LIVE'}})};
  }});
  await assert.rejects(client('/cash-register/x',{method:'PUT',body:{}}),/LIVE_CONFIRMED/);
  assert.equal(calls,1);
});

test('changing credentials in the same environment invalidates cached authentication', async () => {
  let credentials=liveCredentials();let authentications=0;const tokens=[];
  const client=createFiskalyClient({config:liveConfig,credentials:()=>credentials,fetchImpl:async(url,options)=>{
    if(url.endsWith('/auth')){authentications++;return {ok:true,json:async()=>({access_token:`token-${authentications}`,access_token_expires_at:9999999999,access_token_claims:{env:'LIVE'}})};}
    tokens.push(options.headers.Authorization);return {ok:true,json:async()=>({_env:'LIVE'})};
  }});
  await client('/configuration');credentials={...credentials,api_secret:'rotated-secret'};await client('/configuration');
  assert.deepEqual(tokens,['Bearer token-1','Bearer token-2']);
});

test('old TEST transactions are not returned as existing LIVE bills', async () => {
  const transaction=engine(async()=>{}).transaction;
  const service=createBillingService({config:liveConfig,db:{filter:()=>'',collection:name=>name==='fiskaly_transactions'
    ? {getFullList:async()=>[transaction]} : {getOne:async()=>({environment:'TEST'})}}});
  await assert.rejects(service.generate('order','CASH','admin'),/different environment/);
});
