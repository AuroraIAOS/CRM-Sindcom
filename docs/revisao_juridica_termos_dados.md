# Revisão jurídica — Termos de Uso, Política de Privacidade e página "Solicitação de Dados"

Para: Assessoria Jurídica do SINDCOM · Preparado em 17/11/2026 · Nada aqui foi publicado.

**Status (17/11/2026, decisão do Maxwell):** os textos da página **Solicitação de Dados** e os de **Termos de Uso e Política de Privacidade** foram **aprovados pelo jurídico**. O banco de dados do CRM fica em **São Paulo (sa-east-1)**, o que resolve o ponto de região da pendência 4. Seguem abertas, para o caso de o jurídico querer registrar decisão, as pendências 1, 2, 3, 5 e 6 e as sugestões da seção 2; a pendência 4 fica restrita à Cloudflare (rede e verificação anti-robô), que opera globalmente.

## O que revisar (texto e apresentação, de uma vez só)

| Página | Endereço de teste (bloqueado para buscadores) | Observação |
|---|---|---|
| Termos de Uso e Política de Privacidade | https://novo.sindcompassos.org/termos/ | Duas peças na mesma página, cada uma com índice lateral |
| Solicitação de Dados | https://novo.sindcompassos.org/dados/ | Resumo da Nota Técnica nº 01/2026; o PDF completo é baixado pela própria página |
| Formulários que remetem a esses textos | `/contato/`, `/filie-se/`, `/denuncie/`, `/curriculo/`, `/vaga/` | Os textos de consentimento estão transcritos na seção 3 abaixo |

Enquanto a versão estiver em revisão, uma faixa amarela "Versão em revisão jurídica" aparece no topo das duas páginas. Ela só existe no endereço de teste e **não vai para a publicação definitiva**.

Como ler a apresentação: no computador, o índice fica fixo ao lado do texto e acompanha a rolagem; no celular, o índice aparece antes do texto. Cada seção tem um número e uma âncora (por exemplo, `/termos/#tu-5`), então qualquer comentário pode apontar para o endereço exato da seção.

## 1. Pendências que dependem de decisão do jurídico

Estavam marcadas como comentários no código-fonte e agora estão aqui, em linguagem direta. Enquanto não houver decisão, o texto publicado só afirma o mínimo.

1. **Encarregado (DPO).** A Nota Técnica não nomeia encarregado. O texto indica a Assessoria Jurídica (`juridico@sindcompassos.org`) como canal. Há encarregado formal? Se houver, incluir nome e contato (LGPD, art. 41). — Política, seção 1.
2. **Bases legais por finalidade.** O quadro da seção 4 da Política usa as bases da Nota Técnica (art. 11, II, "d") e as hipóteses usuais dos arts. 7º e 11. Confirmar cada uma. Em especial: contato = consentimento + art. 7º, V; currículos e vagas = consentimento; denúncias = consentimento (arts. 7º, I e 11, I) + exercício regular de direitos.
3. **Currículos: há encaminhamento a empresas?** O texto original dizia que currículos poderiam ser compartilhados com empresas parceiras. O novo texto afirma apenas que o SINDCOM recebe e trata o currículo e **não o publica nem lista**. Se houver encaminhamento a empresas, é preciso dizer sob qual base e se o candidato é avisado antes. — Termos 6; Política 5.
4. **Transferência internacional.** Os prestadores citados são hospedagem do site (Hostgator), rede e verificação anti-robô (Cloudflare), banco de dados do sistema (Supabase) e provedor do e-mail institucional. **Confirmado:** o banco de dados do CRM fica em São Paulo (`sa-east-1`). A Cloudflare opera globalmente. Indicar se há transferência internacional e o mecanismo (LGPD, arts. 33 a 36). — Política, seção 7.
5. **Arquivos anexados por e-mail × Nota Técnica.** A Nota Técnica (item 8) destaca que a planilha de dados das empresas não trafega como anexo de e-mail. Os formulários do site entregam currículo, documentos de filiação e evidências de denúncia **como anexo de e-mail** às caixas institucionais. São fluxos diferentes; avaliar se a diferença precisa ser explicitada para não parecer contradição entre os dois documentos. — Política, seção 10.
6. **Prazos de guarda.** A Nota Técnica só define prazo para o cadastro de trabalhadores (eliminação após 20 anos sem movimentação). Falta definir prazo para mensagens de contato, currículos, vagas e denúncias, inclusive as já importadas do histórico do site antigo. O texto atual diz apenas "pelo tempo necessário à finalidade". — Política, seção 12.

