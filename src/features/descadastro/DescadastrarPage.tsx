import { useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2 } from "lucide-react";
import {
  MOTIVOS,
  useContextoDescadastro,
  useDescadastrar,
  type MotivoDescadastro,
} from "./api";

/**
 * `/descadastrar/:token` — a página que abre quem clicou em "descadastre-se
 * aqui" no CORPO do e-mail da campanha (ETAPA 09 · Subetapa 9.00).
 *
 * ESTA PÁGINA NÃO É O ÚNICO CAMINHO DE SAÍDA, E ISSO É DELIBERADO
 * Google e Microsoft somam 79,9% da lista e exigem descadastro em UM CLIQUE
 * pelo cabeçalho `List-Unsubscribe` (RFC 8058) — o botão que o Gmail desenha
 * acima da mensagem. Esse botão continua sendo o da Brevo e não passa por aqui:
 * exigir formulário dele é descumprimento, e o custo é a entregabilidade do
 * domínio inteiro. Quem sai por lá entra em `descadastros_campanha` com
 * `via = 'um_clique'` e sem motivo, pelo webhook. Cobertura parcial de propósito
 * é melhor que campanha barrada.
 *
 * QUATRO REGRAS QUE ESTA TELA CUMPRE
 *
 * 1. **Explica ANTES de qualquer campo.** O primeiro bloco é a delimitação do
 *    que o descadastro faz e do que ele não faz — e é a MESMA frase do rodapé
 *    do e-mail, para que quem chegou por aquele link reencontre o texto que leu.
 *    Frase diferente aqui pareceria letra miúda nova.
 *
 * 2. **Uma pergunta, uma tela, um clique depois da escolha.** Pergunta
 *    obrigatória é defensável; questionário não é (decisão (b) da subetapa). O
 *    botão nasce desabilitado e habilita na escolha — nunca há um segundo passo.
 *
 * 3. **Não confronta.** Mesma razão pela qual as copies não confrontam: o
 *    enquadramento como conduta antissindical fica na Nota Técnica, nunca no
 *    caminho de quem só quer sair. Quem se sente ameaçado não responde — e
 *    contadores conversam entre si.
 *
 * 4. **Não lê o banco.** Nenhuma chamada a `supabase-js` sai daqui; o único
 *    dado de servidor vem da Edge Function em troca do token.
 */
