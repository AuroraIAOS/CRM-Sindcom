// WP 1.1 — extrai texto, links e imagens dos JSONs do Elementor (site/paginas) para Markdown de referência.
// Entrada: site/paginas/*.json (local, nunca versionado). Saída: web/referencia/ (somente conteúdo público do site).
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const RAIZ = join(import.meta.dirname, '..', '..');
const ENTRADA = join(RAIZ, 'site', 'paginas');
const SAIDA = join(RAIZ, 'web', 'referencia');
mkdirSync(SAIDA, { recursive: true });

const entidades = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#8211;': '–', '&#8212;': '—', '&#8217;': '’' };
const htmlParaMd = (h = '') =>
  h.replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h\d)>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<(strong|b)[^>]*>(.*?)<\/\1>/gis, '**$2**')
    .replace(/<(em|i)[^>]*>(.*?)<\/\1>/gis, '*$2*')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gis, '[$2]($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&[#\w]+;/g, (e) => entidades[e] ?? e)
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

const arquivoDe = (url = '') => decodeURIComponent(url.split('?')[0].split('/').pop() ?? '');

const inventario = {};
for (const nome of readdirSync(ENTRADA).filter((f) => f.endsWith('.json')).sort()) {
  const pagina = basename(nome, '.json');
  const dados = JSON.parse(readFileSync(join(ENTRADA, nome), 'utf8'));
  const linhas = [`# ${dados.title ?? pagina}`, ''];
  const imagens = new Set(), links = new Set(), embeds = [];

  const ancora = (url) => { if (url) links.add(url); return url; };
  const img = (url) => { const f = arquivoDe(url); if (f) imagens.add(f); return f; };

  const visita = (no) => {
    if (no.elType === 'widget') {
      const s = no.settings ?? {};
      switch (no.widgetType) {
        case 'heading': linhas.push(`${'#'.repeat(Math.min(6, Number(String(s.header_size ?? 'h2').slice(1)) + 1))} ${htmlParaMd(s.title)}`, ''); break;
        case 'text-editor': { const t = htmlParaMd(s.editor); if (t) linhas.push(t, ''); for (const m of (s.editor ?? '').matchAll(/href="([^"]+)"/g)) ancora(m[1]); break; }
        case 'button': linhas.push(`> BOTÃO: [${htmlParaMd(s.text)}](${ancora(s.link?.url) ?? ''})`, ''); break;
        case 'image': linhas.push(`![](${img(s.image?.url)})`, ''); break;
        case 'icon': break;
        case 'divider': case 'menu-anchor': if (no.widgetType === 'menu-anchor' && s.anchor) linhas.push(`<!-- âncora: #${s.anchor} -->`); break;
        case 'google_maps': linhas.push(`> MAPA: ${s.address}`, ''); embeds.push({ tipo: 'google_maps', endereco: s.address }); break;
        case 'html': { const h = s.html ?? ''; const src = h.match(/src="([^"]+)"/)?.[1]; const tipo = /forms\/d\/e/.test(h) ? 'google_forms' : /drive\.google/.test(h) ? 'google_drive' : /leaflet/i.test(h) ? 'mapa_leaflet' : 'outro'; linhas.push(`> EMBED (${tipo}): ${src ?? '[html próprio]'}`, ''); embeds.push({ tipo, src }); break; }
        case 'image-carousel': for (const i of s.carousel ?? []) { linhas.push(`> CARROSSEL: ${img(i.url)}`); } linhas.push(''); break;
        default: {
          if (no.widgetType.startsWith('elementskit')) {
            const v = Object.fromEntries(Object.entries(s).filter(([k, x]) => /title|desc|number|text|url|super|prefix/i.test(k) && !/typography|color|space|_css|hover/i.test(k) && x !== '' && typeof x !== 'object'));
            linhas.push(`> ${no.widgetType.toUpperCase()}: ${JSON.stringify(v)}`, '');
          } else linhas.push(`> WIDGET ${no.widgetType}`, '');
        }
      }
    }
    for (const filho of no.elements ?? []) visita(filho);
  };
  for (const raiz of dados.content) visita(raiz);

  writeFileSync(join(SAIDA, `${pagina}.md`), linhas.join('\n'), 'utf8');
  inventario[pagina] = { imagens: [...imagens].sort(), links: [...links].sort(), embeds };
}
writeFileSync(join(SAIDA, '_inventario.json'), JSON.stringify(inventario, null, 2), 'utf8');
console.log(Object.entries(inventario).map(([p, i]) => `${p}: ${i.imagens.length} imagens, ${i.links.length} links, ${i.embeds.length} embeds`).join('\n'));
