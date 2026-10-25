import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {productionDatabaseTargets,checkProductionReadiness} from '../server/services/releaseReadiness.js';
test('production readiness requires both durable account storage and server authentication',()=>{
 const valid={CLEARFLOW_STORAGE_DATABASE_URL:'postgres://storage',CLEARFLOW_AUTH_DATABASE_URL:'postgres://auth',CLEARFLOW_AUTH_SECRET:'a'.repeat(32)};
 for(const key of Object.keys(valid)){const invalid={...valid};delete invalid[key];assert.throws(()=>productionDatabaseTargets(invalid),/Production requires/);}
 assert.throws(()=>productionDatabaseTargets({...valid,CLEARFLOW_AUTH_SECRET:' '.repeat(32)}));
 assert.equal(productionDatabaseTargets(valid).length,2);
 assert.equal(productionDatabaseTargets({CLEARFLOW_OWNER_DATABASE_URL:'postgres://owner',CLEARFLOW_AUTH_SECRET:'a'.repeat(32)}).length,3);
});
test('nonproduction readiness does not require a live database',async()=>{await checkProductionReadiness({NODE_ENV:'test'});});
test('production server exits before listening when durable/auth configuration is absent',()=>{
 const env={...process.env,NODE_ENV:'production',ENCRYPTION_KEY:'test-vault-key-with-at-least-32-characters',CLEARFLOW_STORAGE_DATABASE_URL:'',CLEARFLOW_AUTH_DATABASE_URL:'',CLEARFLOW_OWNER_DATABASE_URL:'',CLEARFLOW_AUTH_SECRET:''};
 const result=spawnSync(process.execPath,['server.js'],{env,encoding:'utf8',timeout:8000});
 assert.equal(result.error,undefined);assert.notEqual(result.status,0);
 assert.match(result.stderr,/Production requires/);assert.doesNotMatch(result.stdout,/server is running/);
});
