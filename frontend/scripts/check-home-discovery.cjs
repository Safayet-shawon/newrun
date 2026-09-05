// Focused regression checks; no server, database, or network is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
function load(relative) {
  const filename = path.resolve(__dirname, '..', relative);
  const code = babel.transformSync(fs.readFileSync(filename, 'utf8'), {filename, babelrc:false, configFile:false, plugins:['@babel/plugin-transform-modules-commonjs']}).code;
  const exports = {};
  const localRequire = name => {
    if (name === '@/lib/api') return {api:{get(){throw new Error('Network must not be called in these tests');}}};
    if (name === '@/lib/format') return {effectivePrice:p=>p.discount_price ?? p.price};
    if (name === '@/context/AuthContext') return {useAuth:()=>({user:null})};
    return require(name);
  };
  vm.runInNewContext(code, {exports, require:localRequire, process:{env:{}}}, {filename});
  return exports;
}
const {selectDemoProducts, initialFilters, buildProductParams, PAGE_SIZE} = load('src/components/home/useHomeDiscovery.js');
const {demoProducts} = load('src/content/homeDemo.js');
const all = selectDemoProducts(demoProducts,initialFilters);
const second = selectDemoProducts(demoProducts,{...initialFilters,page:2});
assert.equal(all.items.length,Math.min(PAGE_SIZE,demoProducts.length));
assert.equal(new Set([...all.items,...second.items].map(p=>p.id)).size,all.items.length+second.items.length,'Pages must not repeat products');
const women = selectDemoProducts(demoProducts,{...initialFilters,category:'fashion',query:'women',collection:'best'});
assert.ok(women.items.length>0);
assert.ok(women.items.every(p=>p.category==='fashion'));
assert.ok(!women.items.some(p=>p.title==='Cotton Panjabi'),'Women selection must not return men-only sample');
const best = selectDemoProducts(demoProducts,{...initialFilters,collection:'best'}).items;
assert.ok(best.every((p,i)=>i===0||best[i-1].price<=p.price),'Best buys must be ordered by price');
const branded = selectDemoProducts(demoProducts,{...initialFilters,brand:'UNIQLO'});
assert.ok(branded.items.length>0 && branded.items.every(p=>p.brand==='UNIQLO'));
assert.equal(selectDemoProducts(demoProducts,{...initialFilters,brand:'No such brand'}).total,0);
assert.equal(selectDemoProducts(demoProducts,{...initialFilters,saved:true},['demo-1']).items[0].id,'demo-1');
const params=buildProductParams({...initialFilters,category:'fashion',brand:'UNIQLO',collection:'premium',page:2});
assert.equal(params.category,'fashion');assert.equal(params.brand,'UNIQLO');assert.equal(params.sort,'price_high');assert.equal(params.skip,PAGE_SIZE);
assert.equal('category' in buildProductParams(initialFilters),false);
assert.equal(buildProductParams({...initialFilters,query:'men'}).search,'men');
assert.ok(demoProducts.every(p=>p.demo && p.id.startsWith('demo-')));
console.log('PASS: category/brand/saved filtering, word boundaries, price order, finite pagination, demo isolation markers and live API parameters');
