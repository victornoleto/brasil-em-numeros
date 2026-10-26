/*
 * parcial.js — junta o ano corrente, ainda incompleto, às linhas anuais de uma série.
 * Usado pelo app.js (gráficos) e pelo governos.js (placar). Testes: tests/parcial.test.js.
 *
 * data/parcial.csv (gerado por scripts/atualizar_dados.py): serie,coluna,ano,valor,ate — uma linha
 * por coluna da série; `ate` é o último mês divulgado (AAAA-MM). O ano só entra se a série ainda
 * não o tiver completo, então um parcial velho some sozinho quando o ano fecha.
 */
function comParcial(linhas,parcial,serie){
  const fim=linhas.reduce((m,r)=>Math.max(m,+r.ano),-Infinity),ult=linhas[linhas.length-1]||{},novos=new Map();
  // Texto (ex.: pesquisa = PNADC) vem da última linha anual; número sem parcial fica null, nunca o de 2025.
  const texto=v=>typeof v==='string'&&v!==''&&isNaN(+v);
  parcial.filter(p=>p.serie===serie&&+p.ano>fim).forEach(p=>{
    if(!novos.has(+p.ano)){
      const r={};for(const k in ult)r[k]=texto(ult[k])?ult[k]:null;
      novos.set(+p.ano,Object.assign(r,{ano:p.ano,ate:p.ate}));
    }
    novos.get(+p.ano)[p.coluna]=p.valor;
  });
  return linhas.concat([...novos.values()]);
}
