/*
 * governos.js — recorte dos indicadores por mandato presidencial (dash.calc('governos')).
 * Fica fora do app.js para ser testado sem navegador: tests/governos.test.js.
 *
 * Indicador de nível: compara a herança (último valor do governo anterior, até 4 anos antes do
 * mandato; sem ele, o 1º valor do próprio mandato) com a entrega (último valor do mandato).
 * PIB e IPCA: média composta do mandato contra uma referência (América Latina e teto da meta).
 * Variação dentro da tolerância conta como estável. O placar é uma contagem simples, sem pesos.
 * Nos indicadores de nível e na Selic, o ano corrente entra como parcial (parcial.js); PIB e IPCA,
 * que são médias anuais do mandato, usam só anos completos.
 */

// O ano conta para quem governou a maior parte dele: Temer assumiu em 12/05/2016.
const MANDATOS=[['FHC 2',1999,2002],['Lula 1',2003,2006],['Lula 2',2007,2010],['Dilma 1',2011,2014],
  ['Dilma 2',2015,2015],['Temer',2016,2018],['Bolsonaro',2019,2022],['Lula 3',2023,2026]];
// tol na unidade do indicador; com rel, em % de variação.
const NIVEIS=[
  {k:'desemprego',de:'desemprego',col:'taxa',sobe:false,tol:0.5,pesquisa:true}, // PME e PNADC não se comparam
  {k:'primario',de:'primario',col:'primario',sobe:true,tol:0.3},
  {k:'investimento',de:'investimento',col:'investimento',sobe:true,tol:0.1},
  {k:'divida',de:'divida',col:'divida',sobe:false,tol:1},
  {k:'divida_liquida',de:'divida_liquida',col:'divida_liquida',sobe:false,tol:1},
  {k:'gini',de:'gini',col:'gini',sobe:false,tol:0.005},
  {k:'extrema',de:'pobreza',col:'extrema',sobe:false,tol:0.5},
  {k:'pobreza',de:'pobreza',col:'pobreza',sobe:false,tol:1},
  {k:'fome',de:'fome',col:'ia_grave',sobe:false,tol:0.5},
  {k:'salario',de:'salario_minimo',col:'salario_real',sobe:true,tol:2,rel:true},
  {k:'rendimento',de:'rendimento',col:'rendimento',sobe:true,tol:2,rel:true},
  {k:'desmatamento',de:'desmatamento',col:'km2',sobe:false,tol:5,rel:true},
  {k:'renovaveis',de:'renovaveis',col:'renovaveis',sobe:true,tol:1},
  {k:'energia_eletrica',de:'energia_eletrica',col:'energia_eletrica',sobe:true,tol:0.5},
  {k:'vacinacao',de:'vacinacao',col:'sarampo',sobe:true,tol:2},
  {k:'mortalidade_infantil',de:'mortalidade_infantil',col:'mortalidade_infantil',sobe:false,tol:3,rel:true},
  {k:'ensino_superior',de:'ensino_superior',col:'ensino_superior',sobe:true,tol:1}]; // o IBGE não divulgou 2020 e 2021
const ENTRADAS=['pib','pib_mundo','ipca','meta_inflacao','selic','desemprego','primario','investimento','divida',
  'divida_liquida','gini','pobreza','fome','salario_minimo','rendimento','desmatamento','renovaveis','energia_eletrica',
  'vacinacao','mortalidade_infantil','ensino_superior','parcial'];

