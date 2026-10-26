#!/usr/bin/env python3
"""Atualiza os CSVs de public/data/ que vêm de APIs oficiais (IBGE, BCB, Ipea, OMS, FMI, BIS,
Federal Reserve e Banco Mundial).

Uso: python3 scripts/atualizar_dados.py [série ...]    (sem argumento, todas; ex.: selic divida)

Os CSVs anuais têm só anos completos. O ano corrente, até o último mês divulgado, vai para o
parcial.csv (serie,coluna,ano,valor,ate): fluxos e médias usam os últimos 12 meses (o PIB, os
últimos 4 trimestres) e estoques, o último mês. O coleta.json guarda a data da última coleta
de cada série, que a página mostra junto da fonte.

Desemprego (anual), pobreza, fome, Mapa da Fome, desmatamento e meta de inflação são
editados à mão (não têm API estável); do desemprego, o script só calcula o parcial. Cada CSV só é
trocado depois que a coleta dele termina sem erro: uma falha deixa o arquivo anterior intacto e a
linha antiga da série no parcial.csv, e o script sai com código 1.
"""
import csv
import datetime
import functools
import io
import json
import os
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from decimal import ROUND_HALF_UP, Decimal

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'data')
INICIO = 2000
HOJE = datetime.date.today()
ULTIMO = HOJE.year - 1  # último ano completo


def baixar(url, tentativas=3, texto=False):
    # A API do BCB às vezes devolve 502 ou uma página HTML de erro com status 200;
    # a mesma consulta costuma passar segundos depois.
    req = urllib.request.Request(url, headers={'User-Agent': 'brasil-em-numeros',
                                               'Accept': '*/*' if texto else 'application/json'})
    for n in range(1, tentativas + 1):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return r.read().decode('utf-8').lstrip('﻿') if texto else json.load(r)
        except (OSError, ValueError):  # URLError/HTTPError/timeout são OSError; JSON inválido é ValueError
            if n == tentativas:
                raise
            time.sleep(5 * n)


@functools.cache  # o câmbio mensal (3698) serve a duas séries; quem usa não altera o dicionário
def sgs(codigo):
    """Série do SGS do Banco Central como {date: valor}, até o ano corrente. Consulta em janelas
    de 10 anos, o limite da API para séries diárias."""
    pontos = {}
    for a in range(INICIO, HOJE.year + 1, 10):
        b = min(a + 9, HOJE.year)
        url = (f'https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados'
               f'?formato=json&dataInicial=01/01/{a}&dataFinal=31/12/{b}')
        for p in baixar(url):
            d, m, y = map(int, p['data'].split('/'))
            pontos[datetime.date(y, m, d)] = float(p['valor'])
    return pontos


def por_ano(pontos, mes=None):
    """Um valor por ano: o do mês `mes` (dezembro nas séries acumuladas em 12 meses) ou,
    sem `mes`, o último do ano (série anual ou diária)."""
    out = {}
    for d in sorted(pontos):
        if mes is None or d.month == mes:
            out[d.year] = pontos[d]
    return out


def media_por_ano(pontos, n):
    """Média de cada ano com exatamente `n` pontos (12 meses ou 4 trimestres): o ano corrente,
    incompleto, fica de fora."""
    anos = {}
    for d, v in pontos.items():
        anos.setdefault(d.year, []).append(v)
    return {a: sum(v) / n for a, v in anos.items() if len(v) == n}


def media_ultimos(pontos, n):
    """Média dos `n` pontos mais recentes e a data do último."""
    datas = sorted(pontos)[-n:]
    if len(datas) < n:
        raise ValueError(f'só {len(datas)} pontos para a média de {n}')
    return sum(pontos[d] for d in datas) / n, datas[-1]


def ultimo(pontos):
    """Último valor como parcial: estoques (dívida) e séries já acumuladas em 12 meses (IPCA)."""
    d = max(pontos)
    return (pontos[d],), d


