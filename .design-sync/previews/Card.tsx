import { Card, MoneyValue, Badge } from '@grosify/ui';

export function Basico() {
  return (
    <div style={{ width: 280 }}>
      <Card>
        <div style={{ fontFamily: 'Lexend, sans-serif', fontWeight: 600, color: '#1c1917' }}>
          Compras do mês
        </div>
        <div style={{ fontFamily: 'Lexend, sans-serif', fontSize: 14, color: '#78716c', marginTop: 4 }}>
          24 itens · faltam 6
        </div>
      </Card>
    </div>
  );
}

export function Elevado() {
  return (
    <div style={{ width: 280 }}>
      <Card elevated>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontFamily: 'Lexend, sans-serif',
          }}
        >
          <div>
            <div style={{ fontWeight: 600, color: '#1c1917' }}>Arroz 5kg</div>
            <Badge tone="oferta">Melhor preço</Badge>
          </div>
          <MoneyValue cents={2490} size="sm" />
        </div>
      </Card>
    </div>
  );
}
