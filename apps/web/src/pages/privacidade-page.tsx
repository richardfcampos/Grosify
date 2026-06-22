import { useRouter } from '@tanstack/react-router';

/** Política de privacidade (LGPD). Texto em pt-BR — mercado primário. */
export function PrivacidadePage() {
  const router = useRouter();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-6 py-8 lg:max-w-[680px]">
      <button onClick={() => router.history.back()} className="muted self-start text-sm font-semibold">
        ← Voltar
      </button>
      <h1 className="text-2xl font-bold tracking-tight">Política de Privacidade</h1>
      <p className="muted text-sm">Última atualização: 13/06/2026</p>

      <section className="flex flex-col gap-2 text-sm leading-relaxed">
        <h2 className="mt-2 font-semibold">Quais dados coletamos</h2>
        <p>
          Coletamos os dados que você fornece ao criar sua conta (nome e e-mail) e os dados que você
          cadastra no uso do app: itens, lojas, preços, listas de compras, inventário e sessões de
          compra. Esses dados ficam vinculados à sua casa (household).
        </p>

        <h2 className="mt-3 font-semibold">Para que usamos</h2>
        <p>
          Usamos seus dados exclusivamente para o funcionamento do Grosify: organizar suas compras,
          calcular totais, comparar preços entre lojas e sincronizar entre seus dispositivos e os
          membros da sua casa. Não vendemos nem compartilhamos seus dados com terceiros para fins de
          marketing.
        </p>

        <h2 className="mt-3 font-semibold">Seus direitos (LGPD)</h2>
        <p>
          Você pode, a qualquer momento, exportar todos os seus dados em formato JSON ou excluir sua
          conta e todos os dados da casa de forma permanente — ambas as opções estão em Ajustes. A
          exclusão é irreversível.
        </p>

        <h2 className="mt-3 font-semibold">Armazenamento</h2>
        <p>
          Os dados ficam no seu dispositivo (para funcionar offline) e em nosso servidor para
          sincronização. A senha é armazenada de forma criptografada e nunca em texto puro.
        </p>

        <h2 className="mt-3 font-semibold">Contato</h2>
        <p>
          Dúvidas sobre privacidade ou exercício de direitos: entre em contato pelo e-mail de
          suporte do app.
        </p>
      </section>
    </main>
  );
}