def ultimo_ate(pontos, hoje):
    """Último valor com data até `hoje`: o SGS 432 já traz a Selic até a próxima reunião do Copom."""
    d = max(d for d in pontos if d <= hoje)
    return pontos[d], d


def meses_antes(d, k):
    m = d.year * 12 + d.month - 1 - k
    return datetime.date(m // 12, m % 12 + 1, 1)


def trimestres_12m(pontos):
    """Média dos trimestres móveis que terminam no último mês divulgado e 3, 6 e 9 meses antes:
    12 meses sem sobreposição, como a média anual, sem o viés sazonal de usar só o ano corrente."""
    fim = max(pontos)
    return sum(pontos[meses_antes(fim, k)] for k in (0, 3, 6, 9)) / 4, fim


def ultimo_ano(arquivo):
    with open(os.path.join(DATA, arquivo), newline='', encoding='utf-8') as f:
        return max(int(r['ano']) for r in csv.DictReader(f))


def sidra(caminho):
    return baixar('https://apisidra.ibge.gov.br/values' + caminho)[1:]  # a 1ª linha é o cabeçalho


def pib():
    # Contas Nacionais anuais (definitivas, saem com 2 anos de defasagem) e, nos anos seguintes,
    # a taxa acumulada no ano até o 4º trimestre das Contas Trimestrais. Não usa o SGS 7326 do
    # BCB: ele guarda 2 casas, e arredondar de novo erra (2015: −3,55 → −3,6; o IBGE publica −3,5).
    out = {int(r['D3C']): float(r['V']) for r in sidra('/t/6784/n1/all/v/9810/p/all')}
    tri = {}
    for r in sidra('/t/5932/n1/all/v/6563/p/all/c11255/90707'):
        ano, t = int(r['D3C'][:4]), int(r['D3C'][4:])
        tri[datetime.date(ano, t * 3, 1)] = float(r['V'])
        if t == 4 and ano not in out:
            out[ano] = float(r['V'])
    return out, ultimo(tri)  # parcial: taxa acumulada nos 4 trimestres até o último divulgado


def ipca():
    p = sgs(13522)  # acumulado em 12 meses
    return por_ano(p, mes=12), ultimo(p)


def selic():
    p = sgs(432)
    v, d = ultimo_ate(p, HOJE)
    return por_ano(p), ((v,), d)


def divida():
    p = sgs(13762)
    return por_ano(p, mes=12), ultimo(p)


def divida_liquida():
    p = sgs(4513)
    return por_ano(p, mes=12), ultimo(p)


def primario():
    # NFSP: positivo é déficit. O painel mostra o resultado (superávit positivo).
    p = {d: -v for d, v in sgs(5784).items()}
    return por_ano(p, mes=12), ultimo(p)


def salario_minimo():
    url = "http://www.ipeadata.gov.br/api/odata4/ValoresSerie(SERCODIGO='GAC12_SALMINRE12')"
    p = {datetime.date(int(v['VALDATA'][:4]), int(v['VALDATA'][5:7]), 1): v['VALVALOR']
         for v in baixar(url)['value'] if v['VALVALOR'] is not None}
    v, d = media_ultimos(p, 12)
    return media_por_ano(p, 12), ((v,), d)


def pnadc_movel(caminho):
    """PNAD Contínua por trimestre móvel como {1º dia do mês em que o trimestre termina: valor}."""
    return {datetime.date(int(r['D3C'][:4]), int(r['D3C'][4:]), 1): float(r['V']) for r in sidra(caminho)}


def desemprego():
    # O anual é manual (PME + PNAD Contínua); daqui sai só o parcial.
    v, d = trimestres_12m(pnadc_movel('/t/6381/n1/all/v/4099/p/last%2012'))
    return None, ((v,), d)


def rendimento():
    # Rendimento médio real habitual de todos os trabalhos, em R$ do último trimestre móvel divulgado.
    # A tabela trimestral (5436) não tem 2020T2–2022T1; a de trimestres móveis tem, e o trimestre
    # móvel que termina em março, junho, setembro ou dezembro é o trimestre do calendário.
    p = pnadc_movel('/t/6390/n1/all/v/5933/p/all')
    v, d = trimestres_12m(p)
    return media_por_ano({m: x for m, x in p.items() if m.month % 3 == 0}, 4), ((v,), d)


def gini():
    # Índice de Gini do rendimento domiciliar per capita (PNAD Contínua anual, Rendimento de todas as fontes).
    return {int(r['D3C']): float(r['V']) for r in sidra('/t/7435/n1/all/v/10681/p/all')}, None


def cambio():
    p = sgs(3698)  # R$ por US$, venda, média do mês
    v, d = media_ultimos(p, 12)
    return media_por_ano(p, 12), ((v,), d)


def salario_dolar():
    # Salário mínimo do mês (o SGS 1619 já traz os meses futuros do ano) ÷ dólar médio do mês.
    sm, dolar = sgs(1619), sgs(3698)
    p = {d: sm[d] / dolar[d] for d in dolar if d in sm}
    v, d = media_ultimos(p, 12)
    return media_por_ano(p, 12), ((v,), d)


def cambio_efetivo():
    # Taxa de câmbio efetiva nominal, cesta ampla do BIS (2020 = 100; subir = moeda mais forte).
    texto = baixar('https://stats.bis.org/api/v1/data/WS_EER/M.N.B.BR+US/all'
                   f'?startPeriod={INICIO}-01&detail=dataonly&format=csv', texto=True)
    serie = {'BR': {}, 'US': {}}
    for r in csv.DictReader(io.StringIO(texto)):
        if r['OBS_VALUE']:
            a, m = map(int, r['TIME_PERIOD'].split('-'))
            serie[r['REF_AREA']][datetime.date(a, m, 1)] = float(r['OBS_VALUE'])
    comum = serie['BR'].keys() & serie['US'].keys()
    br, us = ({d: s[d] for d in comum} for s in (serie['BR'], serie['US']))
    anual_br, anual_us = media_por_ano(br, 12), media_por_ano(us, 12)
    (vb, d), (vu, _) = media_ultimos(br, 12), media_ultimos(us, 12)
    return {a: (anual_br[a], anual_us[a]) for a in anual_br if a in anual_us}, ((vb, vu), d)


def fred(ids):
    """Séries do FRED (Federal Reserve Bank of St. Louis) como {id: {date: valor}}."""
    texto = baixar('https://fred.stlouisfed.org/graph/fredgraph.csv?id=' + ','.join(ids), texto=True)
    out = {i: {} for i in ids}
    for r in csv.DictReader(io.StringIO(texto)):
        d = datetime.date.fromisoformat(r['observation_date'])
        for i in ids:
            if r[i] not in ('', '.'):
                out[i][d] = float(r[i])
    return out


# Coluna do moedas.csv → sufixo das séries do Federal Reserve (AEX* anual, EX* mensal).
MOEDAS = {'brasil': 'BZUS', 'mexico': 'MXUS', 'africa_do_sul': 'SFUS', 'india': 'INUS', 'euro': 'USEU'}


def moedas():
    # Unidades de cada moeda por US$. O Fed dá o euro em US$ por euro: inverte para ficar igual às
    # outras (no anual, 1 ÷ média do ano; a diferença para a média de 1 ÷ cotação é desprezível).
    anual, mensal = fred(['AEX' + c for c in MOEDAS.values()]), fred(['EX' + c for c in MOEDAS.values()])
    por_dolar = lambda c, p: {d: 1 / v for d, v in p.items()} if c == 'USEU' else p  # noqa: E731
    anos = [{d.year: v for d, v in por_dolar(c, anual['AEX' + c]).items()} for c in MOEDAS.values()]
    meses = [por_dolar(c, mensal['EX' + c]) for c in MOEDAS.values()]
    comum = set.intersection(*(set(m) for m in meses))
    ult = [media_ultimos({d: m[d] for d in comum}, 12) for m in meses]
    out = {a: tuple(s[a] for s in anos) for a in anos[0] if all(a in s for s in anos)}
    return out, (tuple(v for v, _ in ult), ult[0][1])


# Moedas do G20 (os EUA ficam de fora: a comparação é contra o dólar) → (país no BIS, nome). A zona do euro é XM.
G20 = {'ARS': ('AR', 'Peso argentino'), 'AUD': ('AU', 'Dólar australiano'), 'BRL': ('BR', 'Real'),
       'CAD': ('CA', 'Dólar canadense'), 'CNY': ('CN', 'Yuan'), 'EUR': ('XM', 'Euro'), 'GBP': ('GB', 'Libra'),
       'INR': ('IN', 'Rúpia indiana'), 'IDR': ('ID', 'Rupia indonésia'), 'JPY': ('JP', 'Iene'), 'KRW': ('KR', 'Won'),
       'MXN': ('MX', 'Peso mexicano'), 'RUB': ('RU', 'Rublo'), 'SAR': ('SA', 'Rial saudita'), 'ZAR': ('ZA', 'Rand'),
       'TRY': ('TR', 'Lira turca')}
DESDE = '2024-12'  # início do recorte longo do ranking (o mês mais fraco do real contra o dólar desde 1999)


def moedas_g20():
    # Ranking do G20 contra o dólar em dois recortes: desde DESDE e no ano corrente (desde dezembro do ano
    # anterior), até o último mês que todas as moedas têm. BIS WS_XRU: moeda por US$, média do mês.
    inicio = min(DESDE, f'{HOJE.year - 1}-12')
    texto = baixar('https://stats.bis.org/api/v1/data/WS_XRU/M.' + '+'.join(p for p, _ in G20.values())
                   + f'..A?startPeriod={inicio}&detail=dataonly&format=csv', texto=True)
    moeda = {p: m for m, (p, _) in G20.items()}
    cot = {m: {} for m in G20}
    for r in csv.DictReader(io.StringIO(texto)):
        if r['OBS_VALUE']:
            cot[moeda[r['REF_AREA']]][r['TIME_PERIOD']] = float(r['OBS_VALUE'])
    ate, nomes = ultimo_mes_comum(cot), {m: n for m, (_, n) in G20.items()}
    return (linhas_ranking('desde', DESDE, ate, cot, nomes)
            + linhas_ranking('ano', f'{int(ate[:4]) - 1}-12', ate, cot, nomes)), None


def pib_ppc():
    # PIB per capita em PPC, US$ internacionais constantes de 2021 (Banco Mundial, WDI).
    _, linhas = baixar('https://api.worldbank.org/v2/country/BRA;LCN;WLD/indicator/NY.GDP.PCAP.PP.KD'
                       f'?format=json&per_page=500&date={INICIO}:{ULTIMO}')
    por = {}
    for r in linhas:
        if r['value'] is not None:
            por.setdefault(int(r['date']), {})[r['countryiso3code']] = r['value']
    return {a: (v['BRA'], v['LCN'], v['WLD']) for a, v in por.items() if len(v) == 3}, None


def vacinacao():
    filtro = urllib.parse.quote("SpatialDim eq 'BRA'")
    linhas = baixar(f'https://ghoapi.azureedge.net/api/WHS8_110?$filter={filtro}')['value']
    out = {}
    for p in linhas:
        a = int(p['TimeDim'])
        if a in out and out[a] != p['NumericValue']:
            raise ValueError(f'dois valores para {a}')
        out[a] = p['NumericValue']
    return out, None


def pib_mundo():
    # A API ignora o filtro de país e devolve todos; as chaves são WE (América Latina e
    # Caribe) e WEOWORLD (mundo). Corta no último ano do PIB do Brasil: o resto é projeção.
    serie = baixar('https://www.imf.org/external/datamapper/api/v1/NGDP_RPCH')['values']['NGDP_RPCH']
    fim = ultimo_ano('pib.csv')
    al, mundo = serie['WE'], serie['WEOWORLD']
    return {int(a): (al[a], mundo[a]) for a in al if int(a) <= fim and a in mundo}, None


# arquivo, cabeçalho, coleta, casas decimais. pib vem antes de pib_mundo, que lê o pib.csv.
# Cada coleta devolve (anual, parcial); anual None = o CSV anual é manual (só o parcial sai daqui);
# anual lista = as linhas prontas do CSV (o ranking do G20, que não é série anual).
SERIES = [
    ('pib.csv', ['ano', 'pib'], pib, 1),
    ('ipca.csv', ['ano', 'ipca'], ipca, 2),
    ('selic.csv', ['ano', 'selic'], selic, 2),
    ('divida.csv', ['ano', 'divida'], divida, 1),
    ('divida_liquida.csv', ['ano', 'divida_liquida'], divida_liquida, 1),
    ('primario.csv', ['ano', 'primario'], primario, 2),
    ('salario_minimo.csv', ['ano', 'salario_real'], salario_minimo, 0),
    ('desemprego.csv', ['ano', 'taxa'], desemprego, 1),
    ('rendimento.csv', ['ano', 'rendimento'], rendimento, 0),
    ('gini.csv', ['ano', 'gini'], gini, 3),
    ('cambio.csv', ['ano', 'cambio'], cambio, 2),
    ('cambio_efetivo.csv', ['ano', 'brasil', 'eua'], cambio_efetivo, 2),
    ('moedas.csv', ['ano'] + list(MOEDAS), moedas, 4),
    ('moedas_g20.csv', ['periodo', 'de', 'ate', 'moeda', 'nome', 'cotacao_de', 'cotacao_ate', 'variacao'],
     moedas_g20, None),
    ('salario_dolar.csv', ['ano', 'salario_dolar'], salario_dolar, 0),
    ('pib_ppc.csv', ['ano', 'brasil', 'america_latina', 'mundo'], pib_ppc, 0),
    ('vacinacao.csv', ['ano', 'sarampo'], vacinacao, 0),
    ('pib_mundo.csv', ['ano', 'america_latina', 'mundo'], pib_mundo, 1),
]


def fmt(x, casas):
    # Arredonda meio para cima a partir do texto do número: f'{3.05:.1f}' dá '3.0' porque
    # o float binário de 3.05 é 3.0499…, e o IBGE publica 3,1.
    d = Decimal(str(x)).quantize(Decimal(1).scaleb(-casas), rounding=ROUND_HALF_UP)
    return str(d.copy_abs() if d == 0 else d)


def linhas_csv(valores, casas):
    anos = sorted(a for a in valores if a >= INICIO)
    if not anos:
        raise ValueError('nenhum ano retornado')
    faltam = sorted(set(range(anos[0], anos[-1] + 1)) - set(anos))
    if faltam:
        raise ValueError(f'anos faltando: {faltam}')
    out = []
    for a in anos:
        v = valores[a] if isinstance(valores[a], tuple) else (valores[a],)
        out.append([a] + [fmt(x, casas) for x in v])
    return out


def ultimo_mes_comum(cotacoes):
    """Último mês ('AAAA-MM') que todas as moedas têm: o ranking compara todas no mesmo intervalo."""
    return min(max(c) for c in cotacoes.values())


def linhas_ranking(periodo, de, ate, cotacoes, nomes):
    """Linhas do moedas_g20.csv de um recorte: quanto o valor de cada moeda em dólar mudou de `de` a `ate`
    (cotação em moeda por US$, então de ÷ ate − 1), da que mais ganhou para a que mais perdeu."""
    v = {m: (c[de] / c[ate] - 1) * 100 for m, c in cotacoes.items()}
    return [[periodo, de, ate, m, nomes[m], fmt(cotacoes[m][de], 4), fmt(cotacoes[m][ate], 4), fmt(v[m], 1)]
            for m in sorted(v, key=v.get, reverse=True)]


def linhas_parcial(serie, colunas, parcial, fim, casas):
    """Linhas do parcial.csv de uma série, uma por coluna, só se o ano do parcial for posterior ao
    último ano completo (`fim`)."""
    if parcial is None or parcial[1].year <= fim:
        return []
    valores, data = parcial
    return [[serie, c, data.year, fmt(v, casas), data.strftime('%Y-%m')] for c, v in zip(colunas, valores)]


def mesclar_parcial(antigas, novas, falharam):
    """As linhas novas do parcial.csv mais as antigas das séries que falharam agora: uma falha de
    rede não apaga um parcial que estava certo."""
    return [r for r in antigas if r[0] in falharam] + novas


def ler(arquivo, padrao, leitura):
    try:
        with open(os.path.join(DATA, arquivo), newline='', encoding='utf-8') as f:
            return leitura(f)
    except FileNotFoundError:
        return padrao


def gravar_texto(arquivo, texto):
    fd, tmp = tempfile.mkstemp(dir=DATA, suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', newline='', encoding='utf-8') as f:
            f.write(texto)
        os.chmod(tmp, 0o644)  # mkstemp cria 0600; o nginx (www-data) precisa ler
        os.replace(tmp, os.path.join(DATA, arquivo))
    except BaseException:
        os.unlink(tmp)
        raise


def gravar(arquivo, cabecalho, linhas):
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator='\n')
    w.writerow(cabecalho)
    w.writerows(linhas)
    gravar_texto(arquivo, buf.getvalue())


def main(pedidas):
    todas = [a[:-4] for a, *_ in SERIES]
    if set(pedidas) - set(todas):
        sys.exit(f'série desconhecida: {", ".join(sorted(set(pedidas) - set(todas)))}; use {" ".join(todas)}')
    falhas, novas, falharam = 0, [], set()
    # Séries fora do pedido mantêm o CSV e as linhas antigas do parcial, como as que falham.
    manter = set(todas) - set(pedidas) if pedidas else set()
    coleta = ler('coleta.json', {}, json.load)
    for arquivo, cabecalho, coletar, casas in SERIES:
        serie = arquivo[:-4]
        if serie in manter:
            continue
        try:
            anual, parcial = coletar()
            if anual is None:
                fim, faixa = ultimo_ano(arquivo), 'anual manual'
            elif isinstance(anual, list):
                gravar(arquivo, cabecalho, anual)
                fim, faixa = None, f'até {anual[0][2]}'
            else:
                linhas = linhas_csv({a: v for a, v in anual.items() if a <= ULTIMO}, casas)
                gravar(arquivo, cabecalho, linhas)
                fim, faixa = linhas[-1][0], f'{linhas[0][0]}–{linhas[-1][0]}'
            p = linhas_parcial(serie, cabecalho[1:], parcial, fim, casas)
            novas += p
            coleta[serie] = HOJE.isoformat()
            print(f'ok    {arquivo:20} {faixa}' + (f' · parcial até {p[0][4]}' if p else ''))
        except Exception as e:
            falhas += 1
            falharam.add(serie)
            print(f'ERRO  {arquivo:20} {e}', file=sys.stderr)
    antigas = ler('parcial.csv', [], lambda f: list(csv.reader(f))[1:])
    gravar('parcial.csv', ['serie', 'coluna', 'ano', 'valor', 'ate'],
           mesclar_parcial(antigas, novas, falharam | manter))
    gravar_texto('coleta.json', json.dumps(coleta, indent=1, sort_keys=True) + '\n')
    if falhas:
        print(f'Para tentar só as que falharam: python3 scripts/atualizar_dados.py {" ".join(sorted(falharam))}',
              file=sys.stderr)
    return 1 if falhas else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
