import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { formatarDataBR } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
  ehCampanhaDeTeste,
  taxa,
  useFunilCampanha,
  useKpisBrevo,
  type CampanhaBrevo,
} from "./api";

/**
 * `/campanhas/dashboard` — o painel diário da campanha (ETAPA 09 · Subetapa 9.2).
 *
 * EXISTE PARA NÃO PRECISAR ABRIR A BREVO TODO DIA, e por isso mostra os dois
 * lados do mesmo funil, sem misturá-los:
 *
 * · **Antes do clique** (Brevo): entregue, aberto, clicado, rejeitado, spam.
 *   É o que decide se a próxima onda sai — a regra da campanha é não subir
 *   volume com rejeição acima de 2% (copies §10), e esse número não existe
 *   dentro do CRM.
 *
 * · **Depois do clique** (CRM): quem abriu o link, mandou planilha, virou
 *   cadastro, ou pediu para sair. É o resultado que interessa ao sindicato.
 *
 * NÃO SOMAMOS OS DOIS. A Brevo conta MENSAGENS e o CRM conta
 * ESTABELECIMENTOS: uma contabilidade com 40 empresas é um e-mail lá e
 * quarenta linhas aqui. Uma taxa que atravessasse as duas fontes teria
 * denominadores diferentes no numerador e no divisor — pareceria informação e
 * seria ruído.
 *
 * O bloco da Brevo degrada com o motivo à vista: chave ausente, chave recusada
 * ou função não publicada aparecem escritos, em vez de virarem uma tabela
 * vazia que se confunde com "nenhuma campanha ainda".
 */
