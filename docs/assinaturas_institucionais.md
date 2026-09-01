# Assinaturas institucionais — Subetapa 08.2

**Alvo:** as 6 caixas `@sindcompassos.org` (Titan) · **Identidade:** `docs/design-tokens.md`
**Dados de contato:** conferidos em `https://sindcompassos.org/contato/` em 2026-08-24

---

## 1. As seis caixas e o papel de cada uma

| Caixa | Papel (definido por Maxwell) | Assinatura |
|---|---|---|
| `contato@` | público em geral conversa com o Sindcom | **setorial** |
| `secretaria@` | empresas, estabelecimentos e contabilidades; campanhas de boletos e informes | **setorial** — é a caixa de resposta da ETAPA 08 |
| `comercial@` | parceiros; apresentação de serviços e produtos das parcerias | **setorial** — será a caixa do P1 (Prata→Ouro) |
| `juridico@` | comunicação do setor jurídico | **pessoal** (nome + OAB) |
| `presidencia@` | despacho do presidente | **pessoal** |
| `deploycrm@` | questões de desenvolvimento do CRM | **técnica**, enxuta |

**Setorial × pessoal não é detalhe de estilo.** Caixa que várias pessoas operam não pode
assinar com o nome de uma só — quando a pessoa sai ou tira férias, a assinatura mente.
Caixa em que a identidade individual tem valor jurídico (o `juridico@` vai assinar a nota
técnica da 08.3) precisa de nome e OAB.

## 2. Três decisões de construção, e o motivo de cada uma

**(a) Sem imagem — nem logotipo remoto.** Outlook, Hotmail e boa parte dos clientes
corporativos bloqueiam imagem externa por padrão. Uma assinatura com logotipo hospedado
vira **retângulo vazio com um "x"** para o destinatário que não clicou em "exibir imagens" —
que é exatamente o contador recebendo o primeiro e-mail de um remetente desconhecido. O
peso institucional aqui é feito com **tipografia e a barra vermelha**, que renderizam em
100% dos clientes. (Logotipo embutido em base64 seria alternativa, mas engorda toda
mensagem e vários clientes o tratam como anexo — pior.)

**(b) Tabela, não `div`.** O Outlook para Windows renderiza HTML com o motor do Word, que
ignora `flex` e boa parte de `margin`. Layout de e-mail que precisa funcionar em todo lugar
é tabela com estilo inline. Não é retrocesso técnico; é o formato.

**(c) Fontes da marca com pilha de fallback real.** `Playfair Display` e `Lato` vêm do
Google Fonts, e **e-mail não carrega folha de estilo externa** — o cliente remove o `<link>`.
Na prática o destinatário verá **Georgia** (no lugar da Playfair) e **Arial/Helvetica** (no
lugar da Lato), que é o comportamento correto e previsível. A identidade se sustenta pela
**paleta** (`#424242`, `#565656`, `#C62828`), que renderiza sempre.

---

## 3. Modelo HTML — setorial

Substituir os campos entre `[[ ]]`. Colar no campo de assinatura do Titan em **modo HTML**.

```html
<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:Lato,Arial,Helvetica,sans-serif;">
  <tr>
    <td style="background-color:#C62828;width:3px;" width="3">&nbsp;</td>
    <td style="padding-left:14px;">

      <div style="font-family:Lato,Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#424242;line-height:20px;">
        [[NOME OU SETOR]]
      </div>
      <div style="font-family:Lato,Arial,Helvetica,sans-serif;font-size:13px;color:#565656;line-height:18px;">
        [[CARGO OU DESCRIÇÃO]]
      </div>

      <div style="font-family:'Playfair Display',Georgia,serif;font-size:14px;color:#424242;line-height:20px;padding-top:8px;">
        Sindicato dos Empregados no Comércio de Passos e Região
      </div>
      <div style="font-family:Lato,Arial,Helvetica,sans-serif;font-size:12px;font-style:italic;color:#565656;line-height:16px;">
        Sozinho o peso é maior
      </div>

      <div style="font-family:Lato,Arial,Helvetica,sans-serif;font-size:12px;color:#565656;line-height:18px;padding-top:8px;">
        Av. dos Expedicionários, 137 &middot; Centro &middot; Passos/MG &middot; CEP 37.900-130<br>
        <a href="tel:+553535263847" style="color:#565656;text-decoration:none;">(35) 3526-3847</a>
        &nbsp;&middot;&nbsp;
        <a href="mailto:[[CAIXA]]@sindcompassos.org" style="color:#565656;text-decoration:none;">[[CAIXA]]@sindcompassos.org</a><br>
        <a href="https://sindcompassos.org" style="color:#C62828;text-decoration:none;font-weight:bold;">sindcompassos.org</a>
      </div>

      <div style="font-family:Lato,Arial,Helvetica,sans-serif;font-size:11px;color:#565656;line-height:16px;padding-top:6px;">
        Atendimento: segunda a sexta, 08h–11h e 13h–17h
      </div>

    </td>
  </tr>
</table>
```

