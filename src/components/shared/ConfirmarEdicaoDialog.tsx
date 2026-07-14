import { ConfirmDialog } from "./ConfirmDialog";

/**
 * Popup padrão de confirmação de edição (Tarefa 02.3 / 03.1) — mesmo texto em
 * toda edição de Trabalhadores e Empresas: "Você está solicitando a edição de
 * uma informação. Essa ação é irreversível. Deseja prosseguir?"
 */
export function ConfirmarEdicaoDialog({
  open,
  onOpenChange,
  carregando,
  erro,
  onConfirmar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  carregando?: boolean;
  erro?: string | null;
  onConfirmar: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      titulo="Confirmar edição"
      descricao={
        <>
          Você está solicitando a edição de uma informação. Essa ação é irreversível. Deseja
          prosseguir?
          {erro && <p className="mt-2 text-estado-erro">{erro}</p>}
        </>
      }
      textoConfirmar="Sim"
      textoCancelar="Não"
      carregando={carregando}
      onConfirmar={onConfirmar}
    />
  );
}