export function DescadastrarPage() {
  const { token = "" } = useParams();
  const contexto = useContextoDescadastro(token);
  const sair = useDescadastrar();

  const [motivo, setMotivo] = useState<MotivoDescadastro | null>(null);
  const [motivoLivre, setMotivoLivre] = useState("");

  // A regra do botão, e ela é a decisão (b) inteira em uma linha: o único
  // requisito para sair é ter escolhido uma opção.
  const podeConfirmar = motivo !== null && !sair.isPending;

  function confirmar() {
    if (!motivo) return;
    sair.mutate({ token, motivo, motivoLivre: motivoLivre.trim() });
  }

  // ------------------------------------------------------------------ carregando
  if (contexto.isLoading) {
    return (
      <Moldura>
        <Cabecalho titulo="Descadastramento" />
        <p className="flex items-center justify-center gap-2 text-texto-2">
          <Loader2 className="h-5 w-5 animate-spin" /> Carregando…
        </p>
      </Moldura>
    );
  }

  // --------------------------------------------------------------- link inválido
  //
  // Link quebrado NÃO é beco sem saída: quem quer sair tem de conseguir sair por
  // outro caminho, e a tela diz qual é. Fechar com "link inválido" e ponto
  // empurraria a pessoa para "marcar como spam", que é invisível para ela e
  // destrutivo para o domínio inteiro (copies §10, medição 3).
  if (contexto.isError) {
    return (
      <Moldura>
        <Cabecalho titulo="Não reconhecemos este link" />
        <p className="text-texto-1">{(contexto.error as Error).message}</p>
        <p className="text-sm text-texto-2">
          Se você quer parar de receber estas mensagens, responda a qualquer e-mail do sindicato
          escrevendo <strong>descadastrar</strong>, ou ligue para <strong>(35) 3526-3847</strong> —
          segunda a sexta, das 08h às 11h e das 13h às 17h. Nós fazemos a retirada.
        </p>
      </Moldura>
    );
  }

  // ------------------------------------------------------------------- concluído
  if (sair.isSuccess || contexto.data?.jaDescadastrado) {
    const mensagem = sair.data?.mensagem ?? "Este endereço já estava descadastrado. Nada mais é necessário.";
    return (
      <Moldura>
        <Cabecalho titulo="Descadastramento concluído" subtitulo={contexto.data?.nome} />
        <p className="flex items-start gap-2 rounded-md bg-estado-sucesso/10 p-3 text-estado-sucesso">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{mensagem}</span>
        </p>
        <AlcanceDoDescadastro />
        <p className="text-sm text-texto-2">
          Se precisar falar com o sindicato, ligue para <strong>(35) 3526-3847</strong> ou escreva
          para <strong>secretaria@sindcompassos.org</strong>.
        </p>
      </Moldura>
    );
  }

  // ------------------------------------------------------------------ formulário
  return (
    <Moldura>
      <Cabecalho titulo="Descadastramento" subtitulo={contexto.data?.nome} />

      {/* Antes de qualquer campo — item 2 da subetapa. */}
      <AlcanceDoDescadastro />

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-medium text-texto-1">Antes de concluir, uma pergunta</h2>
          <p className="text-sm text-texto-2">
            Saber o motivo é o que nos permite corrigir o que está errado do nosso lado. É uma
            pergunta só, e a sua resposta não muda o descadastro — ele acontece do mesmo jeito.
          </p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Motivo do descadastramento</legend>
          {MOTIVOS.map((m) => (
            <label
              key={m.valor}
              className="flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm hover:bg-fundo-2/40"
            >
              <input
                type="radio"
                name="motivo"
                value={m.valor}
                checked={motivo === m.valor}
                onChange={() => setMotivo(m.valor)}
                className="mt-0.5"
              />
              <span className="text-texto-1">{m.rotulo}</span>
            </label>
          ))}
        </fieldset>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-texto-2">Quer acrescentar alguma coisa? (opcional)</span>
          <textarea
            value={motivoLivre}
            onChange={(e) => setMotivoLivre(e.target.value)}
            rows={3}
            maxLength={2000}
            className="rounded-md border bg-white p-2 text-sm text-texto-1"
          />
        </label>

        {sair.isError && (
          <p className="rounded-md bg-estado-erro/10 p-3 text-sm text-estado-erro">
            {(sair.error as Error).message}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={confirmar} disabled={!podeConfirmar}>
            {sair.isPending ? "Registrando…" : "Confirmar descadastro"}
          </Button>
          {motivo === null && (
            <span className="text-sm text-texto-2">Escolha uma opção acima para concluir.</span>
          )}
        </div>
      </section>
    </Moldura>
  );
}

/**
 * A delimitação, palavra por palavra igual à do rodapé das 4 copies
 * (`docs/copies_campanha_08_14.md`). Ela existe porque o núcleo do argumento de
 * Maxwell na discussão de 2026-09-01 está certo e ficou incorporado ao texto:
 * **sair da lista muda o CANAL, não o DEVER.** A obrigação nasce da CF art. 8º,
 * III, da CLT art. 513 e da convenção coletiva — não do endereço estar numa
 * lista. Some o link e some também esta explicação, que é a parte útil.
 */
function AlcanceDoDescadastro() {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-realce/30 bg-realce/5 p-4 text-sm">
      <h2 className="font-medium text-texto-1">O que o descadastro faz — e o que ele não faz</h2>
      <p className="text-texto-1">
        O descadastro encerra apenas os envios desta campanha e{" "}
        <strong>não afasta as obrigações da empresa perante a convenção coletiva</strong>. Para
        assuntos formais, o Sindcom continua utilizando os canais institucionais e, quando
        necessário, a notificação por via própria.
      </p>
    </section>
  );
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-fundo-1 p-4">
      <div className="mx-auto flex max-w-xl flex-col gap-5 rounded-lg bg-white p-6 shadow-sm">
        {children}
      </div>
      <p className="mx-auto mt-4 max-w-xl text-center text-xs text-texto-2">
        Sindicato dos Empregados no Comércio de Passos e Região ·{" "}
        <a className="underline" href="https://sindcompassos.org">
          sindcompassos.org
        </a>
      </p>
    </div>
  );
}

/**
 * Mesmo cabeçalho de `/enviar-dados/:token`, e pela mesma razão: esta é uma
 * página do sindicato alcançada por link de e-mail. Sem marca, o pedido parece
 * phishing — e aqui a suspeita seria pior, porque a página pede um clique que
 * altera o cadastro da pessoa.
 */
function Cabecalho({ titulo, subtitulo }: { titulo: string; subtitulo?: string }) {
  return (
    <header className="flex flex-col items-center gap-3 border-b pb-5 text-center">
      <img
        src="/assets/brand/logo_horizontal_colorido.png"
        alt="Sindicato dos Empregados no Comércio de Passos e Região"
        className="max-w-[220px]"
      />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-texto-1">{titulo}</h1>
        {subtitulo && <p className="text-texto-2">{subtitulo}</p>}
      </div>
    </header>
  );
}
