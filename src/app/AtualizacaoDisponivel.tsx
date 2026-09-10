/// <reference types="vite-plugin-pwa/react" />
import { useEffect } from "react";
import { toast } from "sonner";
import { useRegisterSW } from "virtual:pwa-register/react";

/**
 * Aviso de versão nova — a metade visível da troca de `autoUpdate` por
 * `prompt` no `vite.config.ts` (Subetapa 9.2).
 *
 * POR QUE ISTO EXISTE
 * Em `autoUpdate`, o vite-plugin-pwa injeta um `window.location.reload()` no
 * evento `activated` do service worker. Publicar uma versão nova — o que este
 * projeto faz ao fim de cada subetapa — recarregava a aba de quem estivesse
 * com o CRM aberto, no meio da frase, sem aviso. O relato do Maxwell em
 * 2026-09-10 ("volto para a aba e ela dá um F5, perco tudo o que digitei")
 * tinha duas causas; esta é a que apaga trabalho de forma mais brutal, porque
 * não depende de nada que o usuário faça.
 *
 * O aviso NÃO expira sozinho (`duration: Infinity`) e não se fecha ao clicar
 * fora: uma notificação de 4 segundos sobre "há uma versão nova" seria pior
 * que nada — some antes de ser lida e deixa a pessoa numa versão velha sem
 * saber. Fica até ser atendido ou dispensado.
 *
 * `onOfflineReady` é ignorado de propósito: "pronto para uso offline" é ruído
 * para quem opera o CRM na sede, e cada aviso a mais custa a atenção do
 * próximo.
 */
export function AtualizacaoDisponivel() {
  const {
    needRefresh: [precisaAtualizar, setPrecisaAtualizar],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (!precisaAtualizar) return;
    const id = toast.info("Há uma versão nova do CRM", {
      description:
        "Ela entra quando você recarregar. Termine o que está preenchendo antes — recarregar agora descarta o formulário aberto.",
      duration: Infinity,
      action: {
        label: "Recarregar",
        onClick: () => void updateServiceWorker(true),
      },
      cancel: {
        label: "Agora não",
        onClick: () => setPrecisaAtualizar(false),
      },
    });
    // Chaves obrigatórias: `toast.dismiss` devolve o id, e devolver valor no
    // cleanup do useEffect é erro de tipo (o React espera void ou Destructor).
    return () => {
      toast.dismiss(id);
    };
  }, [precisaAtualizar, setPrecisaAtualizar, updateServiceWorker]);

  return null;
}
