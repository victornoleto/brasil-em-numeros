// Testes do recorte por governo (public/assets/js/governos.js). Rodar: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// governos.js é um script de navegador que se registra em dash.calc; aqui um dash falso guarda o spec.
// new Function roda no mesmo contexto do teste: objetos de outro contexto do vm têm outro
// Object.prototype e o deepStrictEqual os recusa. comParcial é a global que parcial.js define.
const ler = f => fs.readFileSync(path.join(__dirname, '../public/assets/js', f), 'utf8');
const comParcial = new Function(ler('parcial.js') + '\nreturn comParcial;')();
let spec;
new Function('dash', 'comParcial', ler('governos.js'))(
  { calc: (id, s) => { if (id === 'governos') spec = s; } }, comParcial);

// Linhas como o dash.data entrega: objetos com os valores em texto, como estão no CSV.
const csv = t => { const [h, ...ls] = t.trim().split('\n'); const cols = h.split(',');
  return ls.map(l => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v]))); };
const rodar = dados => spec.fn(...spec.inputs.map(id => dados[id] || []));
const governo = (out, nome) => out.find(r => r.governo === nome);

test('Temer herda a dívida de 2015 (Dilma 2) e entrega a de 2018', () => {
  const out = rodar({ divida: csv(`ano,divida
2014,56.3
2015,65.5
2016,69.8
2018,75.3`) });
  assert.deepEqual(governo(out, 'Temer').ind.divida,
    { herdou: 65.5, anoHerdou: 2015, entregou: 75.3, anoEntregou: 2018, delta: 9.8, veredito: 'piorou' });
  assert.deepEqual(governo(out, 'Dilma 2').ind.divida,
    { herdou: 56.3, anoHerdou: 2014, entregou: 65.5, anoEntregou: 2015, delta: 9.2, veredito: 'piorou' });
});

test('desemprego só compara a mesma pesquisa: Dilma 1 herda a PNADC de 2012, não a PME de 2010', () => {
  const out = rodar({ desemprego: csv(`ano,taxa,pesquisa
2010,6.7,PME
2011,6.0,PME
2012,7.4,PNADC
2014,7.0,PNADC`) });
  const d = governo(out, 'Dilma 1').ind.desemprego;
  assert.equal(d.herdou, 7.4);
  assert.equal(d.anoHerdou, 2012);
  assert.equal(d.veredito, 'estavel'); // −0,4 p.p. está dentro da tolerância de 0,5
});

test('salário mínimo usa variação relativa: −0,9% no Bolsonaro é estável', () => {
  const out = rodar({ salario_minimo: csv(`ano,salario_real
2018,1460
2022,1447`) });
  assert.equal(governo(out, 'Bolsonaro').ind.salario.veredito, 'estavel');
});

test('desmatamento melhora quando cai e piora quando sobe, inclusive com a estimativa', () => {
  const out = rodar({ desmatamento: csv(`ano,km2,tipo
2018,7536,consolidado
2022,11594,consolidado
2026,3335,estimativa`) });
  assert.equal(governo(out, 'Bolsonaro').ind.desmatamento.veredito, 'piorou');
  const l3 = governo(out, 'Lula 3').ind.desmatamento;
  assert.equal(l3.anoEntregou, 2026);
  assert.equal(l3.veredito, 'melhorou');
});

test('PIB compara a média composta com a da América Latina nos mesmos anos', () => {
  const out = rodar({
    pib: csv(`ano,pib
2003,1.1
2004,5.8
2005,3.2
2006,4.0
2015,-3.5`),
    pib_mundo: csv(`ano,america_latina,mundo
2003,2.1,3.8
2004,6.0,5.3
2005,4.4,4.7
2006,5.6,5.3
2015,0.5,3.5`),
  });
  assert.deepEqual(governo(out, 'Lula 1').ind.pib, { brasil: 3.5, referencia: 4.5, delta: -1, veredito: 'piorou' });
  assert.deepEqual(governo(out, 'Dilma 2').ind.pib, { brasil: -3.5, referencia: 0.5, delta: -4, veredito: 'piorou' });
});

