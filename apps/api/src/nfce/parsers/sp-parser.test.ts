import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NfceLookupError } from '../types.js';
import { parseSpHtml } from './sp-html.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../../test/fixtures');
const spHtml = readFileSync(join(FIXTURES, 'nfce-sp.html'), 'utf8');

describe('parseSpHtml — fixture SP (layout fixo-prod-serv-*)', () => {
  const result = parseSpHtml(spHtml, 'SP');

  it('extrai as 3 linhas de item da nota paulista', () => {
    expect(result.itens).toHaveLength(3);
  });

  it('lê descrição/quantidade/unidade da 1ª linha', () => {
    const cafe = result.itens[0]!;
    expect(cafe.descricao).toBe('CAFE TORRADO 500G PILAO');
    expect(cafe.quantidade).toBe(2);
    expect(cafe.unidade).toBe('UN');
  });

  it('converte "18,90" em 1890 centavos e total 37,80 → 3780 (risco 100x)', () => {
    expect(result.itens[0]!.valorUnitCents).toBe(1890);
    expect(result.itens[0]!.valorTotalCents).toBe(3780);
  });

  it('vincula EAN quando presente e deixa null em "SEM GTIN"', () => {
    expect(result.itens[0]!.ean).toBe('7896089012345');
    expect(result.itens[2]!.descricao).toBe('DETERGENTE NEUTRO 500ML');
    expect(result.itens[2]!.ean).toBeNull();
  });

  it('lê emitente por CNPJ (só dígitos) e nome', () => {
    expect(result.emitente.cnpj).toBe('35777222000145');
    expect(result.emitente.nome).toBe('MERCADO PAULISTA S/A');
  });

  it('usa o total da nota (51,55 → 5155 centavos)', () => {
    expect(result.totalCents).toBe(5155);
  });

  it('descarta o CPF do consumidor paulista (LGPD)', () => {
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('111.222.333-96');
    expect(serialized).not.toContain('11122233396');
  });
});

describe('parseSpHtml — falhas de parse', () => {
  it('HTML vazio → nfce_parse_failed (não itens vazios)', () => {
    try {
      parseSpHtml('', 'SP');
      expect.unreachable('deveria lançar');
    } catch (err) {
      expect(err).toBeInstanceOf(NfceLookupError);
      expect((err as NfceLookupError).code).toBe('nfce_parse_failed');
    }
  });

  it('página sem tabela de itens (erro ASP.NET) → nfce_parse_failed', () => {
    const erro =
      '<html><body><div id="u20">LOJA</div><div>CNPJ: 35.777.222/0001-45</div>' +
      '<div class="dialog-error">Nota fiscal nao encontrada</div></body></html>';
    expect(() => parseSpHtml(erro, 'SP')).toThrow(NfceLookupError);
  });
});
