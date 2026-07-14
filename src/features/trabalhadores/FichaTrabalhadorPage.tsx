import { useParams } from "react-router-dom";
import { ListaTrabalhadoresPage } from "./ListaTrabalhadoresPage";

/**
 * Wrapper fino para a rota `/trabalhadores/:id` (deep link) — renderiza o
 * mesmo componente mestre-detalhe de `/trabalhadores`, pré-selecionando o id
 * da URL (Tarefa 02.1: mesmo padrão same-page usado em Empresas).
 */
export function FichaTrabalhadorPage() {
  const { id } = useParams();
  return <ListaTrabalhadoresPage idInicial={id} />;
}
