// Testes do ranking com os pesos do leitor (public/assets/js/ranking.js). Rodar: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// ranking.js define a global rankear; new Function a devolve sem navegador (ver governos.test.js).
const rankear = new Function(fs.readFileSync(path.join(__dirname, '../public/assets/js/ranking.js'), 'utf8') +
  '\nreturn rankear;')();

// Linha como o dash.data('governos') entrega; só o veredito importa aqui. null = sem dado.
let ano = 2000;
const gov = (governo, vs) => { const a = ano; ano += 4;
  const ind = {}; for (const k in vs) ind[k] = vs[k] && { veredito: vs[k] };
  return { governo, inicio: a, fim: a + 3, anos: a + '–' + (a + 3), andamento: false, ind }; };
const nomes = out => out.map(r => r.governo);

test('pesos iguais repetem a ordem de melhorou − piorou', () => {
  const out = rankear([
    gov('A', { pib: 'piorou', ipca: 'piorou', gini: 'estavel' }),
    gov('B', { pib: 'melhorou', ipca: 'melhorou', gini: 'estavel' }),
    gov('C', { pib: 'melhorou', ipca: 'estavel', gini: 'estavel' })], { pib: 5, ipca: 5, gini: 5 });
  assert.deepEqual(nomes(out), ['B', 'C', 'A']);
  assert.equal(out[0].nota, 67); // (1 + 1 + 0) / 3
  assert.equal(out[2].nota, -67);
  assert.deepEqual(out.map(r => r.posicao), [1, 2, 3]);
});

test('peso negativo inverte: quem melhorou o indicador perde ponto', () => {
  const out = rankear([gov('A', { desmatamento: 'melhorou', pib: 'estavel' }),
    gov('B', { desmatamento: 'piorou', pib: 'estavel' })], { desmatamento: -10, pib: 2 });
  assert.deepEqual(nomes(out), ['B', 'A']);
  assert.equal(out[0].nota, 83); // −10 × −1 / 12
  assert.deepEqual(out[1].partes.find(p => p.k === 'desmatamento'),
    { k: 'desmatamento', peso: -10, veredito: 'melhorou', pontos: -10 });
});

test('sem dado sai do denominador e baixa a cobertura', () => {
  const [r] = rankear([gov('A', { pib: 'melhorou', gini: null })], { pib: 5, gini: 5 });
  assert.equal(r.nota, 100);
  assert.deepEqual(r.cobertura, { com: 1, total: 2 });
  assert.equal(r.partes.find(p => p.k === 'gini').pontos, null);
});

test('peso 0 ignora o indicador; todos 0 dá nota null', () => {
  const [r] = rankear([gov('A', { pib: 'piorou', ipca: 'melhorou' })], { pib: 0, ipca: 3 });
  assert.equal(r.nota, 100);
  assert.deepEqual(r.partes.map(p => p.k), ['ipca']);
  const [z] = rankear([gov('A', { pib: 'piorou' })], { pib: 0 });
  assert.equal(z.nota, null);
  assert.deepEqual(z.cobertura, { com: 0, total: 0 });
});

test('empate divide a posição e mantém a ordem cronológica; nota null vai para o fim', () => {
  const out = rankear([
    gov('A', { pib: 'estavel', gini: null }), gov('B', { pib: 'melhorou', gini: null }),
    gov('C', { pib: 'estavel', gini: null }), gov('D', { pib: null, gini: null })], { pib: 4, gini: 4 });
  assert.deepEqual(nomes(out), ['B', 'A', 'C', 'D']);
  assert.deepEqual(out.map(r => r.posicao), [1, 2, 2, null]);
});
