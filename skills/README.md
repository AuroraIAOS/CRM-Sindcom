# Skills do projeto (cópia versionada)

As skills abaixo vivem **de fato** em `C:\Users\maxwe\.claude\skills\<nome>\` — é de lá que o
Claude Code as carrega. Esta pasta é a **cópia versionada**, pelo mesmo motivo que os workflows
do n8n são versionados em `n8n/`: se a máquina for trocada ou o diretório de skills for perdido,
o procedimento não vai junto.

| Skill | O que faz |
|---|---|
| `atualizar-sindcom` | Segunda metade do ciclo mensal do CNPJ: filtra os 22 GB da Receita pelos 29 municípios + CNAE 45/46/47 + situação ativa, compara com o Supabase e sobe **apenas o delta**, sinalizando (sem apagar) o que fechou ou sumiu. Depende da skill pessoal `atualizar-cnpj`, que baixa os arquivos. |

## Como restaurar

```bash
mkdir -p "$HOME/.claude/skills/atualizar-sindcom"
cp skills/atualizar-sindcom/SKILL.md "$HOME/.claude/skills/atualizar-sindcom/SKILL.md"
```

Depois, `/atualizar-sindcom` fica disponível numa sessão nova.

## Ao editar

Edite a cópia de `~/.claude/skills/` (é a que roda), teste, e **copie de volta para cá** no
mesmo commit — duas cópias divergindo em silêncio é pior que uma só.