### Versão em texto puro (obrigatória)

O Titan permite assinatura para mensagens em texto. Sem ela, quem responde em texto puro
recebe a HTML "achatada", com tags aparecendo. Usar:

```
[[NOME OU SETOR]]
[[CARGO OU DESCRIÇÃO]]

Sindicato dos Empregados no Comércio de Passos e Região
"Sozinho o peso é maior"

Av. dos Expedicionários, 137 - Centro - Passos/MG - CEP 37.900-130
(35) 3526-3847 - [[CAIXA]]@sindcompassos.org
https://sindcompassos.org

Atendimento: segunda a sexta, 08h-11h e 13h-17h
```

---

## 4. Os seis preenchimentos

Onde há `⚠️`, **eu não tenho o dado** e não vou inventar: assinatura com nome ou cargo
errado é pior que assinatura genérica, porque circula assinada.

| Caixa | `[[NOME OU SETOR]]` | `[[CARGO OU DESCRIÇÃO]]` |
|---|---|---|
| `contato@` | Atendimento ao Trabalhador | Fale com o SINDCOM |
| `secretaria@` | Secretaria | Empresas, estabelecimentos e contabilidades |
| `comercial@` | Comercial e Parcerias | Convênio de benefícios |
| `juridico@` | ⚠️ *Adenilson [sobrenome]* | ⚠️ *Assessoria Jurídica · OAB/MG [número]* |
| `presidencia@` | ⚠️ *Davi [sobrenome]* | Presidente |
| `deploycrm@` | ⚠️ *Maxwell Ribeiro* | Desenvolvimento e Tecnologia — CRM SINDCOM |

**O que preciso de você:** sobrenome de Adenilson, de Davi e a **inscrição OAB** do
Adenilson. A OAB não é enfeite — a nota técnica da 08.3 vai ao ar assinada, e o contador
que quiser conferir a assinatura vai procurar o número.

**Para `deploycrm@`**, sugiro a variante **enxuta**: só nome, cargo, e-mail e site — sem
endereço, telefone nem horário de atendimento. É caixa técnica; ninguém vai à sede por
causa de um deploy, e assinatura institucional completa em e-mail de infraestrutura é ruído.

---

## 5. Como instalar no Titan

Para **cada** caixa, uma vez:

1. Entrar no webmail em `https://app.titan.email` com o e-mail e a senha **daquela caixa**
   (cada caixa tem a sua — a assinatura é por caixa, não por domínio).
2. **Configurações** → **Assinatura** (ou *Settings → Signature*).
3. Ativar o modo de edição de **código/HTML** e colar o bloco da §3. Se o editor não
   oferecer modo HTML, colar a versão renderizada — ver a armadilha abaixo.
4. Preencher também a **assinatura de texto puro** (§3), se o Titan oferecer campo separado.
5. Marcar para aplicar **em novas mensagens e em respostas/encaminhamentos**. Assinatura
   que só aparece em mensagem nova some justamente na resposta ao contador — que é o
   único momento em que ela importa nesta campanha.
6. Salvar e enviar um teste.

**Armadilha conhecida:** colar HTML em editor visual (WYSIWYG) faz o editor **escapar as
tags**, e o destinatário recebe `<table cellpadding=...` como texto. Se acontecer, o
sintoma é inconfundível. Alternativa: abrir este arquivo num navegador, renderizar o bloco,
**selecionar a assinatura renderizada e copiar** (Ctrl+C) — o editor visual aceita conteúdo
formatado da área de transferência.

---

## 6. Verificação — o que precisa ser conferido antes de dar a 08.2 por concluída

Para cada caixa, enviar **um** e-mail de teste e conferir:

- [ ] Gmail no **navegador** — assinatura renderizada, barra vermelha visível, links clicáveis
- [ ] Gmail no **celular** — não quebra a linha do endereço nem estoura a largura da tela
- [ ] **Outlook/Hotmail** — a barra vermelha aparece (é o caso que mais quebra: motor do Word)
- [ ] **Responder** a uma mensagem e confirmar que a assinatura vem junto
- [ ] Nenhum retângulo de imagem quebrada (não deve haver — não há imagem)
- [ ] Telefone clicável no celular (`tel:`) e e-mail abrindo o cliente (`mailto:`)

**Evidência da subetapa:** um print por caixa, no navegador e no celular.

---

## 7. Ligação com a ETAPA 08

`secretaria@` é a caixa de **Reply-To** de toda a campanha (decisão de Maxwell,
2026-08-24). Ou seja: o contador que responder ao pedido de dados cai nela, e **a
assinatura dela é a primeira coisa que ele vê do lado humano do sindicato**. É a mais
importante das seis para esta etapa — se alguma for feita primeiro, que seja essa.

`comercial@` fica reservada ao **P1 (converter Prata em Ouro)**, a segunda prioridade da
spec. Quando a campanha de parcerias sair, ela sai por lá — não pela secretaria.
