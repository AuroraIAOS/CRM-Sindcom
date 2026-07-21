# Integração do Formulário de Filiação (Subetapa 03.2)

> Par deste documento: `supabase/functions/formulario-filiacao/index.ts` (Edge
> Function) e `sql/15_notificacao_formulario_site.sql` (notificação à
> Secretaria).

## Arquitetura

O "Formulário de Filiação" é um **Google Forms** (não WordPress) — coleta os
dados do Titular + upload de documentos, e hoje alimenta uma Planilha do
Google. Google Forms não tem webhook nativo, então a ponte é um **Google Apps
Script vinculado ao formulário**, com gatilho `onFormSubmit`: a cada resposta,
o script roda na nuvem do Google (não depende do seu computador ligado) e
chama a Edge Function do Supabase.

```
Google Forms (resposta) → Apps Script (onFormSubmit) → Edge Function
  formulario-filiacao (service_role) → trabalhadores (status_cadastro=pendente)
  → trigger fn_notifica_cadastro_site → notificacoes (secretaria)
```

**Decisões de escopo (2026-07-21, confirmadas com Maxwell):**
- Só o formulário "01. Filiação" (Titular) nesta rodada — "02. Beneficiários"
  fica para depois (depende de achar o Titular já cadastrado por CPF).
- Empresa/CNPJ/estabelecimento do empregador ficam como **texto cru** em
  `trabalhadores.observacoes` — a função não tenta casar/criar
  empresa/estabelecimento sozinha (evita duplicidade por erro de digitação).
  Denise resolve o vínculo manualmente ao aprovar.
- Documentos (RG, comprovantes) **não** são tratados aqui — continuam no
  Google Drive vinculado ao formulário; Denise confere lá por enquanto.

## 1. A Edge Function já está no ar

`formulario-filiacao`, deployada em produção, `verify_jwt = false`
(pública — quem chama é o Apps Script, sem sessão Supabase). A autenticação
real é um header próprio, `X-Formulario-Secret`, checado dentro do código —
sem ele (ou com o valor errado), a função responde `401` sem tentar gravar
nada.

**Pendente de você:** configurar o segredo no Supabase (a função já está no
ar, mas responde `500` — "não configurada" — até isso ser feito):

1. Painel do Supabase → seu projeto → **Edge Functions** → `formulario-filiacao`
   → aba **Secrets** (ou **Project Settings → Edge Functions → Secrets**,
   dependendo da versão do painel).
2. Adicionar variável `FORMULARIO_FILIACAO_SECRET` com o valor que o Claude
   Code gerou e te passou **fora deste arquivo** (nunca commitado no repo —
   orientacoes.md §6.2, credencial vive fora do histórico do git).
3. Confirmar que voltou a responder (veja o teste no §3).

## 2. Google Apps Script — código para colar

No formulário "01. Filiação": **Extensões → Apps Script** (menu do próprio
Google Forms, ícone de "⋮" ou barra superior). Cole o código abaixo,
substituindo `COLE_O_SEGREDO_AQUI` pelo mesmo valor do passo 1.

