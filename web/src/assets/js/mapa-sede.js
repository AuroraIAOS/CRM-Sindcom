// Mapa da sede no rodapé: Leaflet (hospedado no próprio site) + OpenStreetMap, carregado só quando aparece na tela.
(() => {
  const alvos = [...document.querySelectorAll('[data-mapa-sede]')];
  if (!alvos.length) return;
  const carregar = () => window.__leafletP ??= new Promise((ok, erro) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = '/assets/vendor/leaflet/leaflet.css';
    document.head.appendChild(css);
    if (window.L) return ok(window.L);
    const s = document.createElement('script');
    s.src = '/assets/vendor/leaflet/leaflet.js';
    s.onload = () => ok(window.L); s.onerror = erro;
    document.head.appendChild(s);
  });
  const montar = async (alvo) => {
    try {
      const L = await carregar();
      const pos = [Number(alvo.dataset.lat), Number(alvo.dataset.lng)];
      const mapa = L.map(alvo, { center: pos, zoom: 16, scrollWheelZoom: false });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(mapa);
      L.marker(pos, { icon: L.divIcon({ className: '', html: '<div class="pino-sede"></div>', iconSize: [30, 30], iconAnchor: [15, 30] }), title: 'SINDCOM' }).addTo(mapa);
      mapa.once('focus', () => mapa.scrollWheelZoom.enable());
    } catch { /* mantém o link "Abrir no mapa" */ }
  };
  const io = new IntersectionObserver((itens) => itens.forEach((i) => { if (i.isIntersecting) { io.unobserve(i.target); montar(i.target); } }), { rootMargin: '200px' });
  alvos.forEach((a) => io.observe(a));
})();
