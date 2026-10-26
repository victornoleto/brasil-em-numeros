# Brasil em números 2000–2025

Painel estático com os principais indicadores do Brasil de 2000 a 2025, com 2026 parcial
(PIB, inflação, Selic, contas públicas, investimento federal, desemprego, salário mínimo,
rendimento do trabalho, câmbio e poder de compra, Gini, pobreza, insegurança alimentar, Mapa da
Fome, desmatamento, energia, vacinação, mortalidade infantil e ensino superior) e um placar por
mandato presidencial. Fontes: IBGE, Banco Central, Tesouro Nacional, Ipea, INPE, EPE,
OMS/UNICEF, ONU (IGME), FMI, BIS, Federal Reserve, Banco Mundial e FAO/ONU. Cada gráfico mostra de onde
vêm os dados, com link para a origem e para o CSV.

Não tem build, back-end nem dependências externas: HTML + CSS + JS puro, com o d3 v7.9.0
incluído na pasta. Os dados ficam em arquivos CSV.

Código aberto (licença MIT) para quem quiser revisar: se um número estiver errado, abra uma
issue com o link da fonte oficial.

## Estrutura

```
brasil-em-numeros/
├── public/                  ← tudo que vai para o servidor
│   ├── index.html
│   ├── assets/
│   │   ├── css/theme.css    ← cores, fontes e espaçamentos (tema claro/escuro)
│   │   ├── css/app.css      ← layout do painel
│   │   ├── js/d3.v7.9.0.min.js
│   │   ├── js/dash.js       ← carrega os CSVs e avisa a página quando chegam
│   │   ├── js/parcial.js    ← junta o 2026 parcial às séries anuais
│   │   ├── js/governos.js   ← cálculo por mandato (herança → entrega e placar)
│   │   ├── js/ranking.js    ← ranking dos mandatos com os pesos do leitor
│   │   └── js/app.js        ← gráficos e tabelas
│   └── data/
│       ├── *.csv            ← uma série por arquivo (parcial.csv: o ano corrente)
│       ├── coleta.json      ← data da última coleta de cada série (escrito pelo script)
│       └── fontes.json      ← origem de cada série: texto, links e CSVs
├── scripts/atualizar_dados.py ← baixa das APIs oficiais as séries que têm API
├── tests/                   ← testes do placar, do parcial e do script
├── Dockerfile
├── docker-compose.yml
├── nginx.conf               ← nginx do container
├── nginx.local.conf         ← vhost brasil-em-numeros.local no nginx do host
└── headers.inc              ← cabeçalhos de segurança (CSP etc.)
```

## Rodar localmente

A página busca os CSVs com `fetch`, então **não funciona abrindo o index.html direto
do disco** (`file://`).

No nginx do host, como `http://brasil-em-numeros.local/`: o vhost serve `public/` direto,
sem cache, então uma edição aparece no próximo F5. Instalação, uma vez:

```bash
sudo cp nginx.local.conf /etc/nginx/sites-available/brasil-em-numeros.local
sudo ln -sf /etc/nginx/sites-available/brasil-em-numeros.local /etc/nginx/sites-enabled/brasil-em-numeros.local
grep -q brasil-em-numeros.local /etc/hosts || echo '127.0.0.1 brasil-em-numeros.local' | sudo tee -a /etc/hosts
sudo nginx -t && sudo systemctl reload nginx
```

O vhost é copiado, não linkado: depois de editar `nginx.local.conf`, repita o `cp` e o
`reload`. Os caminhos no arquivo apontam para `/var/www/victor/brasil-em-numeros`; ajuste
para a pasta onde você clonou.

Sem nginx, qualquer servidor estático serve:

```bash
cd public
python3 -m http.server 8080
# abra http://localhost:8080
```

## Subir com Docker (recomendado)

```bash
docker compose up -d --build
# http://SEU_SERVIDOR:8080
```

A imagem é `nginx:1.27-alpine` (~20 MB) com gzip, cache e uma Content-Security-Policy
restrita (só scripts e estilos do próprio domínio). Há um healthcheck em `/healthz`.

Para trocar a porta, edite `ports` no `docker-compose.yml`.

### Atrás de um proxy reverso com HTTPS

Aponte o proxy para o container na porta 80 (ou para a 8080 do host). Exemplos:

**Caddy**
```
indicadores.seudominio.com.br {
    reverse_proxy localhost:8080
}
```

**Traefik (labels no docker-compose.yml)**
```yaml
    labels:
      - traefik.enable=true
      - traefik.http.routers.brasil.rule=Host(`indicadores.seudominio.com.br`)
      - traefik.http.routers.brasil.tls.certresolver=letsencrypt
      - traefik.http.services.brasil.loadbalancer.server.port=80
```

## Subir sem Docker (nginx, Apache, hospedagem estática)