test('IPCA compara com o teto da meta (meta + tolerância), não com o centro', () => {
  const out = rodar({
    ipca: csv(`ano,ipca
2003,9.30
2004,7.60
2005,5.69
2006,3.14
2019,4.31
2020,4.52
2021,10.06
2022,5.79`),
    meta_inflacao: csv(`ano,meta,tolerancia
2003,4.00,2.5
2004,5.50,2.5
2005,4.50,2.5
2006,4.50,2.0
2019,4.25,1.5
2020,4.00,1.5
2021,3.75,1.5
2022,3.50,1.5`),
  });
  // Lula 1: IPCA médio 6,4% contra teto médio de 7,0%; contra o centro (4,6%) seria piora.
  assert.deepEqual(governo(out, 'Lula 1').ind.ipca, { brasil: 6.4, referencia: 7, delta: -0.6, veredito: 'melhorou' });
  assert.deepEqual(governo(out, 'Bolsonaro').ind.ipca, { brasil: 6.1, referencia: 5.4, delta: 0.7, veredito: 'piorou' });
});

test('fome: sem dado dentro do mandato não gera veredito; sem herança usa o 1º ano do mandato', () => {
  const out = rodar({ fome: csv(`periodo,ia_grave,pesquisa
2013,3.2,PNAD
2017-18,4.6,POF
2023,4.1,PNAD Contínua
2024,3.2,PNAD Contínua`) });
  assert.equal(governo(out, 'Bolsonaro').ind.fome, null);
  assert.deepEqual(governo(out, 'Lula 3').ind.fome,
    { herdou: 4.1, anoHerdou: 2023, entregou: 3.2, anoEntregou: 2024, delta: -0.9, veredito: 'melhorou' });
});

test('fome compara PNAD com POF (a EBIA é comparável); só o desemprego exige a mesma pesquisa', () => {
  const out = rodar({ fome: csv(`periodo,ia_grave,pesquisa
2013,3.2,PNAD
2017-18,4.6,POF`) });
  const t = governo(out, 'Temer').ind.fome;
  assert.equal(t.anoHerdou, 2013);
  assert.equal(t.veredito, 'piorou');
});

test('um ponto só no mandato e nenhum antes não é comparação: Lula 1 sem dívida bruta', () => {
  const out = rodar({ divida: csv(`ano,divida
2006,55.5
2010,51.8`) });
  assert.equal(governo(out, 'Lula 1').ind.divida, null);
  assert.equal(governo(out, 'Lula 2').ind.divida.veredito, 'melhorou');
});

test('variação igual à tolerância é estável, sem ruído de ponto flutuante (0,4 − 0,1)', () => {
  const out = rodar({ primario: csv(`ano,primario
2022,0.10
2025,0.40`) });
  assert.equal(governo(out, 'Lula 3').ind.primario.veredito, 'estavel');
});

test('placar conta cada indicador uma vez e deixa a Selic fora', () => {
  const out = rodar({
    divida: csv(`ano,divida
2015,65.5
2018,75.3`),
    desemprego: csv(`ano,taxa,pesquisa
2015,8.9,PNADC
2018,12.1,PNADC`),
    salario_minimo: csv(`ano,salario_real
2015,1397
2018,1460`),
    primario: csv(`ano,primario
2015,-1.93
2018,-1.65`),
    selic: csv(`ano,selic
2015,14.25
2018,6.50`),
  });
  const t = governo(out, 'Temer');
  assert.deepEqual(t.placar, { melhorou: 1, piorou: 2, estavel: 1, semDado: 15 });
  assert.deepEqual(t.ind.selic, { entregou: 6.5, anoEntregou: 2018 });
});

test('o parcial de 2026 vira a entrega do Lula 3 e guarda o mês', () => {
  const out = rodar({
    divida: csv(`ano,divida
2022,71.7
2025,78.6`),
    parcial: csv(`serie,coluna,ano,valor,ate
divida,divida,2026,82.9,2026-08`),
  });
  assert.deepEqual(governo(out, 'Lula 3').ind.divida,
    { herdou: 71.7, anoHerdou: 2022, entregou: 82.9, anoEntregou: 2026, ate: '2026-08', delta: 11.2, veredito: 'piorou' });
});

test('PIB × América Latina usa só anos completos: o PIB parcial de 2026 fica fora', () => {
  const out = rodar({
    pib: csv(`ano,pib
2023,3.2
2024,3.4
2025,2.3`),
    pib_mundo: csv(`ano,america_latina,mundo
2023,2.4,3.3
2024,2.4,3.3
2025,2.4,3.2`),
    parcial: csv(`serie,coluna,ano,valor,ate
pib,pib,2026,1.9,2026-06`),
  });
  const l3 = governo(out, 'Lula 3');
  assert.equal(l3.ind.pib.brasil, 3); // com 2026 seria 2,7
  assert.equal(l3.andamento, true);
});

