import test from 'node:test';
import assert from 'node:assert/strict';
import {runMembershipAccrual} from './membershipBillingPersistence.js';

test('accepts a valid UTC billing date and returns an empty batch',async()=>{
  const db={query:async()=>({rows:[]})};
  assert.deepEqual(await runMembershipAccrual(db,'2026-10-25'),[]);
});
test('rejects malformed and impossible dates',async()=>{
  const db={query:async()=>({rows:[]})};
  for(const date of ['2026-02-30','2026-13-01','2026-10-2','not-a-date']){
    await assert.rejects(()=>runMembershipAccrual(db,date),/Invalid UTC billing date/);
  }
});
test('an already billed period does not add ledger entries',async()=>{
  const queries=[];
  const client={
    query:async(sql)=>{queries.push(sql);
      if(sql.startsWith('SELECT id,status'))return {rowCount:1,rows:[{id:'s1',status:'active'}]};
      if(sql.startsWith('INSERT INTO membership_invoices'))return {rowCount:0,rows:[]};
      return {rowCount:0,rows:[]};
    },release:()=>{}
  };
  const db={connect:async()=>client};
  const sub={id:'s1',plan_id:'p',amount_cents:3300,currency:'USD',billing_day:25,status:'active',member_entity_id:'m',owner_entity_id:'c'};
  const {accrueMembershipMonth}=await import('./membershipBillingPersistence.js');
  const result=await accrueMembershipMonth(db,sub,{year:2026,month:10,today:'2026-10-25'});
  assert.equal(result.reason,'already_billed');
  assert.equal(queries.filter(q=>q.startsWith('INSERT INTO membership_journal_entries')).length,0);
});
