import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { PreviewTable } from "@/features/importacao/PreviewTable";
import { contarPorStatus, temAvisoZeroComido, type LinhaPreview } from "@/features/importacao/parsers";
import {
  validarTrabalhadores,
  type ContextoTrabalhadores,
  type TrabalhadorPreviewDados,
} from "@/features/importacao/validarTrabalhadores";
import { lerPlanilhaXlsx, PlanilhaInvalida } from "./lerPlanilha";
import { useContextoToken, useEnviarRemessa, type EstabelecimentoDoToken } from "./api";

/**
 * `/enviar-dados/:token` — a página que o contador abre pelo link do e-mail.
 * Sem login (decisão D3): o token é a identidade.
 *
 * TRÊS REGRAS QUE ESTA PÁGINA CUMPRE, E O MOTIVO DE CADA UMA
 *
 * 1. **Reaproveita `validarTrabalhadores` e `PreviewTable` sem fork.** Duas
 *    cópias divergentes da validação de CPF é como a regra some. O único código
 *    novo de leitura é `lerPlanilha.ts`, que converte FORMATO e não valida nada.
 *
 * 2. **Não lê o banco.** Nenhuma chamada a `supabase-js` sai daqui. O único
 *    dado de servidor é a carteira do próprio contador, entregue pela Edge
 *    Function em troca do token dele. O preview ecoa o que o ARQUIVO trouxe.
 *
 * 3. **Jamais exibe CPF de quem já está cadastrado.** O `ContextoTrabalhadores`
 *    é montado com `cpfsExistentes` VAZIO — de propósito. Preenchê-lo exigiria
 *    ler `trabalhadores`, e a tela passaria a responder "este CPF já está na
 *    nossa base" para qualquer visitante com um link. A checagem de duplicata é
 *    da Denise, na 08.10, onde ela é feita por quem tem direito de fazê-la.
 */
