import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NfceLookupError } from '../types.js';
import { parseSvrsHtml } from './svrs-html.js';

// Fixtures ficam em apps/api/src/test/fixtures — resolve relativo a este arquivo.
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../../test/fixtures');
const svrsHtml = readFileSync(join(FIXTURES, 'nfce-svrs.html'), 'utf8');
const mgHtml = readFileSync(join(FIXTURES, 'nfce-mg.html'), 'utf8');

describe('parseSvrsHtml — fixture SVRS/RS', () => {
  const result = parseSvrsHtml(svrsHtml, 'RS');

  it('extrai as 3 linhas de item da nota', () => {
    expect(result.itens).toHaveLength(3);
  });

  it('lê descrição, quantidade e unidade da 1ª linha', () => {
    const arroz = result.itens[0]!;
    expect(arroz.descricao).toBe('ARROZ TP1 5KG CAMIL');
    expect(arroz.quantidade).toBe(2);
    expect(arroz.unidade).toBe('UN');
  });

  it('converte "25,90" em 2590 centavos (risco de 100x)', () => {
    expect(result.itens[0]!.valorUnitCents).toBe(2590);
    expect(result.itens[0]!.valorTotalCents).toBe(5180);
  });

  it('vincula EAN quando o código é GTIN de 8-14 dígitos', () => {
    expect(result.itens[0]!.ean).toBe('7896006711257');
  });

  it('deixa ean null quando o item é "SEM GTIN"', () => {
    const refri = result.itens[2]!;
    expect(refri.descricao).toBe('REFRIGERANTE COLA 2L');
    expect(refri.ean).toBeNull();
  });

  it('lê o emitente por CNPJ (só dígitos) e nome', () => {
    expect(result.emitente.cnpj).toBe('14200166000166');
    expect(result.emitente.nome).toBe('SUPERMERCADO MODELO LTDA');
  });

  it('usa o total da nota (83,99 → 8399 centavos)', () => {
    expect(result.totalCents).toBe(8399);
  });

  it('descarta o CPF do consumidor — nenhum campo do resultado o contém (LGPD)', () => {
    // O CPF "123.456.789-09" está na fixture de propósito; o resultado serializado
    // não pode conter nem o CPF formatado nem só os dígitos.
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('123.456.789-09');
    expect(serialized).not.toContain('12345678909');
  });
});

describe('parseSvrsHtml — fixture MG (mesma estrutura do SVRS, parser reusado)', () => {
  const result = parseSvrsHtml(mgHtml, 'MG');

  it('extrai as 2 linhas da nota mineira', () => {
    expect(result.itens).toHaveLength(2);
  });

  it('lê quantidade fracionada (0,750 KG de pão) sem truncar', () => {
    const pao = result.itens[1]!;
    expect(pao.descricao).toBe('PAO FRANCES');
    expect(pao.quantidade).toBeCloseTo(0.75, 3);
    expect(pao.unidade).toBe('KG');
    expect(pao.valorUnitCents).toBe(1200);
    expect(pao.valorTotalCents).toBe(900);
  });

  it('total da nota mineira em centavos (41,94 → 4194)', () => {
    expect(result.totalCents).toBe(4194);
  });

  it('descarta o CPF do consumidor mineiro (LGPD)', () => {
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('987.654.321-00');
    expect(serialized).not.toContain('98765432100');
  });
});

describe('parseSvrsHtml — falhas de parse (nunca itens vazios silenciosos)', () => {
  it('HTML vazio → NfceLookupError nfce_parse_failed (não retorna itens: [])', () => {
    try {
      parseSvrsHtml('', 'RS');
      expect.unreachable('deveria lançar');
    } catch (err) {
      expect(err).toBeInstanceOf(NfceLookupError);
      expect((err as NfceLookupError).code).toBe('nfce_parse_failed');
    }
  });

  it('HTML sem tabela de itens → nfce_parse_failed', () => {
    const semTabela =
      '<html><body><div id="u20">LOJA</div><div>CNPJ: 14.200.166/0001-66</div>' +
      'sem tabela de itens aqui — página de erro do portal</body></html>';
    expect(() => parseSvrsHtml(semTabela, 'RS')).toThrow(NfceLookupError);
  });

  it('soma das linhas divergindo do total da nota em >1% → nfce_parse_failed', () => {
    // Total declarado 1000,00 mas a única linha soma 5,00 → parse perdeu linhas.
    const divergente =
      '<html><body><div id="u20">LOJA</div><div>CNPJ: 14.200.166/0001-66</div>' +
      '<table id="tabResult"><tr><td>' +
      '<span class="txtTit">ITEM UNICO</span>' +
      '<span class="Rqtd">Qtde.:1</span><span class="RUN">UN: UN</span>' +
      '<span class="RvlUnit">Vl. Unit.:5,00</span></td>' +
      '<td class="valor">5,00</td></tr></table>' +
      '<span class="txtMax">Valor total R$ 1.000,00</span></body></html>';
    try {
      parseSvrsHtml(divergente, 'RS');
      expect.unreachable('deveria lançar');
    } catch (err) {
      expect(err).toBeInstanceOf(NfceLookupError);
      expect((err as NfceLookupError).code).toBe('nfce_parse_failed');
    }
  });
});