```javascript
// Apps Script vinculado ao "Formulário de Filiação" — Subetapa 03.2.
// Gatilho: onFormSubmit (configurar em Acionadores/Triggers, ver abaixo).

const EDGE_FUNCTION_URL =
  "https://vcswvscjqifelslsdjth.supabase.co/functions/v1/formulario-filiacao";
const SEGREDO = "COLE_O_SEGREDO_AQUI";

// Mapeia o TÍTULO exato da pergunta no formulário → chave que a Edge
// Function espera. Se o texto de alguma pergunta mudar no formulário, ajuste
// aqui (é o único lugar que precisa mudar).
const MAPA_PERGUNTAS = {
  "Nome completo": "nome_completo",
  "CPF": "cpf",
  "Data de nascimento": "data_nascimento",
  "Número do PIS/PASEP": "pis_pasep",
  "Telefone principal com DDD": "telefone",
  "Email pessoal": "email_pessoal",
  "Endereço completo": "endereco_completo",
  "Município de residência": "municipio_residencia",
  "Nome da empresa em que trabalha": "nome_empresa",
  "CNPJ da empresa": "cnpj_empresa",
  "Cidade onde está o estabelecimento da empresa": "cidade_estabelecimento",
  "Telefone do RH da empresa com DDD": "telefone_rh",
  "Email do RH da empresa": "email_rh",
  "Cargo ou função executado na empresa": "cargo",
  "Estado civil": "estado_civil",
};

function onFormSubmit(e) {
  const payload = {};

  e.response.getItemResponses().forEach((item) => {
    const titulo = item.getItem().getTitle();
    const chave = MAPA_PERGUNTAS[titulo];
    if (!chave) return; // pergunta sem mapeamento (ex.: upload de documento) — ignora de propósito

    let valor = item.getResponse();

    // Campo de data: Apps Script devolve formatos variados; normaliza para
    // AAAA-MM-DD (o que a Edge Function espera), sem depender de fuso.
    if (chave === "data_nascimento" && valor) {
      const d = new Date(valor);
      if (!isNaN(d.getTime())) {
        valor = Utilities.formatDate(d, "America/Sao_Paulo", "yyyy-MM-dd");
      }
    }

    payload[chave] = valor;
  });

  const resposta = UrlFetchApp.fetch(EDGE_FUNCTION_URL, {
    method: "post",
    contentType: "application/json",
    headers: { "X-Formulario-Secret": SEGREDO },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true, // captura erro em vez de deixar o Apps Script estourar
  });

  const codigo = resposta.getResponseCode();
  Logger.log("formulario-filiacao respondeu " + codigo + ": " + resposta.getContentText());

  // Falha real (não é "já cadastrado", que volta 200) → avisa por e-mail em
  // vez de falhar silenciosamente. Troque pelo e-mail que deve receber o alerta.
  if (codigo >= 400) {
    MailApp.sendEmail(
      "SEU_EMAIL_DE_ALERTA_AQUI@gmail.com",
      "Erro no envio do Formulário de Filiação ao CRM",
      "Código " + codigo + ": " + resposta.getContentText(),
    );
  }
}
```

**Configurar o gatilho** (o `onFormSubmit` acima não roda sozinho até ligar o
acionador):
1. No editor do Apps Script: ícone de relógio (**Acionadores/Triggers**) na
   barra lateral esquerda.
2. **+ Adicionar acionador**.
3. Função: `onFormSubmit` · Origem do evento: **Do formulário** · Tipo do
   evento: **Ao enviar o formulário**.
4. Salvar — o Google vai pedir autorização (é o script agindo em nome da
   conta que já é dona do formulário).

## 3. Teste manual (sem tocar no formulário real)

Nunca simule uma submissão preenchendo o Google Forms de verdade — isso
gravaria uma resposta falsa na Planilha e no Drive reais de Maxwell. Para
testar a Edge Function isoladamente:

```bash
curl -X POST "https://vcswvscjqifelslsdjth.supabase.co/functions/v1/formulario-filiacao" \
  -H "Content-Type: application/json" \
  -H "X-Formulario-Secret: <o mesmo valor do passo 1>" \
  -d '{"nome_completo":"Teste","cpf":"12345678901","municipio_residencia":"Passos"}'
```

Resposta esperada: `{"status":"criado","trabalhador_id":"..."}` (201) na
primeira vez; `{"status":"ja_cadastrado", ...}` (200) se repetir o mesmo CPF.

## 4. Quando o Formulário de Beneficiários entrar em escopo

Vai precisar de uma segunda Edge Function (`formulario-beneficiario`, por
exemplo) que: recebe o CPF do Titular já preenchido no formulário, busca o
`trabalhador_id` correspondente (rejeitando se não achar — não faz sentido um
beneficiário sem titular aprovado), e insere em `beneficiados` respeitando o
trigger `fn_valida_beneficiado` (regras de parentesco por estado civil já
documentadas no próprio Formulário de Filiação). Repete o mesmo padrão de
segredo próprio + Apps Script deste documento.
