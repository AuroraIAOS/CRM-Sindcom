/** Sinaliza claramente uma aba ainda sem conteúdo — nunca uma tela em branco. */
export function AbaVazia({ mensagem }: { mensagem: string }) {
  return (
    <div className="rounded-md border border-dashed border-black/15 bg-fundo-2 p-6 text-center text-sm text-texto-2">
      {mensagem}
    </div>
  );
}
