// Mapa de atuação: carrega Leaflet (self-hosted) e os dados só quando o mapa fica visível.
// Tiles: OpenStreetMap. Nenhum recurso de terceiros além dos tiles.
(() => {
  const alvos = [...document.querySelectorAll('[data-mapa-atuacao]:not([data-pronto])')];
  if (!alvos.length) return;

  const carregarLeaflet = () => window.__leafletP ??= new Promise((ok, erro) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = '/assets/vendor/leaflet/leaflet.css';
    document.head.appendChild(css);
    if (window.L) return ok(window.L);
    const s = document.createElement('script');
    s.src = '/assets/vendor/leaflet/leaflet.js';
    s.onload = () => ok(window.L); s.onerror = erro;
    document.head.appendChild(s);
  });

  const anelExterno = (g) => (g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0]);
  const aneis = (g) => (g.type === 'Polygon' ? g.coordinates : g.coordinates.flat());

  async function montar(el) {
    el.dataset.pronto = '1';
    try {
      const [L, dados] = await Promise.all([carregarLeaflet(), fetch(el.dataset.fonte).then((r) => r.json())]);
      el.textContent = '';
      const mapa = L.map(el, { center: dados.centro, zoom: dados.zoom, minZoom: dados.zoomMin, maxZoom: dados.zoomMax, scrollWheelZoom: false });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">Colaboradores do OpenStreetMap</a>',
      }).addTo(mapa);

      // Minas Gerais esmaecida, com "buracos" nos municípios do SINDCOM (como no mapa original).
      const buracos = dados.municipios.features.flatMap((f) => aneis(f.geometry));
      L.geoJSON({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [anelExterno(dados.minas.features[0].geometry), ...buracos] } },
        { style: { fillColor: '#8a8a8a', fillOpacity: 0.28, color: '#ffffff', weight: 0.8 }, interactive: false }).addTo(mapa);

      L.geoJSON(dados.municipios, {
        style: { fillColor: dados.cor, fillOpacity: 0.22, color: dados.cor, weight: 1.2 },
        onEachFeature: (f, camada) => camada.bindTooltip(f.properties.name, { sticky: true }),
      }).addTo(mapa);

      const rotulos = L.layerGroup(dados.municipios.features.map((f) => L.marker([f.properties.centroid_lat, f.properties.centroid_lng], {
        icon: L.divIcon({ className: 'rotulo-municipio', html: f.properties.name, iconAnchor: [0, 0] }), interactive: false, keyboard: false,
      })));
      const atualizar = () => (mapa.getZoom() >= dados.rotulosDesdeZoom ? mapa.addLayer(rotulos) : mapa.removeLayer(rotulos));
      mapa.on('zoomend', atualizar); atualizar();
      mapa.once('focus', () => mapa.scrollWheelZoom.enable());
    } catch {
      el.innerHTML = '<p class="mapa-atuacao__aviso">Não foi possível carregar o mapa agora. Os municípios estão listados no texto da página.</p>';
    }
  }

  const io = new IntersectionObserver((itens) => itens.forEach((i) => { if (i.isIntersecting) { io.unobserve(i.target); montar(i.target); } }), { rootMargin: '200px' });
  alvos.forEach((e) => io.observe(e));
})();
