"""Testes das funções puras de scripts/atualizar_dados.py (sem rede).

Rodar: python3 -B -m unittest discover -s tests -p 'test_*.py'
"""
import datetime
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'scripts'))
import atualizar_dados as ad  # noqa: E402

D = datetime.date


def meses(inicio, valores):
    """{1º dia do mês: valor} a partir de (ano, mês) inicial."""
    a, m = inicio
    out = {}
    for v in valores:
        out[D(a, m, 1)] = v
        a, m = (a + 1, 1) if m == 12 else (a, m + 1)
    return out


class Medias(unittest.TestCase):
    def test_media_por_ano_so_anos_completos(self):
        pontos = meses((2025, 1), list(range(1, 13)) + [100, 100, 100])
        self.assertEqual(ad.media_por_ano(pontos, 12), {2025: 6.5})

    def test_media_dos_ultimos_12_meses_e_data_do_ultimo(self):
        pontos = meses((2025, 7), [1, 1, 1] + [2] * 12)
        self.assertEqual(ad.media_ultimos(pontos, 12), (2.0, D(2026, 9, 1)))

    def test_media_ultimos_sem_pontos_suficientes_falha(self):
        with self.assertRaises(ValueError):
            ad.media_ultimos(meses((2026, 1), [1, 2, 3]), 12)

    def test_trimestres_moveis_sem_sobreposicao(self):
        # Desocupação da PNAD Contínua por trimestre móvel (mês = fim do trimestre), set/2025–ago/2026.
        pontos = meses((2025, 9), [5.6, 5.4, 5.2, 5.1, 5.4, 5.8, 6.1, 5.8, 5.6, 5.4, 5.3, 5.3])
        valor, data = ad.trimestres_12m(pontos)
        self.assertAlmostEqual(valor, (5.3 + 5.6 + 5.8 + 5.2) / 4)
        self.assertEqual(data, D(2026, 8, 1))


class Parcial(unittest.TestCase):
    def test_ultimo_ate_ignora_data_futura(self):
        # O SGS 432 já traz a Selic até a próxima reunião do Copom.
        pontos = {D(2026, 9, 17): 14.25, D(2026, 11, 4): 13.75}
        self.assertEqual(ad.ultimo_ate(pontos, D(2026, 10, 26)), (14.25, D(2026, 9, 17)))

    def test_linhas_do_parcial_uma_por_coluna(self):
        p = ((5.31, 18.4), D(2026, 9, 1))
        self.assertEqual(ad.linhas_parcial('moedas', ['brasil', 'mexico'], p, 2025, 2),
                         [['moedas', 'brasil', 2026, '5.31', '2026-09'], ['moedas', 'mexico', 2026, '18.40', '2026-09']])

    def test_sem_parcial_quando_o_ano_ja_fechou(self):
        self.assertEqual(ad.linhas_parcial('divida', ['divida'], ((82.87,), D(2026, 8, 1)), 2026, 1), [])
        self.assertEqual(ad.linhas_parcial('divida', ['divida'], None, 2025, 1), [])

    def test_serie_que_falhou_mantem_a_linha_antiga(self):
        antigas = [['ipca', 'ipca', '2026', '4.40', '2026-08'], ['selic', 'selic', '2026', '14.25', '2026-09']]
        novas = [['selic', 'selic', 2026, '13.75', '2026-10']]
        self.assertEqual(ad.mesclar_parcial(antigas, novas, {'ipca'}),
                         [['ipca', 'ipca', '2026', '4.40', '2026-08'], ['selic', 'selic', 2026, '13.75', '2026-10']])


class Ranking(unittest.TestCase):
    def test_ultimo_mes_que_todas_as_moedas_tem(self):
        cot = {'BRL': {'2026-08': 5.15, '2026-09': 5.14}, 'ARS': {'2026-08': 1400.0}}
        self.assertEqual(ad.ultimo_mes_comum(cot), '2026-08')

    def test_da_moeda_que_mais_ganhou_em_dolar_para_a_que_mais_perdeu(self):
        # Cotação em moeda por US$: o real a 6,00 → 5,00 vale 20% mais em dólar; a lira a 30 → 40, 25% menos.
        cot = {'TRY': {'2024-12': 30.0, '2026-09': 40.0}, 'BRL': {'2024-12': 6.0, '2026-09': 5.0},
               'SAR': {'2024-12': 3.75, '2026-09': 3.75}}
        nomes = {'TRY': 'Lira turca', 'BRL': 'Real', 'SAR': 'Rial saudita'}
        self.assertEqual(ad.linhas_ranking('desde', '2024-12', '2026-09', cot, nomes), [
            ['desde', '2024-12', '2026-09', 'BRL', 'Real', '6.0000', '5.0000', '20.0'],
            ['desde', '2024-12', '2026-09', 'SAR', 'Rial saudita', '3.7500', '3.7500', '0.0'],
            ['desde', '2024-12', '2026-09', 'TRY', 'Lira turca', '30.0000', '40.0000', '-25.0']])

    def test_moeda_sem_o_mes_inicial_falha(self):
        with self.assertRaises(KeyError):
            ad.linhas_ranking('ano', '2025-12', '2026-09', {'BRL': {'2026-09': 5.14}}, {'BRL': 'Real'})


class Linha(unittest.TestCase):
    def test_serie_desconhecida_para_antes_de_baixar(self):
        with self.assertRaises(SystemExit) as e:
            ad.main(['selic', 'dolar'])
        self.assertIn('dolar', str(e.exception.code))


if __name__ == '__main__':
    unittest.main()