Copie o conteúdo de `public/` para a raiz do site. Se for nginx, você pode reaproveitar
`nginx.conf` + `headers.inc` (ajuste `root`). O site também funciona em qualquer
hospedagem estática (GitHub Pages, Cloudflare Pages, Netlify, S3), inclusive em
subpasta, porque todos os caminhos são relativos.

## Atualizar os dados

As séries que têm API oficial (IBGE, Banco Central, Ipea, OMS, FMI, BIS, Federal Reserve e
Banco Mundial) são baixadas por um script sem dependências, de 2000 até o último ano
completo. Leva de 2 a 12 minutos, conforme a API do Banco Central:

```bash
python3 scripts/atualizar_dados.py               # todas
python3 scripts/atualizar_dados.py selic divida  # só algumas (nome do CSV sem .csv)
```

Cada CSV só é trocado depois que a coleta dele termina sem erro: uma falha deixa o arquivo
anterior intacto e o script sai com código 1 e diz quais séries rodar de novo (a API do
Banco Central às vezes devolve 503). Rode de novo todo mês, para o parcial, e quando sair o
ano novo ou uma revisão (o IBGE revisa o PIB, e o BC recalcula a dívida em seguida).

O ano corrente vai para `parcial.csv` (`serie,coluna,ano,valor,ate`), e não para os CSVs
anuais: fluxos e médias usam os últimos 12 meses (o PIB, os últimos 4 trimestres) e estoques
(dívidas, Selic), o último mês. `ate` é o último mês com dado. A página junta o parcial a
cada série (`parcial.js`) e o desenha tracejado ou vazado. O script também grava em
`coleta.json` a data da coleta de cada série, que a página mostra na linha de fonte.

Os demais CSVs são editados à mão. Use **ponto** como separador decimal e vírgula para
separar colunas (campos com vírgula vão entre aspas, como em `mapa_fome.csv`).

| Arquivo | Colunas | Origem e observação |
|---|---|---|
| `pib.csv` | `ano,pib` | script · IBGE, variação real % |
| `pib_mundo.csv` | `ano,america_latina,mundo` | script · FMI, mesmos anos do `pib.csv` |
| `ipca.csv` | `ano,ipca` | script · % no ano |
| `meta_inflacao.csv` | `ano,meta,tolerancia` | à mão · CMN, % |
| `selic.csv` | `ano,selic` | script · meta em 31/12, % a.a. |
| `primario.csv` | `ano,primario` | script · governo federal, % do PIB; superávit > 0 |
| `investimento.csv` | `ano,investimento` | à mão · Tesouro (RTN, Tabela 2.3-A), investimento do governo central, % do PIB, desde 2008 |
| `divida.csv` | `ano,divida` | script · bruta do governo geral, % do PIB, dezembro |
| `divida_liquida.csv` | `ano,divida_liquida` | script · líquida do setor público, % do PIB, dezembro |
| `desemprego.csv` | `ano,taxa,pesquisa` | à mão (o parcial vem do script) · `pesquisa` = `PME` ou `PNADC` |
| `salario_minimo.csv` | `ano,salario_real` | script · Ipea, média do ano em R$ de hoje |
| `rendimento.csv` | `ano,rendimento` | script · IBGE, rendimento real do trabalho, R$ de hoje |
| `cambio.csv` | `ano,cambio` | script · Banco Central, R$ por US$, média do ano |
| `cambio_efetivo.csv` | `ano,brasil,eua` | script · BIS, câmbio efetivo nominal, 2020 = 100 |
| `moedas.csv` | `ano,brasil,mexico,africa_do_sul,india,euro` | script · Federal Reserve, moeda por US$ |
| `moedas_g20.csv` | `periodo,de,ate,moeda,nome,cotacao_de,cotacao_ate,variacao` | script · BIS, ranking do G20 contra o dólar desde dez/2024 (`DESDE` no script) e no ano corrente |
| `salario_dolar.csv` | `ano,salario_dolar` | script · Banco Central, US$ por mês |
| `pib_ppc.csv` | `ano,brasil,america_latina,mundo` | script · Banco Mundial, US$ PPC de 2021 |
| `gini.csv` | `ano,gini` | script · IBGE |
| `pobreza.csv` | `ano,extrema,pobreza` | à mão · % da população; célula vazia = sem dado |
| `fome.csv` | `periodo,ia_grave,pesquisa` | à mão · % dos domicílios |
| `mapa_fome.csv` | `relatorio,situacao,detalhe` | à mão · `situacao` = `No mapa` ou `Fora do mapa` |
| `desmatamento.csv` | `ano,km2,tipo` | à mão · INPE Prodes; `tipo` = `consolidado` ou `estimativa` |
| `renovaveis.csv` | `ano,renovaveis` | à mão · EPE (BEN, Tabela 1.3.b), % da oferta interna de energia |
| `energia_eletrica.csv` | `ano,energia_eletrica` | script · Banco Mundial, % da população com acesso |
| `vacinacao.csv` | `ano,sarampo` | script · OMS/UNICEF, % com a 1ª dose |
| `mortalidade_infantil.csv` | `ano,mortalidade_infantil` | script · ONU (IGME) via Banco Mundial, por mil nascidos vivos |
| `ensino_superior.csv` | `ano,ensino_superior` | script · IBGE, % de 18 a 24 anos; sem 2020 e 2021 (`LACUNAS` no script) |
| `parcial.csv` | `serie,coluna,ano,valor,ate` | script · ano corrente, até o mês `ate` |

