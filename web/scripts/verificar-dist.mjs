// Verifica o site gerado em web/dist: 1 h1 por página, imagens com alt, links e âncoras internos, domínios externos, resíduos do Google.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, posix, sep } from 'node:path';

const DIST = join(import.meta.dirname, '..', 'dist');
const lista = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? lista(join(d, e.name)) : [join(d, e.name)]));
const todos = lista(DIST), htmls = todos.filter((f) => f.endsWith('.html'));
const rota = (f) => '/' + relative(DIST, f).split(sep).join('/').replace(/index\.html$/, '');
const ids = Object.fromEntries(htmls.map((f) => [rota(f), new Set([...readFileSync(f, 'utf8').matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]))]));
const externos = new Map(), problemas = new Set();

for (const f of htmls) {
  const h = readFileSync(f, 'utf8'), p = rota(f);
  const h1 = (h.match(/<h1[\s>]/g) ?? []).length, semAlt = (h.match(/<img(?![^>]*\balt=)[^>]*>/g) ?? []).length;
  console.log(p.padEnd(18), `h1:${h1}`, `semAlt:${semAlt}`, `forms:${(h.match(/data-formulario=/g) ?? []).length}`, `KB:${(Buffer.byteLength(h) / 1024).toFixed(0)}`);
  if (h1 !== 1) problemas.add(`${p}: ${h1} h1`);
  if (semAlt) problemas.add(`${p}: ${semAlt} img sem alt`);
  for (const [, u] of h.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (/^(mailto:|tel:|javascript:|data:)/.test(u)) continue;
    if (/^https?:\/\//.test(u)) { const d = new URL(u).host; externos.set(d, (externos.get(d) ?? 0) + 1); continue; }
    const [pa, hash] = u.split('#');
    const alvo = (pa === '' ? p : pa.startsWith('/') ? pa : posix.join(p, pa)).split('?')[0];
    const caminho = join(DIST, alvo);
    const existe = existsSync(caminho) && (statSync(caminho).isFile() || existsSync(join(caminho, 'index.html')));
    if (!existe) problemas.add(`${p}: link quebrado ${u}`);
    else if (hash && ids[alvo] && !ids[alvo].has(hash)) problemas.add(`${p}: âncora ausente ${u}`);
  }
}
console.log('\nDomínios externos:', [...externos].map(([d, n]) => `${d}×${n}`).join(', '));
for (const f of todos.filter((x) => /\.(css|js)$/.test(x) && !/vendor|lottie/.test(x)))
  if (/google|gstatic/i.test(readFileSync(f, 'utf8'))) problemas.add(`Google em ${relative(DIST, f)}`);
const mb = (filtro) => (todos.filter((f) => f.includes(filtro)).reduce((s, f) => s + statSync(f).size, 0) / 1e6).toFixed(1);
console.log(`Imagens ${mb('assets' + sep + 'img')} MB · downloads ${mb('downloads')} MB · total ${(todos.reduce((s, f) => s + statSync(f).size, 0) / 1e6).toFixed(1)} MB`);
console.log(`\nPROBLEMAS (${problemas.size}):`); [...problemas].forEach((x) => console.log(' -', x));
process.exit(problemas.size ? 1 : 0);
