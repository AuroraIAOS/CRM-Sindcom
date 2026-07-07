# SindCom — Design Tokens (identidade visual do CRM)

> Derivado do sistema de design oficial do SindCom. Este arquivo é a referência de identidade visual dentro do repositório — o Claude Code aplica estes tokens em toda a UI. A §7 é **extensão proposta para o CRM** (o design system oficial não cobre níveis e estados) e está sujeita a validação.

## 1. Identidade da marca

**Nome:** Sindicato dos Empregados no Comércio de Passos e Região — SindCom
**Slogan:** *"Sozinho o peso é maior"*
**Natureza:** entidade sindical de trabalhadores do comércio; tom institucional, próximo, combativo e humano.

## 2. Paleta de cores (oficial)

| Token | Hex | Uso principal |
|---|---|---|
| `texto-01` | `#424242` | Corpo de texto principal (títulos, parágrafos) |
| `texto-02` | `#565656` | Texto secundário, legendas, metadados |
| `fundo-01` | `#F5F5F5` | Fundo padrão de páginas e seções claras |
| `fundo-02` | `#EFEEE7` | Fundo alternativo, seções com destaque suave |
| `realce` | `#C62828` | Vermelho institucional — CTAs, destaques, ícones |

**Regras de uso:**
- Nunca usar branco puro (`#fff`) como fundo de página — sempre `fundo-01` ou `fundo-02`.
- O vermelho `#C62828` é cor de poder: parcimônia e intenção; não decorar tudo com ele.
- Botão primário: fundo `#C62828`, texto `#ffffff`. Botão secundário: borda e texto `#C62828`, fundo transparente.

## 3. Tipografia (oficial)

Importar do Google Fonts:

```html
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600&family=Lato:ital,wght@0,300;0,400;1,400&display=swap" rel="stylesheet">
```

| Token | Família | Tamanho | Peso | Estilo | Uso |
|---|---|---|---|---|---|
| `titulo-01` | Playfair Display | 40px | 600 | normal | Título principal de página/seção |
| `titulo-02` | Playfair Display | 30px | 400 | normal | Subtítulos, títulos de cards |
| `texto-01` | Lato | 18px | 400 | normal | Corpo de texto padrão |
| `texto-02` | Lato | 25px | 300 | normal | Texto grande/lead, introduções |
| `realce-01` | Lato | 18px | 400 | itálico | Citações, chamadas, destaques inline |
| `realce-02` | Lato | 25px | 400 | itálico | Destaques maiores, slogans |

**Regra geral:** Playfair Display para títulos (clássico, institucional); Lato para corpo (legível, humano). Em tabelas densas do CRM (DataTable), o corpo pode reduzir para 14–16px mantendo Lato — densidade de dados pede exceção pragmática.

## 4. CSS Variables (base de qualquer HTML/CSS do projeto)

```css
:root {
  /* Cores */
  --cor-texto-01:  #424242;
  --cor-texto-02:  #565656;
  --cor-fundo-01:  #F5F5F5;
  --cor-fundo-02:  #EFEEE7;
  --cor-realce:    #C62828;
  --cor-branco:    #ffffff;

  /* Tipografia */
  --font-titulo:   'Playfair Display', Georgia, serif;
  --font-corpo:    'Lato', sans-serif;

  --titulo-01-size:   40px;
  --titulo-01-weight: 600;
  --titulo-02-size:   30px;
  --titulo-02-weight: 400;
  --texto-01-size:    18px;
  --texto-01-weight:  400;
  --texto-02-size:    25px;
  --texto-02-weight:  300;

  /* Espaçamentos base */
  --espacamento-xs: 8px;
  --espacamento-sm: 16px;
  --espacamento-md: 32px;
  --espacamento-lg: 64px;
  --espacamento-xl: 96px;

  /* Bordas */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 16px;
}
```

### Mapeamento Tailwind (tailwind.config)

