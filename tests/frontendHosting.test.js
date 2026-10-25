import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {mountFrontend} from '../server/services/frontendHosting.js';
test('same-origin frontend serves callback/reload routes while preserving API and asset errors',async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),'clearflow-frontend-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 await writeFile(path.join(directory,'index.html'),'<html>staging-app-shell</html>');
 await writeFile(path.join(directory,'asset.js'),'/* built asset */');
 const app=express();app.get('/health',(_req,res)=>res.json({status:'ok'}));mountFrontend(app,directory);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const request=(route,accept='text/html')=>fetch(`http://127.0.0.1:${server.address().port}${route}`,{headers:{Accept:accept}});
 for(const route of ['/','/bank-return?oauth_state_id=test','/workspace']){const response=await request(route);assert.equal(response.status,200);assert.equal(await response.text(),'<html>staging-app-shell</html>');assert.equal(response.headers.get('cache-control'),'no-store');}
 assert.equal(await (await request('/asset.js')).text(),'/* built asset */');
 for(const route of ['/api/missing','/api','/missing.js'])assert.equal((await request(route)).status,404);
 assert.equal((await request('/workspace','application/json')).status,404);
 assert.deepEqual(await (await request('/health')).json(),{status:'ok'});
});
test('frontend hosting fails before serving when build output is missing',()=>{assert.throws(()=>mountFrontend(express(),'/nonexistent-clearflow-dist'),/Built frontend missing/);});