test('desemprego parcial herda a pesquisa PNADC e compara com a herança de 2022', () => {
  const out = rodar({
    desemprego: csv(`ano,taxa,pesquisa
2022,9.6,PNADC
2025,5.6,PNADC`),
    parcial: csv(`serie,coluna,ano,valor,ate
desemprego,taxa,2026,5.5,2026-08`),
  });
  const d = governo(out, 'Lula 3').ind.desemprego;
  assert.equal(d.herdou, 9.6);
  assert.equal(d.entregou, 5.5);
  assert.equal(d.ate, '2026-08');
});

test('Selic do mandato em andamento é a de hoje, com o mês', () => {
  const out = rodar({
    selic: csv(`ano,selic
2025,15.00`),
    parcial: csv(`serie,coluna,ano,valor,ate
selic,selic,2026,13.75,2026-10`),
  });
  assert.deepEqual(governo(out, 'Lula 3').ind.selic, { entregou: 13.75, anoEntregou: 2026, ate: '2026-10' });
});

test('rendimento real do trabalho entra no placar com variação relativa', () => {
  const out = rodar({ rendimento: csv(`ano,rendimento
2018,3100
2022,2950`) });
  const r = governo(out, 'Bolsonaro').ind.rendimento;
  assert.equal(r.delta, -4.8387);
  assert.equal(r.veredito, 'piorou');
});

test('investimento federal começa em 2008: Lula 1 sem dado, Lula 2 herda o 1º ano do mandato', () => {
  const out = rodar({ investimento: csv(`ano,investimento
2008,0.84
2010,1.15
2014,0.99`) });
  assert.equal(governo(out, 'Lula 1').ind.investimento, null);
  assert.deepEqual(governo(out, 'Lula 2').ind.investimento,
    { herdou: 0.84, anoHerdou: 2008, entregou: 1.15, anoEntregou: 2010, delta: 0.31, veredito: 'melhorou' });
  assert.equal(governo(out, 'Dilma 1').ind.investimento.veredito, 'piorou'); // −0,16 p.p.
});

test('mortalidade infantil melhora quando cai, em variação relativa: −3,8% melhora, −2,4% é estável', () => {
  const out = rodar({ mortalidade_infantil: csv(`ano,mortalidade_infantil
2018,13.1
2022,12.6
2024,12.3`) });
  // Em pontos por mil, as duas quedas (−0,5 e −0,3) caberiam na tolerância de 3.
  assert.equal(governo(out, 'Bolsonaro').ind.mortalidade_infantil.veredito, 'melhorou');
  assert.equal(governo(out, 'Lula 3').ind.mortalidade_infantil.veredito, 'estavel');
});

test('ensino superior atravessa a lacuna de 2020–2021: Bolsonaro herda 2018 e entrega 2022', () => {
  const out = rodar({ ensino_superior: csv(`ano,ensino_superior
2016,23.1
2018,24.2
2019,24.7
2022,25.0`) });
  assert.deepEqual(governo(out, 'Bolsonaro').ind.ensino_superior,
    { herdou: 24.2, anoHerdou: 2018, entregou: 25, anoEntregou: 2022, delta: 0.8, veredito: 'estavel' });
  assert.equal(governo(out, 'Temer').ind.ensino_superior.veredito, 'melhorou'); // 2016 → 2018: +1,1 p.p.
});

test('energia renovável melhora quando sobe, em pontos percentuais: +0,9 p.p. é estável', () => {
  const out = rodar({ renovaveis: csv(`ano,renovaveis
2006,44.7
2010,45.6
2014,39.7`) });
  assert.equal(governo(out, 'Lula 2').ind.renovaveis.veredito, 'estavel'); // em variação relativa seria +2,0%
  assert.equal(governo(out, 'Dilma 1').ind.renovaveis.veredito, 'piorou');
});

test('acesso à energia elétrica melhora quando sobe; até 0,5 p.p. é estável', () => {
  const out = rodar({ energia_eletrica: csv(`ano,energia_eletrica
2002,96.7
2006,97.6
2018,99.7
2022,100`) });
  assert.equal(governo(out, 'Lula 1').ind.energia_eletrica.veredito, 'melhorou'); // +0,9 p.p.
  assert.equal(governo(out, 'Bolsonaro').ind.energia_eletrica.veredito, 'estavel'); // +0,3 p.p.
});

test('mandato em andamento é o que ainda não tem o PIB do último ano', () => {
  const out = rodar({ pib: csv(`ano,pib
2018,1.7
2025,2.3`) });
  assert.equal(governo(out, 'Temer').andamento, false);
  assert.equal(governo(out, 'Lula 3').andamento, true);
  assert.equal(governo(out, 'Lula 3').anos, '2023–2026');
  assert.equal(governo(out, 'Dilma 2').anos, '2015');
});
