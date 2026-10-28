import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/services/runtimeConfig.service.ts',import.meta.url),'utf8').replaceAll('import.meta.env','({})');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function config(origin,env={}){const exports={};const url=new URL(origin);new Function('exports','window',code)(exports,{location:{origin,hostname:url.hostname,protocol:url.protocol},localStorage:{getItem:()=>null},process:{env}});return exports;}
test('Render-hosted browser staging uses its own origin rather than an invented API subdomain',()=>{
 const origin='https://clearflow-browser-staging.onrender.com';
 assert.equal(config(origin).getApiBaseUrl(),origin);
});
test('explicit API configuration still overrides same-origin hosting',()=>{
 assert.equal(config('https://clearflow-browser-staging.onrender.com',{VITE_API_BASE_URL:'https://api.example.test'}).getApiBaseUrl(),'https://api.example.test');
});
