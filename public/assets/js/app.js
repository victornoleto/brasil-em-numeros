/*
 * app.js — desenha o painel "Brasil em números".
 * Lê os dados via dash.data(id) (assets/js/dash.js) e usa d3 v7 para os gráficos.
 */

(function(){
  const nf=(v,d)=>(v==null||isNaN(v))?'—':Number(v).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
  const get=id=>{const r=dash.data(id);if(r.status!=='ok')return{status:r.status,rows:[]};
    return{status:'ok',rows:r.data.map(o=>{const n={};for(const k in o){const v=o[k];n[k]=(v===''||v==null)?null:(isNaN(+v)?v:+v);}return n;})};};
  const C=dash.colors,CINZA='var(--ui-chart-reference)';
  const MES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const mesAno=s=>{const [a,m]=String(s).split('-');return MES[+m-1]+'/'+a;};
  // Link externo abre em outra aba, sem passar a página de origem.
  const link=(href,txt)=>{const a=document.createElement('a');a.href=href;a.textContent=txt;
    if(/^https?:/.test(href)){a.target='_blank';a.rel='noopener noreferrer';}return a;};

  function holdState(box,st){
    if(st==='ok')return true;
    box.innerHTML='';
    if(st==='loading'){box.classList.add('dash-skeleton');}
    else{box.classList.remove('dash-skeleton');const f=document.createElement('div');f.className='fail';f.appendChild(document.createElement('i'));const t=document.createElement('span');t.textContent='Falha ao carregar';f.appendChild(t);box.appendChild(f);}
    return false;
  }

  // o: {series:[{rows,x,y,label,color,width}], kind:'line'|'bar', cat:bool, x0,x1, d (decimals), unit, pre (prefixo), zero, dots,
  //     barColor, tag (r => texto extra no tooltip), prov (r => valor provisório; padrão: tem `ate`, o parcial do ano corrente),
  //     provTxt (legenda do provisório), rotulos (nome de cada série no fim da linha)}
  // x1 é o mínimo: o eixo vai até o último ano com dado, inclusive o parcial.
  function draw(box,o){
    box.classList.remove('dash-skeleton');box.innerHTML='';
    const prov=o.prov||(r=>r.ate!=null);
    const W=Math.max(260,box.clientWidth||320),H=200,mt=10,mb=26;
    const svg=d3.select(box).append('svg').attr('width','100%').attr('viewBox',`0 0 ${W} ${H}`);
    const cap=s=>s.style('font-size','var(--ui-font-size-caption)');
    // Com rótulos no fim das linhas, a margem direita cresce para caber o maior nome.
    let mr=18;
    if(o.rotulos){const pg=svg.append('g');mr=d3.max(cap(pg.selectAll('text').data(o.series).join('text').text(s=>s.label)).nodes(),
      n=>n.getComputedTextLength())+16;pg.remove();}
    const x1=o.cat?o.x1:Math.max(o.x1,d3.max(o.series,s=>d3.max(s.rows,r=>r[s.y]!=null?+r[s.x]:null))||o.x1);
    const vals=o.series.flatMap(s=>s.rows.map(r=>r[s.y]).filter(v=>v!=null));
    let lo=d3.min(vals),hi=d3.max(vals);
    if(o.zero){lo=Math.min(0,lo);hi=Math.max(0,hi);}else{const p=(hi-lo)*0.12||1;lo-=p;hi+=p;}
    const y=d3.scaleLinear([lo,hi],[H-mb,mt]).nice(5);
    const ticks=y.ticks(5);
    const tf=v=>nf(v,o.td!=null?o.td:(Number.isInteger(v)?0:1));
    const gy=svg.append('g');
    const tt=gy.selectAll('text').data(ticks).join('text').text(tf)
      .style('font-size','var(--ui-font-size-caption)').style('fill','var(--color-fg-muted)')
      .attr('text-anchor','end').attr('dy','0.32em').attr('y',d=>y(d));
    const ml=d3.max(tt.nodes(),n=>n.getComputedTextLength())+10;
    tt.attr('x',ml-6);
    gy.selectAll('line').data(ticks).join('line').attr('x1',ml).attr('x2',W-mr).attr('y1',d=>y(d)).attr('y2',d=>y(d))
      .attr('stroke',d=>d===0&&o.zero?'var(--ui-chart-axis)':'var(--ui-chart-grid)').attr('stroke-width',1);

    let xp,keys,xTicks,band=null;
    if(o.cat){
      keys=o.series[0].rows.map(r=>String(r[o.series[0].x]));
      band=d3.scaleBand(keys,[ml,W-mr]).padding(0.3);xp=k=>band(String(k))+band.bandwidth()/2;xTicks=keys;
    }else if(o.kind==='bar'){
      keys=d3.range(o.x0,x1+1);band=d3.scaleBand(keys,[ml,W-mr]).padding(0.2);xp=k=>band(k)+band.bandwidth()/2;
      xTicks=keys.filter(k=>k%5===0);
    }else{
      const xs=d3.scaleLinear([o.x0,x1],[ml+6,W-mr]);xp=k=>xs(k);
      keys=Array.from(new Set(o.series.flatMap(s=>s.rows.filter(r=>r[s.y]!=null).map(r=>r[s.x])))).sort((a,b)=>a-b);
      const step=(x1-o.x0)>14?5:2;xTicks=d3.range(Math.ceil(o.x0/step)*step,x1+1,step);
    }
    const xl=svg.append('g').selectAll('text').data(xTicks).join('text').text(d=>String(d))
      .attr('x',d=>xp(d)).attr('y',H-6).attr('text-anchor','middle')
      .style('font-size','var(--ui-font-size-caption)').style('fill','var(--color-fg-muted)');
    // keep the last label inside
    xl.each(function(){const w=this.getComputedTextLength(),cx=+this.getAttribute('x');if(cx+w/2>W)this.setAttribute('x',W-w/2);});

    const marks=svg.append('g');let bars=null;
    if(o.kind==='bar'){
      const s=o.series[0],cor=r=>o.barColor?o.barColor(r):s.color;
      // Provisório: barra vazada, só com o contorno tracejado.
      bars=marks.selectAll('rect').data(s.rows.filter(r=>r[s.y]!=null)).join('rect')
        .attr('x',r=>band(o.cat?String(r[s.x]):r[s.x])).attr('width',band.bandwidth())
        .attr('y',r=>Math.min(y(r[s.y]),y(0))).attr('height',r=>Math.max(1,Math.abs(y(r[s.y])-y(0))))
        .attr('rx',Math.min(4,band.bandwidth()/2)).attr('fill',r=>prov(r)?'none':cor(r))
        .attr('stroke',r=>prov(r)?cor(r):null).attr('stroke-width',r=>prov(r)?1.5:null).attr('stroke-dasharray',r=>prov(r)?'3 2':null);
    }else{
      o.series.forEach(s=>{
        const pts=s.rows.filter(r=>r[s.y]!=null),firmes=pts.filter(r=>!prov(r)),pv=pts.filter(prov);
        const linha=(d,dash)=>marks.append('path').datum(d).attr('fill','none').attr('stroke',s.color).attr('stroke-width',s.width||2)
          .attr('stroke-linecap','round').attr('stroke-linejoin','round').attr('stroke-dasharray',dash)
          .attr('d',d3.line().x(r=>xp(r[s.x])).y(r=>y(r[s.y])));
        linha(firmes,null);
        // Provisório: trecho tracejado desde o último valor firme e marcador vazado.
        if(pv.length){linha(firmes.slice(-1).concat(pv),'4 3');
          marks.selectAll(null).data(pv).join('circle').attr('cx',r=>xp(r[s.x])).attr('cy',r=>y(r[s.y])).attr('r',3.5)
            .attr('fill','var(--color-panel)').attr('stroke',s.color).attr('stroke-width',2);}
        if(o.dots)marks.selectAll(null).data(firmes).join('circle').attr('cx',r=>xp(r[s.x])).attr('cy',r=>y(r[s.y])).attr('r',3.5).attr('fill',s.color);
      });
    }
    if(o.rotulos){
      // Nome no fim de cada linha, em cor de texto; afasta os nomes 12 px para não se sobreporem.
      const fim=o.series.map(s=>{const pts=s.rows.filter(r=>r[s.y]!=null),r=pts[pts.length-1];return r&&{t:s.label,y:y(r[s.y])};})
        .filter(Boolean).sort((a,b)=>a.y-b.y);
      fim.forEach((f,i)=>{if(i)f.y=Math.max(f.y,fim[i-1].y+12);});
      const sobra=fim.length?fim[fim.length-1].y-(H-mb):0;if(sobra>0)fim.forEach(f=>{f.y-=sobra;});
      cap(svg.append('g').selectAll('text').data(fim).join('text').text(f=>f.t).attr('x',W-mr+8).attr('y',f=>f.y).attr('dy','0.32em'))
        .style('fill','var(--color-fg)');
    }
    const pvs=o.series.flatMap(s=>s.rows.filter(r=>r[s.y]!=null&&prov(r)));
    if(pvs.length){const p=document.createElement('p');p.className='prov';
      p.textContent=o.provTxt||(o.kind==='bar'?'Barra vazada':'Trecho tracejado')+': '+pvs[0].ano+' parcial, com dados até '+
        [...new Set(pvs.map(r=>mesAno(r.ate)))].join(' e ')+'.';
      box.appendChild(p);}
    const hl=svg.append('g').style('pointer-events','none');
    const tip=document.createElement('div');tip.className='tip';box.appendChild(tip);
    const hide=()=>{tip.style.display='none';hl.selectAll('*').remove();if(bars)bars.attr('opacity',1);};
    const show=ev=>{
      const [mx]=d3.pointer(ev,svg.node());const sc=W/(svg.node().getBoundingClientRect().width||W);const px=mx;
      const k=d3.least(keys,kk=>Math.abs(xp(kk)-px));if(k==null)return;
      hl.selectAll('*').remove();tip.innerHTML='';
      const kd=document.createElement('div');kd.className='k';kd.textContent=String(k);tip.appendChild(kd);
      if(o.kind!=='bar')hl.append('line').attr('x1',xp(k)).attr('x2',xp(k)).attr('y1',mt).attr('y2',H-mb).attr('stroke','var(--ui-chart-reference)').attr('stroke-width',1);
      o.series.forEach(s=>{
        const r=s.rows.find(r=>String(r[s.x])===String(k));if(!r||r[s.y]==null)return;
        const line=document.createElement('div');
        if(o.series.length>1){const sw=document.createElement('span');sw.className='sw';sw.style.background=s.color;line.appendChild(sw);}
        const tg=[o.tag?o.tag(r):'',r.ate?'parcial, até '+mesAno(r.ate):''].filter(Boolean).join(' · ');
        const t=document.createElement('span');t.textContent=(o.series.length>1?s.label+': ':'')+(o.pre||'')+nf(r[s.y],o.d)+(o.unit||'')+(tg?' · '+tg:'');line.appendChild(t);tip.appendChild(line);
        if(o.kind!=='bar')hl.append('circle').attr('cx',xp(k)).attr('cy',y(r[s.y])).attr('r',4.5).attr('fill',s.color).attr('stroke','var(--color-panel)').attr('stroke-width',2);
      });
      if(bars)bars.attr('opacity',r=>String(r[o.series[0].x])===String(k)?1:0.45);
      tip.style.display='block';
      const bw=box.clientWidth,tw=tip.offsetWidth,cx=xp(k)/sc;
      let left=cx+12;if(left+tw>bw)left=cx-12-tw;if(left<0)left=0;
      tip.style.left=left+'px';tip.style.top='4px';
    };
    svg.append('rect').attr('x',ml).attr('y',0).attr('width',W-ml-mr).attr('height',H).attr('fill','transparent')
      .on('pointermove',show).on('pointerdown',show).on('pointerleave',hide);
  }

  function legend(el,items){el.innerHTML='';items.forEach(([c,t])=>{const s=document.createElement('span');const sw=document.createElement('span');sw.className='sw';sw.style.background=c;s.appendChild(sw);s.appendChild(document.createTextNode(t));el.appendChild(s);});}

  function fillMarks(id,rows,d){
    document.querySelectorAll(`#dash-root .bx span[data-source="${id}"][data-field]`).forEach(el=>{
      el.classList.remove('dash-skeleton');
      const f=el.getAttribute('data-field');const w=el.getAttribute('data-where');
      if(!rows){el.textContent='—';return;}
      let r=rows[0];if(w){const [k,v]=w.split('=');r=rows.find(x=>String(x[k])===decodeURIComponent(v));}
      el.textContent=r&&r[f]!=null?(typeof r[f]==='number'?nf(r[f],d):r[f]):'—';
    });
  }
  // Seta = direção; ✓/✗ = se foi bom. A cor não é o único sinal (o painel tem leitor daltônico).
  // role=img + aria-label: o leitor de tela lê "caiu, melhorou" em vez dos nomes dos símbolos.
  function arrow(id,cur,prev,goodUp){
    const el=document.getElementById(id);
    if(cur==null||prev==null){el.textContent='';['title','role','aria-label'].forEach(a=>el.removeAttribute(a));return;}
    const up=cur>prev,eq=cur===prev,good=up===goodUp;
    el.textContent=eq?'=':(up?'▲':'▼')+(good?' ✓':' ✗');
    el.className='arr '+(eq?'':(good?'good':'bad'));
    el.title=eq?'igual ao ano anterior':(up?'subiu':'caiu')+(good?', melhorou':', piorou');
    el.setAttribute('role','img');el.setAttribute('aria-label',el.title);
  }

  // Veredito do recorte por governo (governos.js): símbolo, classe e texto.
  const VD={melhorou:['✓','ok','melhorou'],piorou:['✗','bad','piorou'],estavel:['=','eq','estável']};
  const VCOR={melhorou:'var(--color-ok)',piorou:'var(--ui-chart-status-critical)',estavel:'var(--ui-chart-axis)'};
  // [chave em governos.js, nome, unidade da variação, casas da variação, casas do valor, unidade do valor (vai no nome da
  //  linha do Resumo, para as células caberem: 8 mandatos lado a lado), id da fonte em data/fontes.json]
  const GM=[['pib','PIB × América Latina','p.p.',1,1,'% a.a.','pib_mundo'],['ipca','IPCA × teto da meta','p.p.',1,1,'% a.a.','meta_inflacao'],
    ['desemprego','Desemprego','p.p.',1,1,'%','desemprego'],['primario','Resultado primário','p.p.',2,2,'% do PIB','primario'],
    ['divida','Dívida bruta','p.p.',1,1,'% do PIB','divida'],['divida_liquida','Dívida líquida','p.p.',1,1,'% do PIB','divida_liquida'],
    ['gini','Gini','',3,3,'','gini'],['extrema','Extrema pobreza','p.p.',1,1,'%','pobreza'],['pobreza','Pobreza','p.p.',1,1,'%','pobreza'],
    ['fome','Fome grave','p.p.',1,1,'% dom.','fome'],['salario','Salário mínimo real','%',1,0,'R$','salario_minimo'],
    ['rendimento','Rendimento do trabalho','%',1,0,'R$','rendimento'],['desmatamento','Desmatamento','%',0,0,'km²','desmatamento'],
    ['vacinacao','Vacinação','p.p.',0,0,'%','vacinacao']];
  const sinal=(v,d)=>(v>0?'+':'')+nf(v,d);
  const fmtDelta=(m,v)=>sinal(v,m[3])+(m[2]?(m[2]==='%'?'%':' '+m[2]):'');
  let govMetric='pib',govRows=null;
  const chips=document.getElementById('gov-chips');
  GM.forEach(([k,lbl])=>{const b=document.createElement('button');b.type='button';b.textContent=lbl;b.dataset.k=k;
    b.addEventListener('click',()=>{govMetric=k;syncChips();const box=document.getElementById('c-gov');if(govRows)drawGov(box,govRows);});chips.appendChild(b);});
  function syncChips(){chips.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.k===govMetric)));}
  syncChips();
  // Uma barra por mandato com a variação do indicador; a cor e o símbolo seguem o veredito, não o sinal.
  function drawGov(box,rows){
    box.classList.remove('dash-skeleton');box.innerHTML='';
    const m=GM.find(x=>x[0]===govMetric),k=m[0];
    const W=Math.max(260,box.clientWidth||320),rh=30,H=rows.length*rh+6;
    const svg=d3.select(box).append('svg').attr('width','100%').attr('viewBox',`0 0 ${W} ${H}`);
    const names=svg.append('g').selectAll('text').data(rows).join('text').text(r=>r.governo+(r.andamento?'*':''))
      .attr('y',(r,i)=>i*rh+rh/2+3).attr('dy','0.32em').attr('text-anchor','end')
      .style('font-size','var(--ui-font-size-caption)').style('fill','var(--color-fg)');
    const lw=d3.max(names.nodes(),n=>n.getComputedTextLength())+10;names.attr('x',lw-8);
    const res=rows.map(r=>r.ind[k]),vals=res.filter(Boolean).map(v=>v.delta);
    const lo=Math.min(0,d3.min(vals)||0),hi=Math.max(0,d3.max(vals)||0);
    const lbl=v=>VD[v.veredito][0]+' '+fmtDelta(m,v.delta);
    const probe=svg.append('g').selectAll('text').data(res.filter(Boolean)).join('text').text(lbl).style('font-size','var(--ui-font-size-caption)');
    const vw=(d3.max(probe.nodes(),n=>n.getComputedTextLength())||40)+12;probe.remove();
    const x=d3.scaleLinear([lo,hi||1],[lw+(lo<0?vw:0),W-vw]);
    svg.append('line').attr('x1',x(0)).attr('x2',x(0)).attr('y1',0).attr('y2',H).attr('stroke','var(--ui-chart-axis)').attr('stroke-width',1);
    const g=svg.append('g');
    res.forEach((v,i)=>{const yy=i*rh+6;
      if(!v){g.append('text').text('sem dado').attr('x',x(0)+6).attr('y',yy+12).attr('dy','0.32em')
        .style('font-size','var(--ui-font-size-caption)').style('fill','var(--color-fg-muted)');return;}
      g.append('rect').attr('x',Math.min(x(0),x(v.delta))).attr('width',Math.max(1,Math.abs(x(v.delta)-x(0)))).attr('y',yy).attr('height',20).attr('rx',4)
        .attr('fill',VCOR[v.veredito]);
      // Rótulo do lado de fora da ponta da barra: à direita se positiva, à esquerda se negativa.
      g.append('text').text(lbl(v)).attr('x',v.delta<0?x(v.delta)-6:x(v.delta)+6).attr('text-anchor',v.delta<0?'end':'start')
        .attr('y',yy+10).attr('dy','0.32em')
        .style('font-size','var(--ui-font-size-caption)').style('fill','var(--color-fg)').style('font-variant-numeric','tabular-nums');
    });
  }
  // Célula do Resumo: "herança → entrega ✓" ou "Brasil vs referência ✓"; os anos usados vão no title.
  function govCell(td,m,v){
    if(!v){td.textContent='—';td.title='sem dado';return;}
    const val=x=>nf(x,m[4]);
    if(v.brasil!=null){td.textContent=nf(v.brasil,1)+' vs '+nf(v.referencia,1)+' ';
      td.title=(m[0]==='pib'?'PIB médio do Brasil × América Latina':'IPCA médio × teto médio da meta')+' (% a.a.); diferença '+fmtDelta(m,v.delta);}
    else{td.textContent=val(v.herdou)+' → '+val(v.entregou)+' ';
      td.title=v.anoHerdou+' → '+(v.ate?mesAno(v.ate)+' (2026 parcial)':v.anoEntregou)+'; variação '+fmtDelta(m,v.delta);}
    const s=document.createElement('span');const [sym,cls,txt]=VD[v.veredito];s.className='vd '+cls;s.textContent=sym;s.title=txt;td.appendChild(s);
  }
  function govTable(rows){
    const th=document.querySelector('#t-gov thead'),tb=document.querySelector('#t-gov tbody');th.innerHTML='';tb.innerHTML='';
    const hr=document.createElement('tr');const h0=document.createElement('th');h0.textContent='Indicador';hr.appendChild(h0);
    rows.forEach(r=>{const h=document.createElement('th');h.textContent=r.governo;
      [r.anos,r.andamento?'em andamento':null].forEach(t=>{if(!t)return;const y=document.createElement('span');y.className='yr';y.textContent=t;h.appendChild(y);});
      hr.appendChild(h);});th.appendChild(hr);
    // O nome da linha leva à nota da fonte, em Fontes e notas.
    const linha=(nome,fonte,fill,cls)=>{const tr=document.createElement('tr');if(cls)tr.className=cls;const t0=document.createElement('td');
      t0.appendChild(link('#fonte-'+fonte,nome));tr.appendChild(t0);
      rows.forEach(r=>{const td=document.createElement('td');fill(td,r);tr.appendChild(td);});tb.appendChild(tr);};
    GM.forEach(m=>linha(m[1]+(m[5]?` (${m[5]})`:''),m[6],(td,r)=>govCell(td,m,r.ind[m[0]])));
    linha('Selic no fim (%, sem veredito)','selic',(td,r)=>{const s=r.ind.selic;td.textContent=s?nf(s.entregou,2):'—';
      if(s)td.title=s.ate?'em vigor em '+mesAno(s.ate)+' (2026 parcial)':'31/12/'+s.anoEntregou;});
    linha('Placar','governos',(td,r)=>{const p=r.placar;td.textContent=`✓ ${p.melhorou} · ✗ ${p.piorou} · = ${p.estavel}`;
      td.title=`melhorou ${p.melhorou}, piorou ${p.piorou}, estável ${p.estavel}, sem dado ${p.semDado}`;},'placar');
  }
  // Ranking do G20 contra o dólar (moedas_g20.csv): uma barra por moeda, da que mais ganhou valor em dólar para a que
  // mais perdeu. O real se distingue pela cor, pelo negrito e pela frase abaixo; os botões trocam o recorte.
  let g20Per='desde',g20Rows=null;
  const g20Chips=document.getElementById('g20-chips');
  const g20Sync=()=>g20Chips.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.k===g20Per)));
  const g20Rot=r=>r.periodo==='desde'?'Desde '+mesAno(r.de):'Em '+r.ate.slice(0,4)+' (até '+mesAno(r.ate).split('/')[0]+')';
  const pct=v=>(v>0?'+':'')+nf(v,1)+'%';
  function g20Botoes(){
    if(g20Chips.childElementCount)return;
    [...new Set(g20Rows.map(r=>r.periodo))].forEach(k=>{const b=document.createElement('button');b.type='button';b.dataset.k=k;
      b.textContent=g20Rot(g20Rows.find(r=>r.periodo===k));b.addEventListener('click',()=>{g20Per=k;g20Sync();drawG20();});
      g20Chips.appendChild(b);});
    g20Sync();
  }
  function drawG20(){
    const box=document.getElementById('c-g20'),rows=g20Rows.filter(r=>r.periodo===g20Per);
    box.classList.remove('dash-skeleton');box.innerHTML='';
    const W=Math.max(260,box.clientWidth||320),rh=22,H=rows.length*rh+6,cy=i=>i*rh+rh/2+3;
    const br=r=>r.moeda==='BRL',peso=r=>br(r)?700:400;
    const svg=d3.select(box).append('svg').attr('width','100%').attr('viewBox',`0 0 ${W} ${H}`);
    const txt=sel=>sel.attr('dy','0.32em').style('font-size','var(--ui-font-size-caption)').style('fill','var(--color-fg)').style('font-weight',peso);
    const names=txt(svg.append('g').selectAll('text').data(rows).join('text').text(r=>r.nome).attr('y',(r,i)=>cy(i)).attr('text-anchor','end'));
    const lw=d3.max(names.nodes(),n=>n.getComputedTextLength())+10;names.attr('x',lw-8);
    const probe=svg.append('g').selectAll('text').data(rows).join('text').text(r=>pct(r.variacao))
      .style('font-size','var(--ui-font-size-caption)').style('font-weight',700);
    const vw=d3.max(probe.nodes(),n=>n.getComputedTextLength())+10;probe.remove();
    const lo=Math.min(0,d3.min(rows,r=>r.variacao)),hi=Math.max(0,d3.max(rows,r=>r.variacao));
    const x=d3.scaleLinear([lo,hi||1],[lw+(lo<0?vw:0),W-vw]);
    svg.append('line').attr('x1',x(0)).attr('x2',x(0)).attr('y1',0).attr('y2',H).attr('stroke','var(--ui-chart-axis)').attr('stroke-width',1);
    const g=svg.append('g').selectAll('g').data(rows).join('g');
    // Passar o mouse mostra as duas cotações usadas na conta.
    g.append('title').text(r=>`${r.nome}: ${nf(r.cotacao_de,2)} → ${nf(r.cotacao_ate,2)} ${r.moeda} por US$ (${mesAno(r.de)} → ${mesAno(r.ate)})`);
    g.append('rect').attr('x',r=>Math.min(x(0),x(r.variacao))).attr('width',r=>Math.max(1,Math.abs(x(r.variacao)-x(0))))
      .attr('y',(r,i)=>cy(i)-7).attr('height',14).attr('rx',3).attr('fill',r=>br(r)?C[0]:CINZA);
    txt(g.append('text').text(r=>pct(r.variacao)).attr('y',(r,i)=>cy(i))
      .attr('x',r=>r.variacao<0?x(r.variacao)-5:x(r.variacao)+5).attr('text-anchor',r=>r.variacao<0?'end':'start'))
      .style('font-variant-numeric','tabular-nums');
    const i=rows.findIndex(br),r=rows[i];
    document.getElementById('g20-resumo').textContent=!r?'':
      `Real: ${i+1}º de ${rows.length} moedas do G20, ${pct(r.variacao)} em dólar de ${mesAno(r.de)} a ${mesAno(r.ate)}.`+
      (i?' À frente: '+rows.slice(0,i).map(q=>`${q.nome} (${pct(q.variacao)})`).join(', ')+'.':'');
  }
  const val=(rows,k,v,f)=>{const r=rows.find(x=>String(x[k])===String(v));return r?r[f]:null;};

  // Fontes (data/fontes.json) e data da última coleta de cada série (data/coleta.json, escrito pelo script; as séries
  // manuais trazem `conferido` no próprio fontes.json). Todo elemento com data-fontes="id ..." ganha a linha de fonte:
  // o cartão, com a origem, os links, o CSV e a data; o destaque e a abertura, só o nome com link para a nota.
  const json=u=>fetch(u,{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error(u+': HTTP '+r.status);return r.json();});
  const dataBR=s=>s.split('-').reverse().join('/');
  const quando=(f,coleta)=>coleta[f.id]?'coletado em '+dataBR(coleta[f.id]):f.conferido?'conferido na fonte em '+dataBR(f.conferido):'';
  const csvLink=a=>{const l=link('data/'+a,a);l.download=a;return l;};
  const lista=(p,itens,f,sep=' · ')=>itens.forEach((x,i)=>{if(i)p.append(sep);p.append(f(x));});
  const par=(pai,txt,cls)=>{const p=document.createElement('p');if(cls)p.className=cls;p.append(txt);pai.appendChild(p);return p;};
  Promise.all([json('data/fontes.json'),json('data/coleta.json').catch(e=>{console.error('[coleta]',e);return{};})]).then(([fontes,coleta])=>{
    const F=new Map(fontes.map(f=>[f.id,f]));
    document.querySelectorAll('#dash-root [data-fontes]').forEach(el=>{
      const fs=el.dataset.fontes.split(' ').map(id=>F.get(id)).filter(Boolean);if(!fs.length)return;
      if(!el.classList.contains('card')){
        const p=par(el,fs.length>1?'Fontes: ':'Fonte: ','src');lista(p,fs,f=>link('#fonte-'+f.id,f.title),', ');return;}
      const box=document.createElement('div');box.className='src';
      // Com mais de uma fonte, cada linha começa pelo nome da série, para dizer qual dado vem de onde.
      fs.forEach(f=>{const q=quando(f,coleta);
        lista(par(box,fs.length>1?f.title+': ':'Fonte: '+f.fonte+' · '),
          [...f.links.map(l=>link(l.url,l.texto)),...(q?[q]:[]),link('#fonte-'+f.id,'detalhes')],x=>x);});
      const csv=[...new Set(fs.flatMap(f=>f.arquivos)),...(fs.some(f=>f.parcial)?['parcial.csv']:[])];
      if(csv.length)lista(par(box,'Dados: '),csv,csvLink);
      el.appendChild(box);
    });
    const ul=document.getElementById('lista-fontes');
    fontes.forEach(f=>{const li=document.createElement('li');li.id='fonte-'+f.id;
      const b=document.createElement('b');b.textContent=f.title;li.appendChild(b);
      par(li,f.description);if(f.parcial)par(li,f.parcial);
      if(f.links.length)lista(par(li,'Origem: '),f.links,l=>link(l.url,l.texto));
      if(f.arquivos.length)lista(par(li,'Dados: '),f.arquivos,csvLink);
      const q=quando(f,coleta);if(q)par(li,q[0].toUpperCase()+q.slice(1)+'.');
      ul.appendChild(li);});
    // A página abriu com #fonte-x no endereço: o item só existe agora, então rola até ele.
    if(location.hash.startsWith('#fonte-'))document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }).catch(e=>console.error('[fontes]',e));

  dash.onData(()=>{
    // Séries com 2026 parcial: as linhas do parcial.csv entram como mais um ano (com `ate`). Sem o parcial.csv,
    // os gráficos saem só com os anos fechados.
    const parc=get('parcial').rows;
    const gp=id=>{const d=get(id);return d.status==='ok'?{status:'ok',rows:comParcial(d.rows,parc,id)}:d;};
    const pib=gp('pib'),ipca=gp('ipca'),selic=gp('selic'),div=gp('divida'),des=gp('desemprego'),
          gini=get('gini'),pob=get('pobreza'),fome=get('fome'),mapa=get('mapa_fome'),
          al=get('pib_mundo'),meta=get('meta_inflacao'),prim=gp('primario'),divl=gp('divida_liquida'),
          sal=gp('salario_minimo'),desm=get('desmatamento'),vac=get('vacinacao'),rend=gp('rendimento'),
          cam=gp('cambio'),efe=gp('cambio_efetivo'),moe=gp('moedas'),sdol=gp('salario_dolar'),ppc=get('pib_ppc');
    // Índice com base no primeiro ano (2000 = 100); inv: moeda por dólar vira dólar por moeda (o valor da moeda em dólar).
    const base=(rows,col,inv)=>{const b=rows[0][col];return rows.map(r=>({ano:r.ano,ate:r.ate,v:r[col]==null?null:(inv?b/r[col]:r[col]/b)*100}));};
    // Gráfico com duas fontes: só desenha quando as duas chegaram; senão mostra o estado da que falta.
    const ambos=(a,b)=>a.status!=='ok'?a.status:b.status;
    const D={pib:[pib,1],ipca:[ipca,2],selic:[selic,2],divida:[div,1],desemprego:[des,1],gini:[gini,3],fome:[fome,1],mapa_fome:[mapa,0]};
    for(const id in D){const [d,dec]=D[id];fillMarks(id,d.status==='ok'?d.rows:null,dec);}

    document.getElementById('t-pib-s').textContent=(pib.status==='ok'&&val(pib.rows,'ano',2025,'pib')>0)?'+':'';
    if(pib.status==='ok')arrow('a-pib',val(pib.rows,'ano',2025,'pib'),val(pib.rows,'ano',2024,'pib'),true);
    if(ipca.status==='ok')arrow('a-ipca',val(ipca.rows,'ano',2025,'ipca'),val(ipca.rows,'ano',2024,'ipca'),false);
    if(des.status==='ok')arrow('a-des',val(des.rows,'ano',2025,'taxa'),val(des.rows,'ano',2024,'taxa'),false);
    if(div.status==='ok')arrow('a-div',val(div.rows,'ano',2025,'divida'),val(div.rows,'ano',2024,'divida'),false);
    if(gini.status==='ok')arrow('a-gini',val(gini.rows,'ano',2025,'gini'),val(gini.rows,'ano',2024,'gini'),false);
    if(fome.status==='ok')arrow('a-fome',val(fome.rows,'periodo',2024,'ia_grave'),val(fome.rows,'periodo',2023,'ia_grave'),false);

    const mn=document.getElementById('minimo');mn.textContent='';
    if(des.status==='ok'){const pn=des.rows.filter(r=>r.pesquisa==='PNADC');const last=pn[pn.length-1];
      if(last&&last.taxa===d3.min(pn,r=>r.taxa))mn.textContent=', o menor nível desde o início da PNAD Contínua, em 2012';}

    let b;
    b=document.getElementById('c-pib');if(holdState(b,pib.status))draw(b,{kind:'bar',x0:2000,x1:2025,zero:true,d:1,unit:'%',
      series:[{rows:pib.rows,x:'ano',y:'pib',color:C[0]}],barColor:r=>r.pib<0?'var(--ui-chart-status-critical)':C[0]});
    b=document.getElementById('c-pibal');const lpa=document.getElementById('l-pibal');
    if(holdState(b,ambos(pib,al))){
      draw(b,{kind:'line',x0:2000,x1:2025,zero:true,d:1,unit:'%',series:[
        {rows:pib.rows,x:'ano',y:'pib',label:'Brasil',color:C[0]},
        {rows:al.rows,x:'ano',y:'america_latina',label:'América Latina',color:C[1]}]});
      legend(lpa,[[C[0],'Brasil'],[C[1],'América Latina e Caribe (FMI)']]);
    }else lpa.innerHTML='';
    b=document.getElementById('c-ipca');const li=document.getElementById('l-ipca');
    if(holdState(b,ambos(ipca,meta))){
      draw(b,{kind:'line',x0:2000,x1:2025,zero:true,d:2,unit:'%',series:[
        {rows:ipca.rows,x:'ano',y:'ipca',label:'IPCA',color:C[0]},
        {rows:meta.rows.filter(r=>r.ano<=d3.max(ipca.rows,q=>q.ano)).map(r=>({ano:r.ano,teto:r.meta+r.tolerancia})),x:'ano',y:'teto',label:'Teto da meta',color:C[1]}]});
      legend(li,[[C[0],'IPCA'],[C[1],'Teto da meta (meta + tolerância)']]);
    }else li.innerHTML='';
    b=document.getElementById('c-selic');if(holdState(b,selic.status))draw(b,{kind:'line',x0:2000,x1:2025,zero:true,d:2,unit:'%',
      series:[{rows:selic.rows,x:'ano',y:'selic',color:C[0]}]});
    b=document.getElementById('c-prim');if(holdState(b,prim.status))draw(b,{kind:'bar',x0:2000,x1:2025,zero:true,d:2,unit:'%',
      series:[{rows:prim.rows,x:'ano',y:'primario',color:C[0]}],barColor:r=>r.primario<0?'var(--ui-chart-status-critical)':C[0]});
    b=document.getElementById('c-div');const ldv=document.getElementById('l-div');
    if(holdState(b,ambos(div,divl))){
      draw(b,{kind:'line',x0:2001,x1:2025,zero:false,d:1,unit:'%',series:[
        {rows:div.rows,x:'ano',y:'divida',label:'Bruta',color:C[0]},
        {rows:divl.rows,x:'ano',y:'divida_liquida',label:'Líquida',color:C[1]}]});
      legend(ldv,[[C[0],'Bruta · governo geral (desde 2006)'],[C[1],'Líquida · setor público (desde 2001)']]);
    }else ldv.innerHTML='';
    b=document.getElementById('c-sal');if(holdState(b,sal.status))draw(b,{kind:'line',x0:2000,x1:2025,zero:false,d:0,pre:'R$ ',
      series:[{rows:sal.rows,x:'ano',y:'salario_real',color:C[0]}]});
    b=document.getElementById('c-desm');if(holdState(b,desm.status))draw(b,{kind:'bar',x0:2000,x1:2026,zero:true,d:0,unit:' km²',
      series:[{rows:desm.rows,x:'ano',y:'km2',color:C[0]}],tag:r=>r.tipo==='estimativa'?'estimativa':'',
      prov:r=>r.tipo==='estimativa',provTxt:'Barra vazada: estimativa do INPE, ainda não consolidada.'});
    b=document.getElementById('c-rend');if(holdState(b,rend.status))draw(b,{kind:'line',x0:2012,x1:2025,zero:false,d:0,pre:'R$ ',
      series:[{rows:rend.rows,x:'ano',y:'rendimento',color:C[0]}]});
    b=document.getElementById('c-cambio');if(holdState(b,cam.status))draw(b,{kind:'line',x0:2000,x1:2025,zero:true,d:2,pre:'R$ ',
      series:[{rows:cam.rows,x:'ano',y:'cambio',color:C[0]}]});
    b=document.getElementById('c-efetivo');const lef=document.getElementById('l-efetivo');
    if(holdState(b,efe.status)){
      draw(b,{kind:'line',x0:2000,x1:2025,zero:false,d:0,rotulos:true,series:[
        {rows:base(efe.rows,'brasil'),x:'ano',y:'v',label:'Real',color:C[0]},
        {rows:base(efe.rows,'eua'),x:'ano',y:'v',label:'Dólar',color:C[1]}]});
      legend(lef,[[C[0],'Real brasileiro'],[C[1],'Dólar americano']]);
    }else lef.innerHTML='';
    // O real em destaque e as outras moedas em cinza, com o nome no fim da linha: cinco cores não se distinguem para
    // quem é daltônico, e a pergunta do gráfico é o real contra as outras.
    b=document.getElementById('c-moedas');const lmo=document.getElementById('l-moedas');
    if(holdState(b,moe.status)){
      draw(b,{kind:'line',x0:2000,x1:2025,zero:false,d:0,rotulos:true,series:[
        ...[['mexico','Peso'],['africa_do_sul','Rand'],['india','Rúpia'],['euro','Euro']].map(([k,l])=>
          ({rows:base(moe.rows,k,true),x:'ano',y:'v',label:l,color:CINZA,width:1.5})),
        {rows:base(moe.rows,'brasil',true),x:'ano',y:'v',label:'Real',color:C[0],width:3}]});
      legend(lmo,[[C[0],'Real (linha grossa)'],[CINZA,'Peso mexicano, rand sul-africano, rúpia indiana e euro (nome no fim de cada linha)']]);
    }else lmo.innerHTML='';
    const g20=get('moedas_g20');
    if(holdState(document.getElementById('c-g20'),g20.status)){g20Rows=g20.rows;g20Botoes();drawG20();}
    else document.getElementById('g20-resumo').textContent='';
    b=document.getElementById('c-saldolar');if(holdState(b,sdol.status))draw(b,{kind:'line',x0:2000,x1:2025,zero:true,d:0,pre:'US$ ',
      series:[{rows:sdol.rows,x:'ano',y:'salario_dolar',color:C[0]}]});
    b=document.getElementById('c-ppc');const lpp=document.getElementById('l-ppc');
    if(holdState(b,ppc.status)){
      draw(b,{kind:'line',x0:2000,x1:2025,zero:false,d:0,pre:'US$ ',rotulos:true,series:[
        {rows:ppc.rows,x:'ano',y:'mundo',label:'Mundo',color:C[2]},
        {rows:ppc.rows,x:'ano',y:'america_latina',label:'Am. Latina',color:C[1]},
        {rows:ppc.rows,x:'ano',y:'brasil',label:'Brasil',color:C[0]}]});
      legend(lpp,[[C[0],'Brasil'],[C[1],'América Latina e Caribe'],[C[2],'Mundo']]);
    }else lpp.innerHTML='';
    b=document.getElementById('c-vac');if(holdState(b,vac.status))draw(b,{kind:'line',x0:2000,x1:2025,zero:false,d:0,unit:'%',
      series:[{rows:vac.rows,x:'ano',y:'sarampo',color:C[0]}]});
    b=document.getElementById('c-des');const ld=document.getElementById('l-des');
    if(holdState(b,des.status)){
      draw(b,{kind:'line',x0:2003,x1:2025,zero:true,d:1,unit:'%',series:[
        {rows:des.rows.filter(r=>r.pesquisa==='PME'),x:'ano',y:'taxa',label:'PME (6 metrópoles)',color:C[1]},
        {rows:des.rows.filter(r=>r.pesquisa==='PNADC'),x:'ano',y:'taxa',label:'PNAD Contínua (Brasil)',color:C[0]}]});
      legend(ld,[[C[1],'PME · 6 regiões metropolitanas'],[C[0],'PNAD Contínua · Brasil']]);
    }else ld.innerHTML='';
    b=document.getElementById('c-gini');if(holdState(b,gini.status))draw(b,{kind:'line',x0:2012,x1:2025,zero:false,d:3,td:2,unit:'',dots:true,
      series:[{rows:gini.rows,x:'ano',y:'gini',color:C[0]}]});
    b=document.getElementById('c-pob');const lp=document.getElementById('l-pob');
    if(holdState(b,pob.status)){
      draw(b,{kind:'line',x0:2012,x1:2024,zero:true,d:1,unit:'%',dots:true,series:[
        {rows:pob.rows,x:'ano',y:'pobreza',label:'Pobreza',color:C[1]},
        {rows:pob.rows,x:'ano',y:'extrema',label:'Extrema pobreza',color:C[0]}]});
      legend(lp,[[C[1],'Pobreza (US$ 6,85/dia)'],[C[0],'Extrema pobreza (US$ 2,15/dia)']]);
    }else lp.innerHTML='';
    b=document.getElementById('c-fome');if(holdState(b,fome.status))draw(b,{kind:'bar',cat:true,zero:true,d:1,unit:'%',
      series:[{rows:fome.rows,x:'periodo',y:'ia_grave',color:C[0]}]});

    const tb=document.querySelector('#t-mapa tbody');tb.innerHTML='';
    if(mapa.status==='ok'){mapa.rows.forEach(r=>{const tr=document.createElement('tr');
      ['relatorio','situacao','detalhe'].forEach(f=>{const td=document.createElement('td');td.textContent=r[f]==null?'':String(r[f]);
        if(f==='situacao')td.className='st '+(r[f]==='No mapa'?'in':'out');tr.appendChild(td);});tb.appendChild(tr);});}

    const gv=dash.data('governos'),gb=document.getElementById('c-gov');
    if(holdState(gb,gv.status)){govRows=gv.data;drawGov(gb,govRows);govTable(govRows);}
    else{govRows=null;document.querySelector('#t-gov thead').innerHTML='';document.querySelector('#t-gov tbody').innerHTML='';}
  });
})();
