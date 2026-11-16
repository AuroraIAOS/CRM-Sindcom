// Comportamentos compartilhados. Cada um é ativado por atributo data-*; sem o atributo, nada roda.
const reduzMovimento = matchMedia('(prefers-reduced-motion: reduce)').matches;
const quandoVisivel = (seletor, fn) => {
  const els = document.querySelectorAll(seletor);
  if (!els.length) return;
  const io = new IntersectionObserver((itens) => itens.forEach((i) => { if (i.isIntersecting) { io.unobserve(i.target); fn(i.target); } }), { rootMargin: '120px' });
  els.forEach((e) => io.observe(e));
};

// <span data-contador="17500" data-prefixo="+">0</span> — conta até o valor ao aparecer na tela
quandoVisivel('[data-contador]', (el) => {
  const alvo = Number(el.dataset.contador), fmt = (n) => (el.dataset.prefixo ?? '') + n.toLocaleString('pt-BR');
  if (reduzMovimento) { el.textContent = fmt(alvo); return; }
  const t0 = performance.now(), dur = 1400;
  const passo = (t) => { const p = Math.min(1, (t - t0) / dur); el.textContent = fmt(Math.round(alvo * (1 - (1 - p) ** 3))); if (p < 1) requestAnimationFrame(passo); };
  requestAnimationFrame(passo);
});

// <div data-revelar> — surge suavemente (a classe .revelar-pronto é aplicada só quando o JS roda)
document.documentElement.classList.add('js');
quandoVisivel('[data-revelar]', (el) => el.classList.add('revelado'));

// <div data-lottie="/assets/lottie/denuncia.json" role="img" aria-label="..."> — carrega o player só quando visível
quandoVisivel('[data-lottie]', (el) => {
  if (reduzMovimento) return;
  const s = document.createElement('script');
  s.src = '/assets/js/lottie.min.js';
  s.onload = () => window.lottie.loadAnimation({ container: el, path: el.dataset.lottie, renderer: 'svg', loop: true, autoplay: true });
  document.head.appendChild(s);
});
