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
// A biblioteca é carregada UMA vez e compartilhada: injetá-la de novo por animação quebrava a segunda (escudo cortado no rodapé)
let lottieP;
const carregarLottie = () => (lottieP ??= new Promise((ok, erro) => {
  if (window.lottie) return ok(window.lottie);
  const s = document.createElement('script');
  s.src = '/assets/js/lottie.min.js';
  s.onload = () => ok(window.lottie); s.onerror = erro;
  document.head.appendChild(s);
}));
quandoVisivel('[data-lottie]', async (el) => {
  if (reduzMovimento) return;
  try {
    const l = await carregarLottie();
    l.loadAnimation({ container: el, path: el.dataset.lottie, renderer: 'svg', loop: true, autoplay: true });
  } catch { /* sem animação: o texto da página continua completo */ }
});
