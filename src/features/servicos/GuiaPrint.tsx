import { Link, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatarCpf, formatarDataBR, formatarMoeda } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import { useSolicitacao } from "./api";

/**
 * Guia de encaminhamento A4 (frontend.md §2.2 e §4) — a rota de impressão é o
 * "PDF" do v1: sem lib de geração, só `@media print` (specs/frontend.md §1).
 *
 * O QR aponta para `/guia/:token` — a página pública que o recepcionista do
 * parceiro abre no celular para fazer o check-in. O `token_publico` (uuid não
 * adivinhável) é a credencial de leitura; o PIN é a de escrita. Por isso a guia
 * impressa é um documento sensível: quem tem o papel consegue ver os dados.
 */

/** BASE_URL já vem com barra final ("/" em produção, "/preview-x/" nos builds
 *  de preview) — o mesmo basename que o router usa. */
function urlPublicaDaGuia(token: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}guia/${token}`;
}

export function GuiaPrint() {
  const { id } = useParams<{ id: string }>();
  const solicitacao = useSolicitacao(id);

  if (solicitacao.isLoading) return <p className="text-texto-2">Carregando guia…</p>;
  if (solicitacao.isError)
    return <p className="text-estado-erro">{mensagemErro(solicitacao.error)}</p>;
  if (!solicitacao.data) return null;

  const s = solicitacao.data;
  const interessado = s.beneficiado?.nome ?? s.trabalhador?.nome ?? "—";
  const ehBeneficiado = !!s.beneficiado;
  const economia =
    s.valor_particular != null && s.valor_convenio != null
      ? s.valor_particular - s.valor_convenio
      : null;
  const url = urlPublicaDaGuia(s.token_publico);

  return (
    <div className="flex flex-col gap-4">
      {/* Barra de ações — só na tela, nunca no papel. */}
      <div className="flex items-center justify-between print:hidden">
        <Link to={`/servicos/${s.id}`} className="text-sm text-realce hover:underline">
          ← Voltar à solicitação
        </Link>
        <Button onClick={() => window.print()}>
          <Printer className="mr-1 h-4 w-4" /> Imprimir
        </Button>
      </div>

      {/* Folha A4: 190mm = 210mm - 10mm de margem de cada lado (@page em
          index.css). Na tela ganha borda/sombra; no papel, nada disso. */}
      <article className="mx-auto w-full max-w-[190mm] bg-white p-8 text-texto-1 shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b-2 border-realce pb-4">
          <div className="flex flex-col gap-2">
            <img
              src="/assets/brand/logo_horizontal_colorido.png"
              alt="Sindicato dos Empregados no Comércio de Passos e Região"
              className="max-w-[200px]"
            />
            <p className="text-xs text-texto-2">
              Sindicato dos Empregados no Comércio de Passos e Região
            </p>
          </div>
          <div className="text-right">
            <h1 className="font-titulo text-xl font-bold text-texto-1">
              Guia de encaminhamento
            </h1>
            <p className="text-sm text-texto-2">Nº {s.numero_guia}</p>
            <p className="text-xs text-texto-2">Emitida em {formatarDataBR(s.created_at)}</p>
          </div>
        </header>

        <section className="mt-6 grid grid-cols-[1fr_auto] gap-6">
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-texto-2">Interessado</p>
              <p className="text-lg font-semibold">{interessado}</p>
              {ehBeneficiado ? (
                <p className="text-xs text-texto-2">
                  Beneficiado de {s.trabalhador?.nome} — CPF {formatarCpf(s.trabalhador?.cpf)}
                </p>
              ) : (
                <p className="text-xs text-texto-2">CPF {formatarCpf(s.trabalhador?.cpf)}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-texto-2">Parceiro</p>
                <p className="font-medium">{s.parceiro?.nome ?? "—"}</p>
                {s.parceiro?.segmento && (
                  <p className="text-xs text-texto-2">{s.parceiro.segmento}</p>
                )}
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-texto-2">Data agendada</p>
                <p className="font-medium">
                  {formatarDataBR(s.data_agendada)}
                  {s.horario ? ` às ${s.horario.slice(0, 5)}` : ""}
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-texto-2">Serviço</p>
              <p className="font-medium">{s.beneficio?.nome ?? "—"}</p>
              {s.beneficio?.descricao && (
                <p className="text-xs text-texto-2">{s.beneficio.descricao}</p>
              )}
            </div>
          </div>

          {/* QR do token público: o recepcionista escaneia e cai no check-in. */}
          <div className="flex flex-col items-center gap-2">
            <div className="rounded-md border border-black/15 p-2">
              <QRCodeSVG value={url} size={128} level="M" />
            </div>
            <p className="max-w-[128px] text-center text-[10px] leading-tight text-texto-2">
              Escaneie para confirmar o atendimento
            </p>
          </div>
        </section>

        <section className="mt-6 border border-black/15">
          <div className="grid grid-cols-3">
            <div className="border-r border-black/15 p-3">
              <p className="text-xs uppercase tracking-wide text-texto-2">Valor particular</p>
              <p className="text-lg font-semibold line-through decoration-1">
                {formatarMoeda(s.valor_particular) || "—"}
              </p>
            </div>
            <div className="border-r border-black/15 p-3">
              <p className="text-xs uppercase tracking-wide text-texto-2">Valor pelo convênio</p>
              <p className="text-lg font-bold">{formatarMoeda(s.valor_convenio) || "—"}</p>
            </div>
            <div className="bg-estado-sucesso/10 p-3">
              <p className="text-xs uppercase tracking-wide text-texto-2">Sua economia</p>
              <p className="text-lg font-bold text-estado-sucesso">
                {economia != null ? formatarMoeda(economia) : "—"}
              </p>
            </div>
          </div>
        </section>

        {s.beneficio?.condicoes && (
          <section className="mt-4">
            <p className="text-xs uppercase tracking-wide text-texto-2">Condições</p>
            <p className="text-sm">{s.beneficio.condicoes}</p>
          </section>
        )}

        <section className="mt-6 rounded-md bg-fundo-2 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-texto-1">
            Instruções ao recepcionista do parceiro
          </p>
          <ol className="mt-2 list-decimal pl-5 text-xs leading-relaxed text-texto-2">
            <li>Escaneie o QR Code acima (ou acesse o endereço impresso no rodapé).</li>
            <li>Confira os dados do interessado e do serviço na tela.</li>
            <li>
              Informe se o atendimento foi <strong>realizado</strong> ou <strong>recusado</strong> e
              digite a sua senha de recepcionamento (PIN).
            </li>
            <li>A confirmação é imediata — não é preciso devolver esta via ao sindicato.</li>
          </ol>
        </section>

        <footer className="mt-6 border-t border-black/15 pt-3 text-[10px] leading-relaxed text-texto-2">
          <p>
            Confirmação online: <span className="font-medium">{url}</span>
          </p>
          <p>
            Guia válida para a data agendada. Documento pessoal e intransferível — apresente um
            documento com foto no atendimento. Em caso de dúvida, procure a secretaria do Sindcom.
          </p>
        </footer>
      </article>
    </div>
  );
}