Os cartões do topo usam o último ano fechado (2025; fome, 2024) fixo no HTML: quando 2026
fechar, troque os `data-where="ano=2025"` em `index.html` e os anos em `app.js` (função
`arrow`).

### Fontes

Cada série tem uma entrada em `public/data/fontes.json`: `title`, `fonte`, `description`,
`parcial` (a regra do ano corrente, se houver), `links` (`texto` e `url` da origem) e
`arquivos` (os CSVs). Todo cartão, destaque ou trecho com `data-fontes="id ..."` no HTML
ganha a linha de fonte com esses links, o CSV e a data da coleta (do `coleta.json`). Nas
séries feitas à mão, registre em `conferido` a data em que os valores foram conferidos na
fonte. Série nova = linha no `SERIES` do script, entrada no `fontes.json` e `data-fontes`
no cartão.

Com o volume comentado no `docker-compose.yml`, os CSVs ficam montados do host e
podem ser editados sem rebuild da imagem.

## Placar por mandato

O cálculo fica em `public/assets/js/governos.js` (`dash.calc('governos', ...)`), fora do
`app.js` para ser testado com o Node, sem navegador e sem dependências. Os testes do script
de dados não usam rede:

```bash
node --test tests/
python3 -B -m unittest discover -s tests -p 'test_*.py'
```

- O ano conta para quem governou a maior parte dele: Dilma 2 = 2015, Temer = 2016–2018.
  A lista fica em `MANDATOS`, no início do arquivo.
- Indicadores de nível (desemprego, primário, investimento federal, dívidas, Gini, pobreza,
  fome, salário mínimo, rendimento do trabalho, desmatamento, energia renovável, acesso à
  energia elétrica, vacinação, mortalidade infantil e ensino superior) comparam herança e entrega. Herança é o último valor
  dos 4 anos anteriores ao mandato, ou o 1º do próprio mandato se não houver. Entrega é o
  último valor do mandato. O desemprego só compara a mesma pesquisa (PME × PNAD Contínua).
- PIB: média composta do Brasil contra a da América Latina nos mesmos anos. IPCA: média
  composta contra a média do teto da meta (meta + tolerância).
- Variação dentro da tolerância (`tol` em `NIVEIS`) conta como estável. O placar soma
  ✓, ✗ e = sem pesos, e a Selic entra só como contexto.
- O mandato em andamento usa o 2026 parcial como entrega nos indicadores de nível (e na
  Selic); PIB e IPCA usam só anos fechados.

### Monte seu ranking

O leitor dá a cada indicador do placar um peso de −10 a +10, e os mandatos se reordenam na hora
(`public/assets/js/ranking.js`, testado em `tests/ranking.test.js`). Cada indicador vale o
veredito do placar (✓ +1, = 0, ✗ −1) vezes o peso; a nota é `Σ peso × veredito / Σ |peso|`,
de −100 a +100, só com os indicadores que têm dado no mandato. Peso 0 ignora o indicador e
peso negativo inverte o sentido. Os pesos começam em +5 (com pesos iguais, o ranking repete o
placar) e ficam no `localStorage` do navegador.

## Sobre os números

As séries do script saem direto das APIs oficiais e mudam quando os órgãos as revisam
(sobretudo a dívida, recalculada pelo BC quando o IBGE revisa o PIB). Desemprego,
pobreza, insegurança alimentar, Mapa da Fome, metas de inflação, desmatamento, investimento
federal e energia renovável foram transcritos das publicações oficiais e conferidos em 26/10/2026. O desmatamento de 2026 é a estimativa do Prodes divulgada em
outubro de 2026; o consolidado sai no ano seguinte. Detalhes na seção "Fontes e notas"
do próprio painel.

## Licenças

Código: MIT (`LICENSE`). d3 v7.9.0: ISC, © Mike Bostock (`public/assets/js/d3.LICENSE.txt`).
Dados: das instituições citadas em cada série (seção "Fontes e notas" e
`public/data/fontes.json`), sob os termos de uso de cada uma.