export function DashboardCampanhasPage() {
  const funil = useFunilCampanha();
  const brevo = useKpisBrevo();

  const f = funil.data;

  /**
   * AS CAMPANHAS DE TESTE SAEM DA CONTA POR PADRÃO (Subetapa 9.2).
   *
   * Maxwell viu o painel com 7 enviados, 7 entregues e 12 cliques numa campanha
   * que ainda não saiu. Os números eram reais, mas da **Onda 00** — a prova
   * ponta a ponta feita em caixas do próprio sindicato. Somá-los faz a Onda 01
   * nascer com resultado que não é dela, e é sobre esse número que a regra dos
   * 2% de rejeição decide se a onda seguinte sai.
   *
   * Isto também UNIFORMIZA as duas telas, que era a terceira coisa relatada: a
   * aba Descadastros lê o Supabase (zerado, correto) enquanto este bloco lia a
   * Brevo inteira (com a Onda 00). Não eram fontes "erradas" — são fontes
   * diferentes por desenho, e a tela já diz qual é qual —, mas uma mostrava a
   * era de teste e a outra não, e comparar as duas induzia a conclusão errada.
   *
   * Ocultar não é esconder: o total aparece no rótulo da caixa de seleção, e um
   * clique traz tudo de volta.
   */
  const [mostrarTestes, setMostrarTestes] = useState(false);
  const todas = brevo.data?.ok ? brevo.data.campanhas : [];
  const testes = todas.filter((c) => ehCampanhaDeTeste(c.nome));
  const visiveis = mostrarTestes ? todas : todas.filter((c) => !ehCampanhaDeTeste(c.nome));

  /**
   * O DENOMINADOR HONESTO, e por que ele tem duas formas.
   *
   * O certo é dividir pelos links DISPARADOS (`enviado_em` preenchido). Só que
   * quem dispara é a Brevo, e hoje nada escreve esse carimbo de volta no CRM:
   * medido em 2026-09-09, os 9.196 envios estão com `enviado_em` nulo. Dividir
   * por zero devolveria "—" ao lado de "6 responderam", o que parece defeito da
   * tela quando é lacuna do dado.
   *
   * Então a tela cai para o total de links CRIADOS e **diz que fez isso**, com
   * o aviso logo abaixo. Um número com o denominador declarado é utilizável;
   * um travessão sem explicação não é.
   */
  const semCarimboDeEnvio = !!f && f.enviosDisparados === 0 && f.enviosTotal > 0;
  const base = f ? (semCarimboDeEnvio ? f.enviosTotal : f.enviosDisparados) : 0;
  const rotuloBase = semCarimboDeEnvio ? "dos links criados" : "dos disparados";
  const taxaResposta = f ? taxa(f.comRemessa, base) : null;
  const taxaSaida = f ? taxa(f.descadastrados, base) : null;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-texto-1">Dashboard de campanhas</h1>
        <p className="text-sm text-texto-2">
          O funil inteiro num lugar só: o que a Brevo entregou e o que o CRM recebeu de volta.
        </p>
      </header>

      {/* ------------------------------------------------ depois do clique */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-texto-2">
          No CRM — o que aconteceu depois do e-mail
        </h2>

        {funil.isLoading && (
          <div className="flex items-center gap-2 text-texto-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        )}
        {funil.isError && (
          <Card className="border-estado-erro/30 bg-estado-erro/5 p-4 text-sm text-estado-erro">
            {(funil.error as Error).message}
          </Card>
        )}

        {f && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile titulo="Links criados" valor={f.enviosTotal} />
              <Tile
                titulo="Links disparados"
                valor={f.enviosDisparados}
                rodape={
                  f.enviosTotal > f.enviosDisparados
                    ? `${(f.enviosTotal - f.enviosDisparados).toLocaleString("pt-BR")} ainda não saíram`
                    : "todos já saíram"
                }
              />
              <Tile
                titulo="Responderam"
                valor={f.comRemessa}
                destaque="sucesso"
                rodape={taxaResposta === null ? "sem base de cálculo" : `${taxaResposta.toFixed(1)}% ${rotuloBase}`}
              />
              <Tile
                titulo="Pediram para sair"
                valor={f.descadastrados}
                destaque={taxaSaida !== null && taxaSaida > 2 ? "alerta" : undefined}
                rodape={taxaSaida === null ? "sem base de cálculo" : `${taxaSaida.toFixed(2)}% ${rotuloBase}`}
              />
            </div>

            {semCarimboDeEnvio && (
              <Card className="flex items-start gap-2 border-estado-alerta/40 bg-estado-alerta/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-estado-alerta" />
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-estado-alerta">
                    Nenhum envio tem a data de disparo preenchida
                  </span>
                  <span className="text-texto-1">
                    Os {f.enviosTotal.toLocaleString("pt-BR")} links existem, mas
                    <code className="mx-1 rounded bg-black/5 px-1">envios_campanha.enviado_em</code>
                    está vazio em todos: quem dispara é a Brevo, e nada escreve esse carimbo de volta
                    no CRM. As duas taxas acima usam o total de links criados como denominador — o
                    que <strong>subestima</strong> a resposta, porque conta links que talvez nem
                    tenham saído.
                  </span>
                  <span className="text-xs text-texto-2">
                    Enquanto isso não for preenchido, a taxa de resposta real desta campanha não
                    existe dentro do CRM — só a contagem absoluta é confiável.
                  </span>
                </div>
              </Card>
            )}

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile titulo="Remessas a revisar" valor={f.remessasAbertas} destaque={f.remessasAbertas > 0 ? "alerta" : undefined} />
              <Tile titulo="Remessas importadas" valor={f.remessasImportadas} />
              <Tile titulo="Remessas rejeitadas" valor={f.remessasRejeitadas} />
              <Tile titulo="Tokens revogados" valor={f.tokensRevogados} />
            </div>
          </>
        )}
      </section>

      {/* --------------------------------------------------- antes do clique */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-texto-2">
            Na Brevo — entrega e engajamento
          </h2>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-xs"
            onClick={() => void brevo.refetch()}
            disabled={brevo.isFetching}
          >
            <RefreshCw className={cn("h-3 w-3", brevo.isFetching && "animate-spin")} />
            Atualizar
          </Button>
          <a
            href="https://app.brevo.com/marketing/campaigns"
            target="_blank"
            rel="noreferrer"
            className="ml-auto flex items-center gap-1 text-xs text-realce hover:underline"
          >
            Abrir na Brevo <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {brevo.isLoading && (
          <div className="flex items-center gap-2 text-texto-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Consultando a Brevo…
          </div>
        )}

        {brevo.data && !brevo.data.ok && (
          <Card className="flex flex-col gap-2 border-estado-alerta/40 bg-estado-alerta/10 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-estado-alerta">
              <AlertTriangle className="h-4 w-4" /> Os dados da Brevo não estão disponíveis
            </div>
            <p className="text-sm text-texto-1">{brevo.data.erro}</p>
            {brevo.data.detalhe && (
              <pre className="overflow-x-auto rounded bg-black/5 p-2 text-xs text-texto-2">
                {brevo.data.detalhe}
              </pre>
            )}
            <p className="text-xs text-texto-2">
              O funil do CRM acima não depende disto — ele continua correto. O que falta aqui é a
              leitura de entrega e abertura, que só a Brevo tem.
            </p>
          </Card>
        )}

        {brevo.data?.ok && testes.length > 0 && (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-texto-2">
            <input
              type="checkbox"
              checked={mostrarTestes}
              onChange={(e) => setMostrarTestes(e.target.checked)}
              className="h-3.5 w-3.5 accent-realce"
            />
            Incluir as {testes.length} campanhas de teste da Onda 00 — elas saíram para caixas do
            próprio sindicato e não são resultado de campanha real.
          </label>
        )}

        {brevo.data?.ok && visiveis.length === 0 && (
          <Card className="p-4 text-sm text-texto-2">
            {testes.length > 0
              ? "Nenhuma campanha real disparada ainda — só as de teste da Onda 00, ocultas acima. Este bloco passa a mostrar números quando a Onda 01 sair."
              : "A conta da Brevo respondeu, mas não há campanha de e-mail registrada nela ainda."}
          </Card>
        )}

        {brevo.data?.ok && visiveis.length > 0 && (
          <>
            <ResumoBrevo campanhas={visiveis} />
            <Card className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campanha</TableHead>
                    <TableHead>Quando</TableHead>
                    <TableHead className="text-right">Enviados</TableHead>
                    <TableHead className="text-right">Entregues</TableHead>
                    <TableHead className="text-right">Aberturas</TableHead>
                    <TableHead className="text-right">Cliques</TableHead>
                    <TableHead className="text-right">Rejeições</TableHead>
                    <TableHead className="text-right">Spam</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiveis.map((c) => {
                    const rejeicoes = c.rejeicoesDuras + c.rejeicoesLeves;
                    const taxaRejeicao = taxa(rejeicoes, c.enviados);
                    return (
                      <TableRow key={c.id}>
                        <TableCell>
                          <div className="text-texto-1">{c.nome}</div>
                          {c.assunto && <div className="text-xs text-texto-2">{c.assunto}</div>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-texto-2">
                          {c.enviadaEm ? formatarDataBR(c.enviadaEm) : (c.status ?? "—")}
                        </TableCell>
                        <TableCell className="text-right">{c.enviados.toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="text-right">
                          {c.entregues.toLocaleString("pt-BR")}
                          <Percentual valor={taxa(c.entregues, c.enviados)} />
                        </TableCell>
                        <TableCell className="text-right">
                          {c.aberturasUnicas.toLocaleString("pt-BR")}
                          <Percentual valor={taxa(c.aberturasUnicas, c.entregues)} />
                        </TableCell>
                        <TableCell className="text-right">
                          {cliquesDe(c).toLocaleString("pt-BR")}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right",
                            taxaRejeicao !== null && taxaRejeicao > 2 && "font-bold text-estado-erro",
                          )}
                        >
                          {rejeicoes.toLocaleString("pt-BR")}
                          <Percentual valor={taxaRejeicao} />
                        </TableCell>
                        <TableCell className="text-right">{c.spam.toLocaleString("pt-BR")}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
            <p className="text-xs text-texto-2">
              A <strong>abertura</strong> é única por pessoa e calculada sobre os
              <strong> entregues</strong> — é a base que o mercado usa e a que torna a comparação
              entre ondas honesta. O <strong>clique</strong> aparece só como contagem, sem
              percentual, e isso foi medido: na Trilha A da Onda 00, com 2 entregues, a Brevo
              devolveu 10 e 20 nos seus dois contadores de clique. Os dois são de EVENTO, não de
              pessoa — qualquer taxa ali passaria de 100%. A <strong>rejeição</strong>, essa sim, é
              sobre os enviados: acima de <strong>2%</strong> a regra da campanha é parar e
              investigar, nunca subir volume.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

/** O consolidado das campanhas listadas — a leitura que decide se a onda seguinte sai. */
function ResumoBrevo({ campanhas }: { campanhas: CampanhaBrevo[] }) {
  const soma = campanhas.reduce(
    (a, c) => ({
      enviados: a.enviados + c.enviados,
      entregues: a.entregues + c.entregues,
      aberturas: a.aberturas + c.aberturasUnicas,
      cliques: a.cliques + cliquesDe(c),
      rejeicoes: a.rejeicoes + c.rejeicoesDuras + c.rejeicoesLeves,
      spam: a.spam + c.spam,
    }),
    { enviados: 0, entregues: 0, aberturas: 0, cliques: 0, rejeicoes: 0, spam: 0 },
  );
  const tRejeicao = taxa(soma.rejeicoes, soma.enviados);

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Tile titulo="Enviados" valor={soma.enviados} />
      <Tile
        titulo="Entregues"
        valor={soma.entregues}
        rodape={pct(taxa(soma.entregues, soma.enviados))}
      />
      <Tile
        titulo="Abriram"
        valor={soma.aberturas}
        rodape={pct(taxa(soma.aberturas, soma.entregues), "dos entregues")}
      />
      <Tile
        titulo="Cliques"
        valor={soma.cliques}
        destaque="sucesso"
        rodape="eventos, não pessoas"
      />
      <Tile
        titulo="Rejeições"
        valor={soma.rejeicoes}
        destaque={tRejeicao !== null && tRejeicao > 2 ? "erro" : undefined}
        rodape={
          tRejeicao === null
            ? "—"
            : `${tRejeicao.toFixed(2)}% ${tRejeicao > 2 ? "— acima do teto de 2%" : "(teto: 2%)"}`
        }
      />
    </div>
  );
}

/**
 * O clique, lido do número CRU da Brevo.
 *
 * `uniqueClicks` é o mais conservador dos dois contadores dela (medido:
 * 10 contra 20 de `clickers`, numa campanha de 2 entregues). Nenhum dos
 * dois é "pessoas", então a tela mostra contagem e nunca taxa — e lê do bruto
 * para não depender do nome que demos ao campo interpretado.
 */
function cliquesDe(c: CampanhaBrevo): number {
  return c.bruto?.uniqueClicks ?? c.cliquesUnicos;
}

function pct(v: number | null, sufixo = ""): string {
  return v === null ? "—" : `${v.toFixed(1)}%${sufixo ? ` ${sufixo}` : ""}`;
}

function Percentual({ valor }: { valor: number | null }) {
  if (valor === null) return null;
  return <div className="text-xs text-texto-2">{valor.toFixed(1)}%</div>;
}

function Tile({
  titulo,
  valor,
  rodape,
  destaque,
}: {
  titulo: string;
  valor: number;
  rodape?: string;
  destaque?: "sucesso" | "alerta" | "erro";
}) {
  return (
    <Card
      className={cn(
        "flex flex-col gap-1 p-4",
        destaque === "alerta" && "border-estado-alerta/40",
        destaque === "erro" && "border-estado-erro/40",
      )}
    >
      <span className="text-xs uppercase tracking-wide text-texto-2">{titulo}</span>
      <span
        className={cn(
          "text-2xl font-semibold text-texto-1",
          destaque === "sucesso" && "text-estado-sucesso",
          destaque === "alerta" && "text-estado-alerta",
          destaque === "erro" && "text-estado-erro",
        )}
      >
        {valor.toLocaleString("pt-BR")}
      </span>
      {rodape && <span className="text-xs text-texto-2">{rodape}</span>}
    </Card>
  );
}