## 2. Observações da revisão do texto (sugestões; nada foi alterado sem sua decisão)

### Termos e Política (texto reescrito por nós em 12/11/2026)
- **Corrigido por mim:** as remissões à "Nota Técnica, item 8" (segurança) e "item 9" (guarda e exclusão) apontavam para a página `/dados/`, cuja numeração é outra. Agora apontam para o PDF, onde os itens 8 e 9 existem com esses títulos.
- **Conferido contra o sistema:** o IP só é transformado em hash nos envios identificados; na denúncia anônima nada derivado do IP é gravado (inclusive por restrição no banco); o site não guarda nada no navegador do usuário; o CNPJ 23.778.277/0001-45 coincide com o da Nota Técnica.
- **Sugestão — ANPD.** A seção de direitos não menciona o direito de peticionar à Autoridade Nacional de Proteção de Dados (LGPD, art. 18, § 1º). Incluir?
- **Sugestão — menores de 18 anos.** A filiação e o currículo podem envolver menores (por exemplo, aprendizes). Os textos não tratam do art. 14 da LGPD. Incluir cláusula?
- **Sugestão — dado sensível na denúncia.** O consentimento do formulário de denúncia é genérico ("li e concordo… declaro que as informações são verdadeiras"). Se o relato puder conter dado sensível, avaliar se é preciso consentimento específico e destacado (art. 11, I), ou se a base será só o art. 11, II, "d".
- **Vocabulário dos níveis.** O site usa Bronze = representado, Prata = sindicalizado, Ouro = filiado; a Nota Técnica fala em "sindicalizados" e "não sindicalizados". Confirmar que "filiado" (Ouro) e "sindicalizado" (Prata) estão corretos em cada ponto, principalmente nas regras de exclusão (Política, seção 12; Dados, seção 7).
- A data "Última atualização: novembro de 2026" deve ser revista na aprovação.

### Solicitação de Dados (resumo da Nota Técnica assinada, texto mantido como veio)
Não alterei uma palavra desta página, por ser texto assinado. Pontos que o advogado pode querer ajustar:
- **Seção 6, "Verificação":** "ataques de deep hackers" é expressão informal e imprecisa; sugestão: "ataques simulados (testes de intrusão)". A frase "Nós não confiamos apenas em tudo que funcione como esperado" também está truncada; sugestão: "Não confiamos apenas no funcionamento esperado do sistema: simulamos ataques, testamos e corrigimos eventuais fragilidades".
- **Seção 3:** "não age contrário ao interesse" → "não age contra o interesse"; "Isso porque, é justamente o fato…" → vírgula a mais depois de "porque".
- **Seção 6, "Rastreabilidade":** afirma que os registros ficam "de forma imutável". Confirmar com a equipe técnica que a expressão descreve o que o sistema faz (hoje há trilha de auditoria; "imutável" é palavra forte).
- **Seção 7 e Política, seção 12:** os dois descrevem o mesmo prazo (20 anos); conferir se continuam idênticos quando um deles mudar.

## 3. Textos de consentimento dos formulários (também precisam de revisão)

- **Contato:** "Li e concordo com os Termos e a Política de Privacidade e autorizo o uso destes dados para responder à minha mensagem."
- **Currículo:** "Li e concordo com os Termos e a Política de Privacidade e autorizo o SINDCOM a tratar meu currículo para esta finalidade."
- **Vaga:** "Li e concordo com os Termos e a Política de Privacidade e autorizo o SINDCOM a analisar e divulgar esta vaga."
- **Filiação (duas caixas):** (1) "Estou ciente de que a filiação envolve dado pessoal sensível (filiação sindical) e de como o SINDCOM o trata, conforme os Termos e a Política de Privacidade." (2) "Declaro que as informações são verdadeiras e autorizo o SINDCOM a tratá-las para analisar minha filiação e prestar os serviços sindicais."
- **Denúncia:** "Li e concordo com os Termos e a Política de Privacidade. Declaro que as informações são verdadeiras, ciente de que denúncias de má-fé podem gerar responsabilização."

## 4. O que **não** está em revisão
Os formulários ainda não enviam dados de verdade (modo demonstração) e o e-mail institucional ainda não está ligado. Nada do que está nesses textos entra em vigor antes de o jurídico aprovar.
