# Diretrizes dos formulários do site (modelo: página Contato, aprovada em 2026-11-16)

Vale para todos os formulários do site em HTML: Contato, Filie-se, Denuncie, Currículo e Vaga.
O componente é `web/src/_includes/formulario.njk`; os campos vêm de `web/src/_data/formularios.json`; o estilo está em `web/src/assets/css/paginas/formulario.css` (bloco "Estética delicada", no fim do arquivo).

## Estética
- **Campos sem moldura.** Nenhuma linha de contorno: o campo se distingue só pela cor de fundo (`--cor-fundo-01`, #F5F5F5) sobre o cartão branco. `border: 1px solid transparent` mantém o espaço para o estado de foco.
- **Cantos arredondados de 12 px** nos campos e no botão; **cartão** do formulário com 24 px de raio e sombra leve (`0 12px 32px rgb(0 0 0/.06)`).
- **Estados:** hover escurece o fundo (`--cor-fundo-02`); foco = fundo branco, borda vermelha fina e halo `0 0 0 4px rgb(198 40 40/.12)` (nunca `outline` grosso); erro = borda vermelha e fundo `#fdf3f3`.
- **Rótulos** de 14 px em `--cor-texto-02`; ajudas e contador de caracteres em 13 px; mensagens de erro em 14 px; consentimento em 14 px.
- **Seletor (`select`)** sem seta nativa: seta SVG própria à direita, com 44 px de respiro.
- **Botão de envio** vermelho, 48 px de altura, sem borda, mesmo raio dos campos.
- Aviso de modo demonstração: faixa discreta com filete vermelho à esquerda.

## Grade e tamanhos
- Cada seção (`fieldset.form-site__secao`) é uma **grade de 2 colunas** a partir de 720 px e **1 coluna** abaixo disso (celular), com espaçamento de 18 px (vertical) e 16 px (horizontal).
- **Todos os campos de uma linha têm a mesma altura: 48 px** (texto, e-mail, telefone, CPF, data, seletor). Exceções naturais: `textarea` (mínimo de 130 px) e campo de arquivo (altura automática).
- **Campos em largura inteira:** nome, assunto, mensagem, `textarea`, grupos de rádio e de caixas de seleção e campos de arquivo. Para forçar largura inteira em qualquer campo, use `"largura": "inteira"` no `formularios.json`.
- **Campos curtos pareiam:** telefone + e-mail, cidade + estado, CPF + data de nascimento, e assim por diante. Na ordem do JSON, dois campos curtos seguidos dividem a linha; um campo `inteira` entre eles quebra o pareamento, então planeje a ordem.
- Contato é o modelo: Nome (inteira) · Telefone | E-mail · Cidade | Estado · Assunto (inteira) · Mensagem (inteira).

## Posição na página
- Layout de duas colunas: **texto e animação à esquerda, formulário à direita** (a partir de 900 px; no celular o texto vem antes).
- O texto e a animação Lottie formam **um bloco único, centralizado verticalmente na altura do formulário** (`.fale__texto` com `justify-content:center`; Lottie com 320 px, logo abaixo da chamada vermelha). Não deixar vazio grande entre eles nem concentrar tudo no topo.
- O título do cartão **não repete** o título da coluna ao lado (em Contato: coluna "Fale com o SINDCOM", cartão "Envie sua mensagem").

## Regras que não mudam
- Textos em português do Brasil; consentimento LGPD obrigatório, com link para os Termos.
- Sem moldura ≠ sem acessibilidade: rótulo visível em todo campo, `aria-invalid` e mensagens de erro ligadas por `aria-describedby`, foco visível, alvos de toque com no mínimo 44 px.
- Nada de menção a ACT em nenhum texto, rótulo ou assunto do site.
- Validação e envio: `assets/js/validacao.js` e `assets/js/formulario.js` (modo demonstração até a função `formularios-site` ser implantada).
