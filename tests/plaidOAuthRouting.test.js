import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Execute the app's actual initialization effect and section renderer together.
// Replace auth/storage and page boundaries, not the routing decision under test.
const text = readFileSync(new URL('../src/app/App.tsx', import.meta.url), 'utf8');
const source = ts.createSourceFile('App.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let initialize, renderSection;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect' &&
      node.arguments[0]?.getText(source).includes('initializedSectionUserIdRef.current = currentUserId')) {
    initialize = node.arguments[0].getText(source);
  }
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'renderSection') {
    renderSection = node.initializer.getText(source);
  }
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(initialize); assert.ok(renderSection);
function compile(expression, bindings) {
  const compiled = ts.transpileModule(`return (${expression});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  return new Function(...Object.keys(bindings), compiled)(...Object.values(bindings));
}
function route({oauth=true, status='authenticated', hash='', stored='overview'}={}) {
  let selected, nextHash;
  const AccountingPage = () => {}, LedgerPage = () => {}, OverviewPage = () => {};
  const bindings = {
    auth:{authStatus:status}, currentUserId:'alice', initializedSectionUserIdRef:{current:null},
    window:{location:{hash}}, parseHashSection:value=>value.replace(/^#/,'') || null,
    loadRouteForUser:()=>`#${stored}`, loadSectionForUser:()=>stored,
    resolvePreferredRoute:value=>value, isPlaidOAuthReturn:()=>oauth,
    buildSectionHash:value=>`#${value}`, setActiveSection:value=>{selected=value;},
    replaceWindowHash:value=>{nextHash=value;},
  };
  compile(initialize, bindings)();
  const page = selected ? compile(renderSection, {
    activeSection:selected, React:{createElement:(type,props)=>({type,props})},
    AccountingPage, LedgerPage, OverviewPage, data:{}, scopedData:{}, setData:()=>{},
    activeEntityId:null, auth:{},
  })() : null;
  return {selected,nextHash,page,AccountingPage,LedgerPage};
}
test('OAuth return renders the accounting page that owns the Plaid modal despite a stored ledger route',()=>{
  const result=route({stored:'ledger',hash:'#ledger'});
  assert.equal(result.page.type,result.AccountingPage);
  assert.equal(result.selected,'accounting');
  assert.equal(result.nextHash,'#accounting');
});
test('normal navigation preserves the selected ledger page',()=>{
  const result=route({oauth:false,stored:'accounting',hash:'#ledger'});
  assert.equal(result.page.type,result.LedgerPage);
});
test('OAuth return waits for authentication before initializing a private page',()=>{
  const result=route({status:'unauthenticated'});
  assert.equal(result.page,null);assert.equal(result.nextHash,undefined);
});
