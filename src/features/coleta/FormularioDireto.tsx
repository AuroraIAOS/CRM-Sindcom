import { useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { PreviewTable } from "@/features/importacao/PreviewTable";
import { contarPorStatus, temAvisoZeroComido } from "@/features/importacao/parsers";
import {
  descartarLinhasSemPessoa,
  validarTrabalhadores,
  type ContextoTrabalhadores,
} from "@/features/importacao/validarTrabalhadores";
import { gerarPlanilhaDoFormulario } from "./gerarPlanilhaFormulario";
import type { EstabelecimentoDoToken, useEnviarRemessa } from "./api";

/**
 * Formulário direto na página do token — Subetapa 08.8.
 *
 * Atende os 8.241 grupos de UM estabelecimento (53% da base): empresa com 2
 * ou 3 funcionários que nunca vai baixar planilha nenhuma. Só aparece quando
 * a carteira do token tem exatamente UMA empresa (`EnviarDadosPage` decide
 * isso, não este componente).
 *
 * NÃO abre um segundo caminho de escrita, nem de validação:
 *  · as linhas digitadas viram um `.xlsx` de verdade
 *    (`gerarPlanilhaDoFormulario`) e passam pela MESMA `useEnviarRemessa` —
 *    mesma Edge Function, mesma remessa, mesma revisão humana na 08.10;
 *  · quem valida CPF, exige o que é exigível e mapeia a situação sindical é
 *    `validarTrabalhadores`, a mesma função do caminho da planilha. O zod
 *    aqui garante só o FORMATO dos campos — não reimplementa o dígito
 *    verificador nem decide o que é obrigatório (ver o comentário do schema).
 */

/**
 * O zod aqui garante FORMATO, e nada além disso — quem julga conteúdo é
 * `validarTrabalhadores`, a mesma função do caminho da planilha.
 *
 * Ele já não exige `nome`, `cpf` nem `piso`, e isso é correção de um
 * desalinhamento real: para a planilha do contador, piso vazio é **aviso**
 * ("sem ele não há base de cálculo") e a linha segue; aqui era `min(1)`, ou
 * seja, bloqueio. As duas regras convivendo no mesmo envio produziam um botão
 * ativo cujo clique morria num "Obrigatório" — o `aproveitaveis > 0` liberava
 * e o resolver barrava. Duas conferências divergentes sobre o mesmo dado é
 * exatamente o que este arquivo se propôs a não ter.
 *
 * Linha totalmente vazia não vira erro: ela é descartada antes de virar
 * planilha, do mesmo modo que `descartarLinhasSemPessoa` faz no outro caminho.
 */
const linhaSchema = z.object({
  nome: z.string().trim(),
  cpf: z.string().trim(),
  telefone: z.string().trim(),
  piso: z.string().trim(),
  status: z.enum(["sindicalizado", "oposicao"]),
});
const formularioSchema = z.object({
  linhas: z.array(linhaSchema).min(1),
});
type FormularioValues = z.infer<typeof formularioSchema>;

const LINHA_VAZIA: FormularioValues["linhas"][number] = {
  nome: "",
  cpf: "",
  telefone: "",
  piso: "",
  status: "sindicalizado",
};

export function FormularioDireto({
  estabelecimento,
  token,
  enviar,
}: {
  estabelecimento: EstabelecimentoDoToken;
  token: string;
  enviar: ReturnType<typeof useEnviarRemessa>;
}) {
  const [erroGeracao, setErroGeracao] = useState<string | null>(null);

  const form = useForm<FormularioValues>({
    resolver: zodResolver(formularioSchema),
    defaultValues: { linhas: [LINHA_VAZIA] },
  });
  const campos = useFieldArray({ control: form.control, name: "linhas" });
  const linhasObservadas = form.watch("linhas");

  // O contexto de validação nasce, de propósito, igual ao da página pública:
  // `cpfsExistentes` vazio (não é a Denise revisando) e uma carteira de UMA
  // empresa só — a que este token autoriza.
  const contextoValidacao: ContextoTrabalhadores = useMemo(
    () => ({
      cpfsExistentes: new Set<string>(),
      municipioIdPorNomeNormalizado: new Map<string, number>(),
      municipioIdPorCodigoIbge: new Map<number, number>(),
      estabelecimentoIdPorCnpjCompleto: new Map([[estabelecimento.cnpj, estabelecimento.cnpj]]),
    }),
    [estabelecimento.cnpj],
  );

  /**
   * SEM `useMemo` — de propósito, e o motivo foi medido (orientacoes.md §4.12).
   *
   * `form.watch("linhas")` devolve SEMPRE O MESMO objeto de array, mutado no
   * lugar a cada tecla. O componente re-renderiza (o `watch` faz a sua parte),
   * mas um `useMemo` com `[linhasObservadas]` na lista de dependências compara
   * por REFERÊNCIA, encontra a mesma, e devolve o preview em cache — o da
   * primeira renderização, quando os campos estavam vazios. O resultado era o
   * botão "Enviar cadastro" ficar morto para quem tem UM funcionário, e só
   * acordar ao clicar em "Adicionar outro funcionário", porque `append()`
   * troca o array por um objeto novo e a referência finalmente muda.
   *
   * Recalcular a cada renderização custa uma passada por um punhado de linhas
   * digitadas à mão. Memoizar sobre uma referência mutável custou o envio de
   * quem tem um funcionário só — que é justamente a maioria desta trilha.
   */
  const parse = descartarLinhasSemPessoa({
    cabecalhos: ["cnpj_estabelecimento", "nome", "cpf", "telefone", "piso", "status"],
    linhas: linhasObservadas.map((l) => ({
      cnpj_estabelecimento: estabelecimento.cnpj,
      nome: l.nome,
      cpf: l.cpf,
      telefone: l.telefone,
      piso: l.piso,
      status: l.status,
    })),
  });
  const preview = validarTrabalhadores(parse, contextoValidacao, "ignorar");

  const contagem = contarPorStatus(preview);
  const aproveitaveis = contagem.total - contagem.rejeitadas;

  async function enviarFormulario(valores: FormularioValues) {
    setErroGeracao(null);
    // Mesma régua de `descartarLinhasSemPessoa`: linha sem nome E sem CPF não
    // é dado, é caixa que o empreendedor abriu e não usou. Ela não entra na
    // planilha gerada — senão chegaria à revisão da Denise como linha morta.
    const linhasComGente = valores.linhas.filter(
      (l) => l.nome.trim() !== "" || l.cpf.trim() !== "",
    );
    try {
      const buffer = await gerarPlanilhaDoFormulario(estabelecimento.cnpj, linhasComGente);
      const arquivo = new File([buffer], "cadastro.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      enviar.mutate({
        token,
        arquivo,
        linhasRecebidas: preview.length,
        linhasComErro: contagem.rejeitadas,
        relatorio: preview
          .filter((l) => l.mensagens.length > 0)
          .map((l) => ({ linha: l.linha, status: l.status, mensagens: l.mensagens })),
      });
    } catch {
      setErroGeracao("Não foi possível preparar o envio agora. Tente de novo em instantes.");
    }
  }

  return (
    <form onSubmit={form.handleSubmit(enviarFormulario)} className="flex flex-col gap-4">
      {estabelecimento.ja_coberto && (
        <p className="rounded-md bg-estado-sucesso/10 p-3 text-sm text-estado-sucesso">
          Você já tem funcionário(s) cadastrado(s) por este link. Pode enviar quantos precisar — não
          duplica ninguém.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {campos.fields.map((campo, indice) => {
          return (
            <div key={campo.id} className="flex flex-col gap-3 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-texto-1">Funcionário {indice + 1}</span>
                {campos.fields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => campos.remove(indice)}
                    className="text-texto-2 hover:text-estado-erro"
                    aria-label={`Remover funcionário ${indice + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-texto-1">Nome completo</span>
                  <input className="rounded-md border p-2 text-sm" {...form.register(`linhas.${indice}.nome`)} />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-texto-1">CPF</span>
                  <input className="rounded-md border p-2 text-sm" {...form.register(`linhas.${indice}.cpf`)} />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-texto-1">Telefone (WhatsApp, opcional)</span>
                  <input className="rounded-md border p-2 text-sm" {...form.register(`linhas.${indice}.telefone`)} />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-texto-1">Piso salarial pago (R$)</span>
                  <input className="rounded-md border p-2 text-sm" {...form.register(`linhas.${indice}.piso`)} />
                </label>
                <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                  <span className="text-texto-1">Situação sindical</span>
                  <select className="rounded-md border p-2 text-sm" {...form.register(`linhas.${indice}.status`)}>
                    <option value="sindicalizado">Sindicalizado</option>
                    <option value="oposicao">Oposição</option>
                  </select>
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <Button type="button" variant="outline" onClick={() => campos.append(LINHA_VAZIA)} className="w-fit gap-2">
        <Plus className="h-4 w-4" /> Adicionar outro funcionário
      </Button>

      {temAvisoZeroComido(preview) && (
        <p className="rounded-md bg-estado-alerta/10 p-3 text-sm text-estado-alerta">
          Um CPF veio com um dígito a menos do que deveria — restauramos o zero à esquerda, mas
          confira antes de enviar.
        </p>
      )}

      {contagem.rejeitadas > 0 && (
        <p className="rounded-md bg-estado-erro/10 p-3 text-sm text-estado-erro">
          {contagem.rejeitadas === 1 ? "Um funcionário não será" : `${contagem.rejeitadas} funcionários não serão`}{" "}
          enviados por erro bloqueante (CPF inválido). Corrija acima antes de enviar.
        </p>
      )}

      {preview.length > 0 && (
        <PreviewTable
          preview={preview}
          resumoLinha={(l) => {
            const b = l.bruta;
            return [b["nome"], b["cpf"]].filter(Boolean).join(" · ") || "(sem nome e sem CPF)";
          }}
        />
      )}

      {erroGeracao && <p className="text-sm text-estado-erro">{erroGeracao}</p>}
      {enviar.isError && (
        <p className="rounded-md bg-estado-erro/10 p-3 text-sm text-estado-erro">
          {(enviar.error as Error).message}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={aproveitaveis === 0 || enviar.isPending}>
          {enviar.isPending ? "Enviando…" : "Enviar cadastro"}
        </Button>
        {aproveitaveis === 0 && (
          <span className="text-sm text-texto-2">Preencha ao menos um funcionário sem erro.</span>
        )}
      </div>

      <p className="text-xs text-texto-2">
        O sindicato confere cada envio antes de cadastrar. Nada é gravado automaticamente.
      </p>
    </form>
  );
}
