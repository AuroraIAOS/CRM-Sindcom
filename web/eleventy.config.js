import Image from '@11ty/eleventy-img';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

export default function (config) {
  config.addPassthroughCopy({ 'src/assets': 'assets' });
  config.addPassthroughCopy({ 'src/downloads': 'downloads' });
  config.addWatchTarget('src/assets/css');

  // SITE_STAGING=1 gera a versão de teste (novo.sindcompassos.org): bloqueada para buscadores
  config.addGlobalData('staging', () => process.env.SITE_STAGING === '1');

  // Data no formato AAAA-MM-DD (sitemap.xml)
  config.addFilter('dateIso', (d) => new Date(d).toISOString().slice(0, 10));

  // {% cssInline "site", "menu", "paginas/home" %} — embute o CSS no <head> (evita 3 pedidos em série no HTTP/1.1 da hospedagem).
  // Os caminhos ../fonts viram absolutos, porque o CSS deixa de morar em /assets/css/.
  config.addShortcode('cssInline', (...args) => '<style>' + args.flat().map((n) =>
    readFileSync(join('src/assets/css', n + '.css'), 'utf8').replaceAll('../fonts/', '/assets/fonts/').trim()).join('\n') + '</style>');

  // {% imagem "arquivo.jpg", "texto alternativo", "(min-width: 800px) 50vw, 100vw", "classe", true %}
  // Gera AVIF/WebP/JPEG em 3 larguras a partir de src/img-origem. O último argumento (true) marca imagem acima da dobra.
  config.addAsyncShortcode('imagem', async (arquivo, alt, sizes = '100vw', classe = '', prioridade = false) => {
    if (alt === undefined) throw new Error(`imagem "${arquivo}": o texto alternativo é obrigatório (use "" só se decorativa)`);
    // PNG de entrada mantém PNG como fallback (JPEG perderia a transparência e ficaria com fundo preto)
    const fallback = /\.png$/i.test(arquivo) ? 'png' : 'jpeg';
    const meta = await Image(join('src/img-origem', arquivo), {
      widths: [480, 960, 1600], formats: ['avif', 'webp', fallback],
      outputDir: './dist/assets/img/', urlPath: '/assets/img/',
    });
    return Image.generateHTML(meta, {
      alt, sizes, class: classe,
      loading: prioridade ? 'eager' : 'lazy', decoding: prioridade ? 'sync' : 'async',
      ...(prioridade ? { fetchpriority: 'high' } : {}),
    });
  });

  return {
    dir: { input: 'src', output: 'dist', includes: '_includes', data: '_data' },
    templateFormats: ['njk', 'md', 'html'],
    htmlTemplateEngine: 'njk',
    markdownTemplateEngine: 'njk',
  };
}