```js
theme: {
  extend: {
    colors: {
      texto:  { 1: '#424242', 2: '#565656' },
      fundo:  { 1: '#F5F5F5', 2: '#EFEEE7' },
      realce: '#C62828',
    },
    fontFamily: {
      titulo: ['"Playfair Display"', 'Georgia', 'serif'],
      corpo:  ['Lato', 'sans-serif'],
    },
    borderRadius: { sm: '4px', md: '8px', lg: '16px' },
  },
}
```

## 5. Logotipos (arquivos em `assets/`)

| Arquivo | Versão | Uso indicado |
|---|---|---|
| `logo_vertical.png` | Vertical, ícone + texto | Cabeçalhos verticais, redes sociais, favicon |
| `logo_horizontal_com_texto.png` | Horizontal, ícone + texto | Header principal, documentos, e-mails, **guia de encaminhamento** |
| `logo_horizontal_sem_texto.png` | Horizontal, só ícone | Espaços reduzidos, badges, marca d'água, ícone do PWA |

Regras: nunca distorcer proporções; horizontal com texto é a principal; largura mínima 120px na horizontal; **não existe versão negativa** (fundos escuros) — se precisar, sinalizar ao Maxwell antes de improvisar.

## 6. Tom e voz

- **Institucional mas humano:** fala *com* o trabalhador, não *sobre* ele.
- **Direto e empático:** sem juridiquês, sem distância.
- **Combativo quando necessário:** a defesa de direitos é o core.
- **Slogan como âncora:** *"Sozinho o peso é maior"* — o coletivo como solução.
- **Evitar:** linguagem corporativa fria, jargão técnico sem explicação, distância emocional.
- No CRM: mensagens de erro traduzem o Postgres para linguagem humana ("Este benefício é exclusivo do nível Ouro" — nunca "constraint violation").

## 7. EXTENSÃO PROPOSTA PARA O CRM ⚠️ *(não consta no design system oficial — validar com Maxwell)*

O CRM exige duas famílias de cores que a identidade oficial não define. Proposta harmônica com a paleta (tons dessaturados, terrosos, coerentes com `fundo-02`):

### Níveis de proteção (`NivelBadge`)

| Nível | Fundo | Texto | Racional |
|---|---|---|---|
| Bronze | `#EFE3D9` | `#7A4F2A` | Terroso quente, discreto — é o ponto de partida, não o destaque |
| Prata | `#E8E8E8` | `#5A5A5A` | Cinza neutro alinhado a `texto-02` |
| Ouro | `#F3E9C6` | `#8A6D1D` | Dourado suave — destaque perceptível sem competir com o vermelho institucional |

### Estados semânticos (`StatusBadge`)

| Estado | Cor | Uso |
|---|---|---|
| Sucesso | `#2E7D32` | pago, executada, aprovado, recebido |
| Alerta | `#B98700` | pendente, aguardando confirmação, em análise |
| Erro/crítico | `#C62828` | inadimplente, rejeitada, em atraso (reutiliza o `realce` — aqui o vermelho **é** semântico, não decorativo) |
| Neutro | `#565656` | cancelada, isenta, inativo |

Regra de convivência: em telas com muitos badges, o vermelho semântico dispensa o vermelho decorativo — CTA primário pode ficar sozinho na tela sem concorrência.

## 8. Checklist de conformidade (todo artefato visual)

- [ ] Google Fonts importado (Playfair Display + Lato)
- [ ] CSS variables / tokens Tailwind aplicados (nada hardcoded fora daqui)
- [ ] Fundo `fundo-01` ou `fundo-02` — nunca branco puro
- [ ] Vermelho `#C62828` com parcimônia (destaque ou semântica de erro, não decoração)
- [ ] Playfair para títulos, Lato para corpo
- [ ] Tom de texto alinhado à voz da marca
- [ ] Logotipo correto para o contexto
