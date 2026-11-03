/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS loader transpiluje testované TS moduly. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
// Izvedemo dejanske TypeScript funkcije brez dodatnega testnega ogrodja.
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename);
};
const { zgradiDrevo, materialniPlan, primerjajStrukturo, aktivenIdent } = require('../src/lib/kosovnice.ts');
const { preberiIdenteXlsx, preberiKosovniceXlsx } = require('../src/lib/kosovniceUvoz.ts');
const { poisciKomponente } = require('../src/lib/kosovniceIskanje.ts');
const { izracunajPredelavo } = require('../src/lib/predelava.ts');
const { predelavaExcel } = require('../src/lib/predelavaExcel.ts');
const row = (vrstica, nivo, sifra, kolicina) => ({ vrstica, nivo, sifra, kolicina, izdelek: 'R', risp_sifra: nivo === 1 ? 'R' : sifra, naziv: sifra, klasifikat: null, vrsta: null });
const tree = () => zgradiDrevo([row(1,1,'R',0),row(2,2,'A',3),row(3,3,'B',2),row(4,2,'B',1)]);
const stock = (s, q) => [s, { zaloga:q, razpolozljiva:q, prosta_zaloga:999, em:'KOS' }];
test('predelava odsteje skupne dele tudi med razlicnima sestavoma in ohrani nove sestave', () => {
  const a=zgradiDrevo([row(1,1,'R',0),row(2,2,'VRATA-L',1),row(3,3,'TESNILO',2),row(4,3,'PANEL-L',1)]);
  const b=zgradiDrevo([row(1,1,'R',0),row(2,2,'VRATA-D',1),row(3,3,'TESNILO',2),row(4,3,'PANEL-D',1)]);
  const p=izracunajPredelavo(a,b,5,new Map([stock('PANEL-D',3)]));
  assert.equal(p.vrstice.some(r=>r.sifra==='TESNILO'),false);
  assert.equal(p.uporabljeno.find(r=>r.sifra==='TESNILO').kolicina,10);
  assert.equal(p.vrstice.find(r=>r.sifra==='VRATA-D').sestavi,5);
  assert.equal(p.vrstice.find(r=>r.sifra==='PANEL-D').prevzem,3);
  assert.equal(p.vrstice.find(r=>r.sifra==='PANEL-D').manjka,2);
});
test('ponovna uporaba celega sestava ne ustvari dodatne zaloge njegovih otrok', () => {
  const a=zgradiDrevo([row(1,1,'R',0),row(2,2,'A',1),row(3,3,'X',2)]);
  const b=zgradiDrevo([row(1,1,'R',0),row(2,2,'A',1),row(3,3,'X',2),row(4,2,'X',3)]);
  const p=izracunajPredelavo(a,b,1,new Map());
  assert.equal(p.vrstice.length,1);assert.equal(p.vrstice[0].potreba,3);
  assert.equal(p.uporabljeno.length,1);assert.equal(p.uporabljeno[0].sifra,'A');
});
test('razlicna globina skupnega sestava ne povzroci ponovnega narocanja', () => {
  const a=zgradiDrevo([row(1,1,'R',0),row(2,2,'A',1),row(3,3,'X',2)]);
  const b=zgradiDrevo([row(1,1,'R',0),row(2,2,'WRAPPER',1),row(3,3,'A',1),row(4,4,'X',2)]);
  const p=izracunajPredelavo(a,b,1,new Map());
  assert.deepEqual(p.vrstice.map(r=>r.sifra),['WRAPPER']);
  assert.equal(p.uporabljeno[0].sifra,'A');
});
test('izkljucenega dela ne ponovno uporabimo niti skozi celoten sestav', () => {
  const p=izracunajPredelavo(tree(),tree(),1,new Map(),['B']);
  assert.equal(p.uporabljeno.some(r=>r.sifra==='A'||r.sifra==='B'),false);
  assert.equal(p.vrstice.filter(r=>r.sifra==='B').reduce((s,r)=>s+r.potreba,0),7);
});
test('polizdelek se naroci kot celota, iz razlicnih zvarjencev ne dobimo skupne surovine', () => {
  const a=zgradiDrevo([row(1,1,'R',0),row(2,2,'097-A',1),row(3,3,'CEV',2)]);
  const b=zgradiDrevo([row(1,1,'R',0),row(2,2,'097-B',1),row(3,3,'CEV',2)]);
  const p=izracunajPredelavo(a,b,5,new Map());
  assert.equal(p.uporabljeno.length,0);assert.equal(p.vrstice[0].sifra,'097-B');assert.equal(p.vrstice[0].manjka,5);
});
test('prevzem novega sestava pokrije otroke in ne podvoji materiala', () => {
  const a=zgradiDrevo([row(1,1,'R',0)]);
  const b=tree();const p=izracunajPredelavo(a,b,1,new Map([stock('A',3),stock('B',1)]));
  assert.equal(p.vrstice.filter(r=>r.sifra==='B').reduce((s,r)=>s+r.potreba,0),1);
  assert.equal(p.vrstice.reduce((s,r)=>s+r.prevzem,0),4);
});
test('iskanje najde vse pojavitve in njihove prednike, ne sorodnih vej', () => {
  const t=tree();
  const r=poisciKomponente(t,'B');
  assert.deepEqual(r.zadetki.map(n=>n.vrstica),[3,4]);
  assert.deepEqual([...r.predniki],[1,2]);
  assert.equal(poisciKomponente(t,'neobstojeca').zadetki.length,0);
  assert.equal(poisciKomponente(t,' ').predniki.size,0);
  t.otroci[0].otroci[0].naziv='Žična ščetka velika';
  assert.equal(poisciKomponente(t,'scetka zicna').zadetki[0].vrstica,3);
});
test('hierarhija, produkt količin in preskok nivoja', () => {
  const t = tree();
  assert.equal(t.skupaj,1); assert.equal(t.otroci[0].otroci[0].skupaj,6);
  assert.throws(() => zgradiDrevo([row(1,1,'R',0),row(2,3,'X',1)]), /hierarhija/);
});
test('zaloga sestava pokrije vejo; preostanek se razvije, zaloga lista se ne podvoji', () => {
  const p = materialniPlan(tree(),new Map([stock('A',2),stock('B',2)]));
  assert.equal(p.get('A').prevzem,2);
  assert.equal(p.get('B').potreba,3);
  assert.equal(p.get('B').prevzem,2);
  assert.equal(p.get('B').manjka,1);
});
test('zaloga uporablja fizično in razpoložljivo mejo, brez pričakovanih dobav', () => {
  const p=materialniPlan(tree(),new Map([['A',{zaloga:1,razpolozljiva:10,prosta_zaloga:999,em:'KOS'}]]));
  assert.equal(p.get('A').prevzem,1); assert.equal(p.get('B').potreba,5);
  assert.equal(materialniPlan(tree(),new Map(),false).get('B').potreba,7);
});
test('ident v drugem sestavu ostane strukturna razlika tudi ob enakem skupnem seštevku', () => {
  const a=zgradiDrevo([row(1,1,'R',0),row(2,2,'A',1),row(3,3,'X',1),row(4,2,'B',1)]);
  const b=zgradiDrevo([row(1,1,'R',0),row(2,2,'A',1),row(3,2,'B',1),row(4,3,'X',1)]);
  assert.deepEqual(primerjajStrukturo(a,b).filter(r=>r.sifra==='X').map(r=>[r.pot,r.levo,r.desno]),[['A',1,0],['B',0,1]]);
  assert.equal(primerjajStrukturo(a,a).length,0);
});
test('ponovljeni sestavi se primerjajo s svojimi količinami', () => {
  const a=zgradiDrevo([row(1,1,'R',0),row(2,2,'A',2),row(3,3,'X',3),row(4,2,'A',1),row(5,3,'X',4)]);
  const b=zgradiDrevo([row(1,1,'R',0),row(2,2,'A',3),row(3,3,'X',3)]);
  assert.deepEqual(primerjajStrukturo(a,b).map(r=>[r.sifra,r.levo,r.desno]),[['X',10,9]]);
});
test('aktivni vključujejo posebnost, prazni in ostali statusi so izključeni', () => {
  for(const status of ['AKTIVEN','AKTIVEN s posebnostjo','AKTIVEN s posebnostj']) assert.equal(aktivenIdent({status}),true);
  for(const status of [null,'NEAKTIVEN','IZLOČEN','NEDEFINIRAN','VZORČEN','V ČAKANJU','ZASTARAN','NE OBSTAJA']) assert.equal(aktivenIdent({status}),false);
  assert.equal(aktivenIdent({status:'AKTIVEN',neaktiven:true}),false);
});
test('dejanska ERP izvoza: celoten uvoz brez zapisovanja v bazo', async () => {
  const file = name => new File([fs.readFileSync(path.join(__dirname,'../data',name))], name);
  const {identi,opozorila}=await preberiIdenteXlsx(file('Identi.xlsx'));
  const {vrstice,opozorila: opozorilaKos}=await preberiKosovniceXlsx(file('Kosovnice.xlsx'));
  assert.equal(opozorilaKos.length,1);
  assert.equal(vrstice.filter(v=>v.sifra.startsWith('RISP:')).length,62);
  assert.equal(identi.length,8975); assert.equal(opozorila.length,1); assert.equal(vrstice.length,134308);
  assert.equal(vrstice.filter(v=>v.nivo===1).length,2356);
  assert.equal(identi[0].risp_sifra,'11050');
  assert.equal(identi[0].sifra,'098-15002054');
  console.log(`${identi.length} identov, ${vrstice.length} vrstic, 2356 veljavnih dreves.`);
  const koren = sifra => {const r=vrstice.find(r=>r.nivo===1&&r.sifra===sifra);return zgradiDrevo(vrstice.filter(v=>v.izdelek===r.izdelek));};
  const desni=koren('100-301.2001'), levi=koren('100-301.2002');
  const drzala=n=>[n,...n.otroci.flatMap(drzala)].filter(r=>r.sifra==='096-10191');
  // V izvirnem Excelu: 4 v nivo2 + 5 neposredno pod sestavom desnih vrat.
  assert.deepEqual(drzala(desni).map(r=>r.skupaj),[4,5]);
  assert.deepEqual(drzala(levi).map(r=>r.skupaj),[4]);
  const p=izracunajPredelavo(levi,desni,5,new Map());
  assert.equal(p.vrstice.filter(r=>r.sifra==='096-10191').reduce((s,r)=>s+r.potreba,0),25);
  assert.ok(p.vrstice.some(r=>r.naziv.includes('Vrata desna - zvarjenec')));
  const wb=predelavaExcel(p);
  assert.deepEqual(wb.SheetNames,['Hierarhija','Za skladisce','Ponovna uporaba','Navodila']);
  const X=require('xlsx');const roundtrip=X.read(X.write(wb,{type:'buffer',bookType:'xlsx'}),{type:'buffer'});
  assert.equal(roundtrip.Sheets.Hierarhija.B6.v,p.vrstice[0].sifra);
  if(process.env.PREDELAVA_PRIMER==='1') {const dir=path.join(__dirname,'../artifacts');fs.mkdirSync(dir,{recursive:true});X.writeFile(wb,path.join(dir,'Predelava_100-301.2002_v_100-301.2001_5kos.xlsx'));}
  console.log('Predelava 5 peci: '+p.vrstice.length+' preostalih vrstic, '+p.uporabljeno.length+' povezav ponovne uporabe.');
});