dash.calc('governos',{
  inputs:ENTRADAS,
  title:'Indicadores por mandato',
  description:'Para cada mandato: herança e entrega dos indicadores de nível, PIB contra a América Latina, IPCA contra o teto da meta e o placar de indicadores que melhoraram, pioraram ou ficaram estáveis.',
  fn:(...conjuntos)=>{
    const D={};ENTRADAS.forEach((id,i)=>{D[id]=conjuntos[i];});
    const ano=r=>parseInt(r.ano!=null?r.ano:r.periodo,10);
    const pontos=(rows,k)=>rows.filter(r=>r[k]!==''&&r[k]!=null).map(r=>({ano:ano(r),v:+r[k],pesquisa:r.pesquisa,ate:r.ate}))
      .sort((x,y)=>x.ano-y.ano);
    // `ate` só aparece quando o valor é parcial (último mês divulgado do ano corrente).
    const comAte=(o,p)=>p.ate?Object.assign(o,{ate:p.ate}):o;
    // Arredonda antes de comparar com a tolerância (0,4 − 0,1 = 0,30000000000000004); || 0 evita −0.
    const r1=x=>Math.round(x*10)/10||0,r4=x=>Math.round(x*1e4)/1e4||0;
    const veredito=(delta,sobe,tol)=>Math.abs(delta)<=tol?'estavel':((delta>0)===sobe?'melhorou':'piorou');
    const composta=v=>(Math.pow(v.reduce((p,x)=>p*(1+x/100),1),1/v.length)-1)*100;

    const nivel=(n,a,b)=>{
      const pts=pontos(comParcial(D[n.de],D.parcial,n.de),n.col),dentro=pts.filter(p=>p.ano>=a&&p.ano<=b);
      if(!dentro.length)return null;
      const ent=dentro[dentro.length-1],mesma=p=>!n.pesquisa||p.pesquisa===ent.pesquisa;
      const antes=pts.filter(p=>p.ano>=a-4&&p.ano<a&&mesma(p));
      const her=antes.length?antes[antes.length-1]:dentro.find(mesma);
      if(her===ent)return null;
      const delta=n.rel?r4((ent.v/her.v-1)*100):r4(ent.v-her.v);
      return comAte({herdou:her.v,anoHerdou:her.ano,entregou:ent.v,anoEntregou:ent.ano,delta,veredito:veredito(delta,n.sobe,n.tol)},ent);
    };
    // Média composta do Brasil no mandato contra a referência nos mesmos anos.
    const contra=(br,ref,a,b,refMedia,sobe,tol)=>{
      const anos=br.filter(p=>p.ano>=a&&p.ano<=b&&ref.has(p.ano));
      if(!anos.length)return null;
      const brasil=r1(composta(anos.map(p=>p.v))),referencia=r1(refMedia(anos.map(p=>ref.get(p.ano)))),delta=r1(brasil-referencia);
      return {brasil,referencia,delta,veredito:veredito(delta,sobe,tol)};
    };
    const al=new Map(pontos(D.pib_mundo,'america_latina').map(p=>[p.ano,p.v]));
    const teto=new Map(D.meta_inflacao.filter(r=>r.meta!==''&&r.tolerancia!=='').map(r=>[ano(r),+r.meta+ +r.tolerancia]));
    const pib=pontos(D.pib,'pib'),ipca=pontos(D.ipca,'ipca'),selic=pontos(comParcial(D.selic,D.parcial,'selic'),'selic');

    return MANDATOS.map(([governo,a,b])=>{
      const ind={pib:contra(pib,al,a,b,composta,true,0.5),
        ipca:contra(ipca,teto,a,b,v=>v.reduce((s,x)=>s+x,0)/v.length,false,0.25)};
      NIVEIS.forEach(n=>{ind[n.k]=nivel(n,a,b);});
      const placar={melhorou:0,piorou:0,estavel:0,semDado:0};
      for(const k in ind){if(ind[k])placar[ind[k].veredito]++;else placar.semDado++;}
      // Selic: só contexto. O Copom decide, e o BC é autônomo desde 2021.
      const s=selic.filter(p=>p.ano>=a&&p.ano<=b),u=s[s.length-1];
      ind.selic=u?comAte({entregou:u.v,anoEntregou:u.ano},u):null;
      return {governo,inicio:a,fim:b,anos:a===b?String(a):a+'–'+b,andamento:!pib.some(p=>p.ano===b),ind,placar};
    });
  }
});