export function EnviarDadosPage() {
  const { token = "" } = useParams();
  const contexto = useContextoToken(token);
  const enviar = useEnviarRemessa();

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<LinhaPreview<TrabalhadorPreviewDados>[] | null>(null);
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);

  const estabelecimentos: EstabelecimentoDoToken[] = contexto.data?.estabelecimentos ?? [];

  /**
   * O contexto de validação, montado SÓ com o que o token autoriza.
   * `estabelecimentoIdPorCnpjCompleto` mapeia CNPJ → o próprio CNPJ (a página
   * não conhece uuid de estabelecimento, e não precisa): o que importa para o
   * validador é se o CNPJ **está na carteira dele**. CNPJ de fora não casa e o
   * validador emite "Estabelecimento X não encontrado — vínculo não será criado",
   * que é exatamente a mensagem certa do ponto de vista do contador.
   */
  const contextoValidacao: ContextoTrabalhadores = useMemo(
    () => ({
      cpfsExistentes: new Set<string>(),
      municipioIdPorNomeNormalizado: new Map<string, number>(),
      municipioIdPorCodigoIbge: new Map<number, number>(),
      estabelecimentoIdPorCnpjCompleto: new Map(estabelecimentos.map((e) => [e.cnpj, e.cnpj])),
    }),
    [estabelecimentos],
  );

  async function aoEscolherArquivo(file: File | null) {
    setArquivo(file);
    setPreview(null);
    setErroLeitura(null);
    enviar.reset();
    if (!file) return;

    setLendo(true);
    try {
      const parse = await lerPlanilhaXlsx(file);
      setPreview(validarTrabalhadores(parse, contextoValidacao, "ignorar"));
    } catch (e) {
      setErroLeitura(
        e instanceof PlanilhaInvalida
          ? e.message
          : "Não foi possível ler esta planilha. Confira se o arquivo é .xlsx e tente de novo.",
      );
    } finally {
      setLendo(false);
    }
  }

  const contagem = preview ? contarPorStatus(preview) : null;
  const semVinculo = preview
    ? preview.filter((l) => l.mensagens.some((m) => m.includes("não encontrado"))).length
    : 0;
  const aproveitaveis = contagem ? contagem.total - contagem.rejeitadas : 0;
  const podeEnviar = !!arquivo && !!preview && aproveitaveis > 0 && !enviar.isPending;

  function enviarRemessa() {
    if (!arquivo || !preview) return;
    enviar.mutate({
      token,
      arquivo,
      linhasRecebidas: preview.length,
      linhasComErro: contagem?.rejeitadas ?? 0,
      // Só linha e mensagens: o relatório NÃO leva CPF nem nome. Ele fica
      // gravado em `remessas_dados.relatorio` e não há motivo para duplicar
      // dado pessoal ali — a planilha, essa sim, já está no bucket privado.
      relatorio: preview
        .filter((l) => l.mensagens.length > 0)
        .map((l) => ({ linha: l.linha, status: l.status, mensagens: l.mensagens })),
    });
  }

  // ------------------------------------------------------------- estados
  if (contexto.isLoading) {
    return <Moldura><p className="text-texto-2">Verificando o link…</p></Moldura>;
  }

  // Link inválido, expirado ou revogado: NENHUM upload é oferecido.
  if (contexto.isError) {
    return (
      <Moldura>
        <Cabecalho titulo="Link inválido" />
        <p className="text-estado-erro">
          {(contexto.error as Error).message || "Não foi possível validar este link."}
        </p>
        <p className="text-sm text-texto-2">
          Se você recebeu este link por e-mail do Sindcom e ele parou de funcionar, responda àquele
          e-mail ou fale com a secretaria — enviamos um link novo.
        </p>
      </Moldura>
    );
  }

  if (enviar.isSuccess) {
    return (
      <Moldura>
        <Cabecalho titulo="Planilha recebida" />
        <p className="text-estado-sucesso">{enviar.data.mensagem}</p>
        <Button
          variant="outline"
          onClick={() => {
            enviar.reset();
            setArquivo(null);
            setPreview(null);
          }}
        >
          Enviar outra planilha
        </Button>
      </Moldura>
    );
  }

  // ------------------------------------------------------------- formulário
  const cobertos = estabelecimentos.filter((e) => e.ja_coberto).length;

  return (
    <Moldura larga>
      <Cabecalho titulo="Envio do quadro de empregados" subtitulo={contexto.data?.nome} />

      {estabelecimentos.length > 0 && (
        <section className="flex flex-col gap-2 rounded-lg border bg-fundo-2/40 p-4">
          <p className="text-sm text-texto-1">
            <strong>{estabelecimentos.length}</strong>{" "}
            {estabelecimentos.length === 1 ? "empresa vinculada" : "empresas vinculadas"} a este link
            {cobertos > 0 && (
              <>
                {" "}— <strong>{cobertos}</strong> já com trabalhadores enviados.
              </>
            )}
          </p>
          <p className="text-sm text-texto-2">
            Você pode usar este mesmo link quantas vezes quiser, com quantas empresas conseguir por
            vez. Envio parcial vale muito mais que envio nenhum.
          </p>
          <details className="text-sm">
            <summary className="cursor-pointer text-texto-2">Ver as empresas deste link</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {estabelecimentos.map((e) => (
                <li key={e.cnpj} className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-xs text-texto-2">{e.cnpj}</span>
                  <span className="text-texto-1">{e.razao_social}</span>
                  {e.ja_coberto && (
                    <span className="rounded bg-estado-sucesso/15 px-1.5 py-0.5 text-xs text-estado-sucesso">
                      já enviada
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}

      {/* O modelo vem ANTES do campo de anexo de propósito: quem chega aqui sem
          planilha pronta precisa encontrar o arquivo antes de encontrar o
          upload. É também a defesa do zero à esquerda — o modelo já traz as
          colunas de CPF e CNPJ formatadas como texto (orientacoes.md §2.10), o
          que uma planilha montada do zero pelo contador dificilmente teria. */}
      <section className="flex flex-col gap-3 rounded-lg border border-realce/30 bg-realce/5 p-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-medium text-texto-1">1. Baixe o modelo</h2>
          <p className="text-sm text-texto-2">
            Use a planilha modelo para preencher. Ela já vem com as colunas certas e protege o zero
            à esquerda do CPF, que o Excel costuma apagar. A aba <strong>Instruções</strong> explica
            cada campo.
          </p>
        </div>
        {/* Caminho LITERAL, como o logotipo e o resto dos assets de `public/`.
            Não é preciosismo: um atributo de link montado a partir de variável é
            barrado pelo guard de `tests/adversarial/04_renderizacao.spec.ts`,
            que existe para que desligar o escape do React custe uma decisão
            explícita. Aqui o valor seria constante de build, mas a heurística
            não tem como saber — e afrouxar o guard para acomodar o caso benigno
            é como ele deixa de pegar o maligno. O arquivo é gerado por
            `scripts/gerar_modelo_coleta.mjs`; a 08.7 substitui este estático
            pelo modelo PRÉ-PREENCHIDO gerado no navegador. */}
        <a
          href="/modelos/quadro-de-empregados.xlsx"
          download="quadro-de-empregados.xlsx"
          className="inline-flex w-fit items-center gap-2 rounded-md bg-realce px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <Download className="h-4 w-4" />
          Baixar modelo (.xlsx)
        </a>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium text-texto-1">2. Envie a planilha preenchida</h2>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-texto-1">Planilha preenchida (.xlsx)</span>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => void aoEscolherArquivo(e.target.files?.[0] ?? null)}
            className="rounded-md border bg-white p-2 text-sm"
          />
          <span className="text-texto-2">
            Colunas esperadas: CNPJ do estabelecimento, nome, CPF, telefone, piso salarial pago e
            situação (sindicalizado ou oposição).
          </span>
        </label>

        {lendo && <p className="text-texto-2">Lendo a planilha no seu navegador…</p>}

        {erroLeitura && (
          <p className="rounded-md bg-estado-erro/10 p-3 text-sm text-estado-erro">{erroLeitura}</p>
        )}

        {preview && contagem && (
          <>
            {temAvisoZeroComido(preview) && (
              <p className="rounded-md bg-estado-alerta/10 p-3 text-sm text-estado-alerta">
                Vários CPFs vieram com menos dígitos do que deveriam. Isso acontece quando o Excel
                trata o CPF como número e come o zero da frente. Restauramos os zeros aqui, mas vale
                conferir — no Excel, formate a coluna como <strong>Texto</strong> antes de digitar.
              </p>
            )}

            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span>Total de linhas: <strong>{contagem.total}</strong></span>
              <span className="text-estado-sucesso">Prontas: <strong>{aproveitaveis}</strong></span>
              {contagem.rejeitadas > 0 && (
                <span className="text-estado-erro">
                  Com erro: <strong>{contagem.rejeitadas}</strong>
                </span>
              )}
              {semVinculo > 0 && (
                <span className="text-estado-alerta">
                  CNPJ fora deste link: <strong>{semVinculo}</strong>
                </span>
              )}
            </div>

            {semVinculo > 0 && (
              <p className="rounded-md bg-estado-alerta/10 p-3 text-sm text-estado-alerta">
                {semVinculo === 1 ? "Uma linha traz" : `${semVinculo} linhas trazem`} um CNPJ que não
                está entre as empresas deste link. Elas serão enviadas mesmo assim, mas o trabalhador
                entrará sem vínculo com a empresa — confira os CNPJs antes de enviar.
              </p>
            )}

            {contagem.rejeitadas > 0 && (
              <p className="rounded-md bg-estado-erro/10 p-3 text-sm text-estado-erro">
                {contagem.rejeitadas === 1 ? "Uma linha será descartada" : `${contagem.rejeitadas} linhas serão descartadas`}{" "}
                por erro bloqueante (CPF inválido ou campo obrigatório vazio). Corrija na planilha e
                anexe de novo, ou envie assim mesmo — as demais linhas seguem.
              </p>
            )}

            <PreviewTable
              preview={preview}
              resumoLinha={(l) => {
                const b = l.bruta;
                const nome = b["nome"] ?? b["Nome"] ?? "";
                const cpf = b["cpf"] ?? b["CPF"] ?? "";
                return [nome, cpf].filter(Boolean).join(" · ") || "(linha sem nome e sem CPF)";
              }}
            />
          </>
        )}

        {enviar.isError && (
          <p className="rounded-md bg-estado-erro/10 p-3 text-sm text-estado-erro">
            {(enviar.error as Error).message}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={enviarRemessa} disabled={!podeEnviar}>
            {enviar.isPending ? "Enviando…" : "Enviar planilha"}
          </Button>
          {preview && aproveitaveis === 0 && (
            <span className="text-sm text-texto-2">
              Nenhuma linha aproveitável — corrija a planilha e anexe de novo.
            </span>
          )}
        </div>

        <p className="text-xs text-texto-2">
          O sindicato confere cada envio antes de cadastrar. Nada é gravado automaticamente.
        </p>
      </section>
    </Moldura>
  );
}

function Moldura({ children, larga = false }: { children: React.ReactNode; larga?: boolean }) {
  return (
    <div className="min-h-screen bg-fundo-1 p-4">
      <div
        className={`mx-auto flex flex-col gap-5 rounded-lg bg-white p-6 shadow-sm ${
          larga ? "max-w-4xl" : "max-w-md"
        }`}
      >
        {children}
      </div>
      <p className="mx-auto mt-4 max-w-4xl text-center text-xs text-texto-2">
        Sindicato dos Empregados no Comércio de Passos e Região ·{" "}
        <a className="underline" href="https://sindcompassos.org">
          sindcompassos.org
        </a>
      </p>
    </div>
  );
}

/**
 * O logotipo é o mesmo `logo_horizontal_colorido.png` do AppShell, do login e
 * da guia de encaminhamento (docs/design-tokens.md §5) — não é enfeite: esta é
 * a primeira página do sindicato que o contador vê, chegando por um link de
 * e-mail que pede dado pessoal de terceiros. Sem marca, o pedido parece phishing.
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
