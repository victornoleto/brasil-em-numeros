// Testes de public/assets/js/parcial.js. Rodar: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// parcial.js é um script de navegador que define a função global comParcial; aqui ela volta pelo return.
const comParcial = new Function(
  fs.readFileSync(path.join(__dirname, '../public/assets/js/parcial.js'), 'utf8') + '\nreturn comParcial;')();

// Linhas como o dash.data entrega: objetos com os valores em texto, como estão no CSV.
const csv = t => { const [h, ...ls] = t.trim().split('\n'); const cols = h.split(',');
  return ls.map(l => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v]))); };

test('acrescenta 2026 com a marca ate', () => {
  const out = comParcial(csv(`ano,divida
2024,76.3
2025,78.6`), csv(`serie,coluna,ano,valor,ate
divida,divida,2026,82.9,2026-08`), 'divida');
  assert.equal(out.length, 3);
  assert.deepEqual(out[2], { ano: '2026', divida: '82.9', ate: '2026-08' });
});

test('copia a pesquisa da última linha anual e deixa null a coluna numérica sem parcial', () => {
  const des = comParcial(csv(`ano,taxa,pesquisa
2025,5.6,PNADC`), csv(`serie,coluna,ano,valor,ate
desemprego,taxa,2026,5.5,2026-08`), 'desemprego');
  assert.deepEqual(des[1], { ano: '2026', taxa: '5.5', pesquisa: 'PNADC', ate: '2026-08' });
  const ef = comParcial(csv(`ano,brasil,eua
2025,107.5,120.1`), csv(`serie,coluna,ano,valor,ate
cambio_efetivo,brasil,2026,113.5,2026-09`), 'cambio_efetivo');
  assert.deepEqual(ef[1], { ano: '2026', brasil: '113.5', eua: null, ate: '2026-09' });
});

test('ignora parcial de outra série e de ano que já fechou', () => {
  const linhas = csv(`ano,ipca
2025,4.26
2026,4.10`);
  const out = comParcial(linhas, csv(`serie,coluna,ano,valor,ate
ipca,ipca,2026,4.58,2026-09
divida,divida,2027,80.0,2027-02`), 'ipca');
  assert.deepEqual(out, linhas);
});

test('várias colunas da mesma série viram uma linha só', () => {
  const out = comParcial(csv(`ano,brasil,mexico
2025,5.59,19.21`), csv(`serie,coluna,ano,valor,ate
moedas,brasil,2026,5.31,2026-09
moedas,mexico,2026,18.40,2026-09`), 'moedas');
  assert.equal(out.length, 2);
  assert.deepEqual(out[1], { ano: '2026', brasil: '5.31', mexico: '18.40', ate: '2026-09' });
});

test('aceita números, como as linhas que o app.js já converteu', () => {
  const out = comParcial([{ ano: 2025, selic: 15 }],
    [{ serie: 'selic', coluna: 'selic', ano: 2026, valor: 13.75, ate: '2026-10' }], 'selic');
  assert.deepEqual(out[1], { ano: 2026, selic: 13.75, ate: '2026-10' });
});
