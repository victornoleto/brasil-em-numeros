/*
 * ranking.js — ordena os mandatos com os pesos que o leitor dá a cada indicador (−10 a +10).
 * Usado pelo app.js (card "Monte seu ranking"). Testes: tests/ranking.test.js.
 *
 * Cada indicador vale o veredito do placar (governos.js): melhorou +1, estável 0, piorou −1.
 * nota = Σ peso × veredito / Σ |peso|, de −100 a +100, só com os indicadores que têm dado e peso ≠ 0:
 * sem dado não conta a favor nem contra. Peso negativo inverte o sentido; peso 0 ignora o indicador.
 * Empate divide a posição e fica em ordem cronológica; sem nenhum indicador pesado, a nota é null.
 */
function rankear(governos,pesos){
  const V={melhorou:1,estavel:0,piorou:-1};
  return governos.map(g=>{
    let soma=0,base=0,com=0;
    const partes=Object.keys(pesos).filter(k=>pesos[k]).map(k=>{
      const v=g.ind[k],peso=pesos[k];
      if(!v)return {k,peso,veredito:null,pontos:null};
      com++;base+=Math.abs(peso);soma+=peso*V[v.veredito];
      return {k,peso,veredito:v.veredito,pontos:peso*V[v.veredito]};
    });
    // || 0 evita −0.
    return {governo:g.governo,inicio:g.inicio,anos:g.anos,andamento:g.andamento,
      nota:base?Math.round(soma/base*100)||0:null,cobertura:{com,total:partes.length},partes};
  }).sort((a,b)=>(a.nota==null)-(b.nota==null)||(b.nota-a.nota)||(a.inicio-b.inicio))
    .map((r,i,rs)=>Object.assign(r,{posicao:r.nota==null?null:i&&rs[i-1].nota===r.nota?rs[i-1].posicao:i+1}));
}
