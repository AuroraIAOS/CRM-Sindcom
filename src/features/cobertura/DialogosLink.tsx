import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, Copy, Loader2 } from "lucide-react";
import { mensagemErro } from "@/lib/mensagens";
import { formatarDataBR } from "@/lib/formatters";
import type { LinkAtivo } from "./api";

/**
 * Os diálogos de link, compartilhados pelas duas telas de cobertura
 * (contabilidades e empresas isoladas).
 *
 * Eles vivem aqui porque a promessa que carregam é a mesma nas duas, e é uma
 * promessa que já falhou uma vez: **revogar sem entregar o substituto deixa o
 * destinatário sem caminho de envio** (orientacoes.md §4.11). Duas cópias
 * divergentes desta tela seriam duas chances de a metade da entrega sumir de
 * novo — em uma delas.
 */

/**
 * A caixa que mostra o link e o coloca na área de transferência.
 *
 * O botão de copiar não é conforto: o token tem 36 caracteres e uma leitura
 * errada produz um link que abre "Link inválido" na cara do destinatário — erro
 * que ninguém consegue diagnosticar do outro lado da linha.
 */
export function CaixaLink({ link }: { link: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Navegador sem permissão de área de transferência: o link continua
      // visível e selecionável na tela, que é o essencial.
      setCopiado(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-md border bg-fundo-2/50 p-3">
        <code className="whitespace-nowrap font-mono text-xs text-texto-1">{link}</code>
      </div>
      <Button variant="outline" size="sm" className="w-fit" onClick={() => void copiar()}>
        {copiado ? <Check className="h-4 w-4 text-estado-sucesso" /> : <Copy className="h-4 w-4" />}
        {copiado ? "Link copiado" : "Copiar link"}
      </Button>
    </div>
  );
}

export type ConsultaLink = { link: LinkAtivo | null; carregando: boolean; erro: unknown };

/** Corpo comum aos dois diálogos: o valor, ou o motivo de não haver. */
export function ConteudoLink({ consulta }: { consulta: ConsultaLink }) {
  if (consulta.carregando) {
    return (
      <p className="flex items-center gap-2 text-sm text-texto-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Buscando o link…
      </p>
    );
  }
  if (consulta.erro) {
    return <p className="text-sm text-estado-erro">{mensagemErro(consulta.erro)}</p>;
  }
  if (!consulta.link) {
    return (
      <p className="text-sm text-estado-alerta">
        Não há link ativo. Revogue o token para emitir um novo.
      </p>
    );
  }
  if (!consulta.link.link) {
    // O banco devolveu a linha sem o token: quem consulta não é Admin
    // (v_envios_campanha_mascarada). Dizer isso é melhor do que mostrar vazio.
    return (
      <p className="text-sm text-texto-2">
        Existe um link ativo, mas o endereço só é exibido para o Admin.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <CaixaLink link={consulta.link.link} />
      <p className="text-xs text-texto-2">
        Válido até {formatarDataBR(consulta.link.expiraEm)}. Envie-o por e-mail ou WhatsApp para o
        contato — o CRM não dispara e-mail; quem envia é a campanha.
      </p>
    </div>
  );
}

/** "Link ativo": ver e copiar o link em vigor, sem revogar nada. */
export function LinkAtivoDialog({
  nome,
  aberto,
  consulta,
  onOpenChange,
}: {
  nome: string | undefined;
  aberto: boolean;
  consulta: ConsultaLink;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link de envio ativo</DialogTitle>
          <DialogDescription>
            O endereço que <strong>{nome}</strong> usa para enviar os dados. Continua valendo —
            reenviá-lo não invalida nada.
          </DialogDescription>
        </DialogHeader>
        <ConteudoLink consulta={consulta} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** O link recém-emitido, logo depois da revogação — o passo que faltava. */
export function LinkEmitidoDialog({
  emitido,
  onOpenChange,
}: {
  emitido: { nome: string; link: LinkAtivo } | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!emitido} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link novo emitido</DialogTitle>
          <DialogDescription>
            O link anterior de <strong>{emitido?.nome}</strong> deixou de funcionar agora. Este é o
            substituto — <strong>envie-o ao contato antes de fechar</strong>, porque sem ele o
            destinatário fica sem caminho para enviar os dados.
          </DialogDescription>
        </DialogHeader>
        {emitido && <ConteudoLink consulta={{ link: emitido.link, carregando: false, erro: null }} />}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
