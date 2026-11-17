// Menu: botão do celular + submenus. Sem biblioteca.
(function () {
  var botao = document.querySelector('.menu-botao');
  var menu = document.getElementById('menu-principal');
  if (!botao || !menu) return;
  function definir(aberto) {
    botao.setAttribute('aria-expanded', aberto ? 'true' : 'false');
    menu.classList.toggle('menu--aberto', aberto);
  }
  function fecharSubs(exceto) {
    menu.querySelectorAll('.menu__item--sub.aberto').forEach(function (li) {
      if (li === exceto) return;
      li.classList.remove('aberto');
      li.querySelector('.menu__sub-botao').setAttribute('aria-expanded', 'false');
    });
  }
  botao.addEventListener('click', function () { definir(botao.getAttribute('aria-expanded') !== 'true'); });
  // Botão de seta: abre/fecha o submenu (teclado e toque)
  menu.querySelectorAll('.menu__sub-botao').forEach(function (b) {
    b.addEventListener('click', function () {
      var li = b.closest('.menu__item--sub');
      var abrir = !li.classList.contains('aberto');
      fecharSubs(li);
      li.classList.toggle('aberto', abrir);
      b.setAttribute('aria-expanded', abrir ? 'true' : 'false');
    });
  });
  // Esc fecha submenus e o menu, devolvendo o foco
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    fecharSubs(null);
    if (botao.getAttribute('aria-expanded') === 'true') { definir(false); botao.focus(); }
  });
  // Clique fora fecha os submenus
  document.addEventListener('click', function (e) { if (!e.target.closest('.menu')) fecharSubs(null); });
  // Escolher um link fecha o menu
  menu.addEventListener('click', function (e) { if (e.target.closest('a')) { definir(false); fecharSubs(null); } });
})();
