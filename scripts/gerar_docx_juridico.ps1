# =============================================================================
# ATENCAO — ESTE SCRIPT NAO ESTA FUNCIONANDO. NAO RODE ESPERANDO RESULTADO.
#
# A conversao .md -> .html (primeira metade) FUNCIONA e e usada de fato. A
# segunda metade, que dirige o Word por COM para salvar em .docx, TRAVA sem
# mensagem: o WINWORD.EXE fica no ar respondendo, e o script nunca retorna.
#
# Quatro hipoteses testadas, cada uma refutada por medicao (2026-08-26):
#   1. encoding do .ps1 sem BOM quebrando o parser  -> corrigido, nao era isso;
#   2. forma antiga de SaveAs([ref]...) no PS 5.1   -> trocado por SaveAs2;
#   3. WINWORD orfao segurando o .html              -> limpo, voltou a travar;
#   4. Protected View por abrir arquivo de %TEMP%   -> movido para dentro do
#      repositorio, travou igual. A hipotese nao se sustenta: na 1a execucao o
#      Documents.Open FUNCIONOU a partir de %TEMP%.
#
# Parei aqui de proposito, em vez de tentar a quinta variacao da mesma coisa
# (orientacoes.md §7.1). Quem retomar: o proximo passo com mais chance NAO e
# mexer no Word, e sim gerar o OOXML do .docx direto — um .docx e um ZIP com
# word/document.xml, e o projeto ja tem o escritor de ZIP em
# scripts/gerar_xlsx_demo.mjs. Isso remove a dependencia do Word inteira.
#
# ENQUANTO ISSO: rode so a conversao para HTML e abra o .html no Word
# (Arquivo -> Abrir -> Salvar como .docx). Sao dois cliques por documento.
# =============================================================================
# =============================================================================
# CRM SINDCOM — scripts/gerar_docx_juridico.ps1
# ETAPA 08 · Subetapa 08.3 — regenera os .docx dos textos jurídicos
#
# POR QUE ESTE SCRIPT EXISTE
# A fonte de verdade dos três textos é o `.md` versionado. O `.docx` é o
# formato em que o Dr. Adenilson revisa, com controle de alterações. Sem um
# caminho reprodutível entre os dois, o `.md` é corrigido e o `.docx` fica para
# trás — e o Dr. revisa uma versão que já não existe. É a §2.7 do
# orientacoes.md aplicada a documento em vez de banco.
#
# COMO FUNCIONA
# `.md` → `.html` (scripts/md_para_html_juridico.mjs) → Word abre o HTML e
# salva como `.docx` (wdFormatXMLDocument = 16). O Word é dirigido por COM,
# invisível, e é encerrado ao fim mesmo se algo falhar.
#
# Uso: powershell -ExecutionPolicy Bypass -File scripts/gerar_docx_juridico.ps1
# =============================================================================
$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

$documentos = @(
  "00_memorando_revisao",
  "01_nota_tecnica_oficial",
  "02_nota_tecnica_resumida",
  "03_pagina_publica"
)

# HTML intermediario DENTRO do repositorio, e nao em %TEMP%: arquivo aberto
# a partir da pasta temporaria cai no Protected View do Word, e a automacao
# TRAVA sem mensagem — o processo fica respondendo e o script nunca retorna.
$temp = Join-Path $raiz "docs/juridico/.build"
if (-not (Test-Path $temp)) { New-Item -ItemType Directory -Path $temp | Out-Null }

Write-Output "Convertendo .md -> .html"
foreach ($doc in $documentos) {
  $md = Join-Path $raiz "docs\juridico\$doc.md"
  if (-not (Test-Path $md)) { Write-Output "  AUSENTE: $doc.md"; continue }
  $html = Join-Path $temp "$doc.html"
  & node "scripts/md_para_html_juridico.mjs" $md $html
  if ($LASTEXITCODE -ne 0) { throw "Falha na conversão de $doc.md" }
}

Write-Output "Abrindo o Word (invisivel) e salvando como .docx"
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  foreach ($doc in $documentos) {
    $html = Join-Path $temp "$doc.html"
    if (-not (Test-Path $html)) { continue }
    $docx = Join-Path $raiz "docs\juridico\$doc.docx"
    $documento = $null
    try {
      $documento = $word.Documents.Open($html, $false, $false)
      # 16 = wdFormatXMLDocument (.docx nativo, nao HTML renomeado).
      # `SaveAs2` com argumentos diretos: a forma antiga `SaveAs([ref]$p,[ref]16)`
      # falha no PowerShell 5.1 com "nao e possivel converter psobject em Object".
      $documento.SaveAs2($docx, 16)
      $paginas = $documento.ComputeStatistics(2)   # 2 = wdStatisticPages
      $palavras = $documento.ComputeStatistics(0)  # 0 = wdStatisticWords
      Write-Output ("  {0}.docx - {1} pagina(s), {2} palavras" -f $doc, $paginas, $palavras)
    }
    finally {
      # Fechar aqui, e nao no fim do laco: um erro no meio deixava o documento
      # aberto, o WINWORD.EXE sobrevivia ao Quit() e o .html ficava BLOQUEADO —
      # a execucao seguinte falhava ao regravar o HTML, com erro que nao se
      # parece nem um pouco com "sobrou um Word rodando".
      if ($documento) { $documento.Close($false) | Out-Null }
    }
  }
}
finally {
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}

Write-Output "Concluido."
