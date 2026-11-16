// Comportamento dos formulários do site (componente _includes/formulario.njk). Depende de validacao.js.
// Nada é guardado no navegador (sem localStorage): filiação e denúncia envolvem dado sensível.
(function () {
  const V = globalThis.Validacao;
  const $ = (el, s) => el.querySelector(s);
  const $$ = (el, s) => [...el.querySelectorAll(s)];

  function iniciar(raiz) {
    const form = $(raiz, 'form'), resumo = $(raiz, '.form-site__resumo'), status = $(raiz, '.form-site__status');
    const ok = $(raiz, '.form-site__ok'), botao = $(form, 'button[type=submit]');
    const endpoint = (raiz.dataset.endpoint || '').replace(/\/$/, ''), maxMB = Number(raiz.dataset.maxmb || 5);
    const nomeForm = raiz.dataset.formulario;

    // máscaras
    $$(form, 'input[data-tipo]').forEach((i) => {
      const m = V.mascara[i.dataset.tipo];
      if (m) i.addEventListener('input', () => { i.value = m(i.value); });
    });
    // contador de caracteres
    $$(form, 'textarea').forEach((t) => {
      const c = $(form, `[data-conta="${t.id}"]`);
      if (c) t.addEventListener('input', () => { c.textContent = t.value.length; });
    });
    // ?assunto= (contato)
    const assunto = $(form, '[name=assunto]');
    if (assunto) { const a = new URLSearchParams(location.search).get('assunto'); if (a) assunto.value = a.slice(0, 60); }

    // campos condicionais: data-mostrar-se="campo=valor"
    const atualizaCondicionais = () => $$(form, '[data-mostrar-se]').forEach((bloco) => {
      const [campo, valor] = bloco.dataset.mostrarSe.split('=');
      const marcado = $(form, `[name=${campo}]:checked`);
      const mostrar = marcado && marcado.value === valor;
      bloco.hidden = !mostrar;
      $$(bloco, 'input,select,textarea').forEach((x) => { x.disabled = !mostrar; });
      if (!mostrar) $$(bloco, 'input[type=text],input[type=email],input[type=tel],textarea').forEach((x) => { x.value = ''; });
    });
    form.addEventListener('change', atualizaCondicionais);
    atualizaCondicionais();

    // lista de arquivos escolhidos
    $$(form, 'input[type=file]').forEach((f) => f.addEventListener('change', () => {
      const lista = $(form, `[data-lista="${f.id}"]`);
      lista.replaceChildren(...[...f.files].map((a) => { const li = document.createElement('li'); li.textContent = `${a.name} (${(a.size / 1048576).toFixed(1)} MB)`; return li; }));
    }));

    // erros
    const mostraErro = (campo, msg) => {
      // o primeiro token de aria-describedby de todo campo é o id do seu <p class="erro">
      const p = document.getElementById((campo.getAttribute('aria-describedby') || '').split(' ')[0]);
      if (!p) return;
      p.textContent = msg; p.hidden = !msg;
      if (campo.setAttribute) { msg ? campo.setAttribute('aria-invalid', 'true') : campo.removeAttribute('aria-invalid'); }
    };

    function validar() {
      const falhas = [];
      const registra = (alvo, msg, rotulo) => { mostraErro(alvo, msg); if (msg) falhas.push({ alvo, msg, rotulo }); };
      $$(form, '[data-tipo]').forEach((el) => {
        if (el.closest('[hidden]') || el.disabled) return;
        const rotulo = (el.id && $(raiz, `label[for="${el.id}"]`)?.firstChild?.textContent.trim()) || el.name;
        const tipo = el.dataset.tipo;
        if (tipo === 'arquivo') {
          const arqs = [...el.files], max = Number(el.dataset.maxarq || 1);
          let msg = el.dataset.obrigatorio && !arqs.length ? 'Escolha um arquivo.' : '';
          if (!msg && arqs.length > max) msg = `Envie no máximo ${max} arquivo(s).`;
          if (!msg) for (const a of arqs) { msg = V.arquivoErro(a, { accept: el.accept, maxMB }); if (msg) break; }
          registra(el, msg, rotulo);
        } else if (tipo === 'consent') {
          registra(el, el.checked ? '' : V.erroCampo('consent', '', { obrigatorio: true }), 'Consentimento');
        } else if (tipo === 'radio' || tipo === 'checkboxes') {
          const algum = !!$(el, 'input:checked');
          registra(el, el.dataset.obrigatorio && !algum ? 'Escolha uma opção.' : '', $(el, 'legend')?.firstChild?.textContent.trim());
        } else {
          registra(el, V.erroCampo(tipo, el.value, { obrigatorio: !!el.dataset.obrigatorio, max: Number(el.getAttribute('maxlength') || 0) }), rotulo);
        }
      });
      return falhas;
    }

    // Turnstile: carregado só quando a pessoa interage e há endpoint ativo
    let turnstileId = null, carregando = false;
    const carregaTurnstile = () => {
      if (!endpoint || carregando) return; carregando = true;
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.async = true;
      s.onload = () => { turnstileId = window.turnstile.render($(raiz, '.form-site__turnstile'), { sitekey: raiz.dataset.chave, language: 'pt-br' }); };
      document.head.appendChild(s);
    };
    form.addEventListener('focusin', carregaTurnstile, { once: true });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      status.textContent = ''; resumo.hidden = true;
      const falhas = validar();
      if (falhas.length) {
        resumo.hidden = false;
        resumo.replaceChildren(Object.assign(document.createElement('p'), { textContent: `Corrija ${falhas.length === 1 ? 'o campo abaixo' : falhas.length + ' campos'} para enviar:` }));
        const ul = document.createElement('ul');
        falhas.forEach((f) => { const li = document.createElement('li'); li.textContent = `${f.rotulo}: ${f.msg}`; ul.appendChild(li); });
        resumo.appendChild(ul); resumo.focus();
        return;
      }
      if (!endpoint) { status.textContent = 'O envio ainda não está ativo (modo demonstração). Nada foi enviado.'; return; }
      botao.disabled = true; status.textContent = 'Enviando…';
      try {
        const dados = new FormData(form);
        const r = await fetch(`${endpoint}/${nomeForm}`, { method: 'POST', body: dados });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.ok) {
          form.hidden = true; $(raiz, '.form-site__demo')?.setAttribute('hidden', '');
          $(ok, '.form-site__ok-msg').textContent = form.dataset.sucesso;
          if (j.protocolo && raiz.dataset.protocolo) { const p = $(ok, '.form-site__protocolo'); $(p, 'strong').textContent = j.protocolo; p.hidden = false; }
          ok.hidden = false; ok.focus();
        } else {
          Object.entries(j.erros || {}).forEach(([nome, msg]) => { const campo = form.elements[nome]; if (campo && campo.id) mostraErro(campo, msg); });
          status.textContent = j.mensagem || 'Não foi possível enviar agora. Seus dados continuam na tela; tente de novo em instantes.';
          if (turnstileId !== null) window.turnstile.reset(turnstileId);
        }
      } catch {
        status.textContent = 'Sem conexão com o servidor. Seus dados continuam na tela; tente de novo ou escreva para contato@sindcompassos.org.';
      } finally { botao.disabled = false; }
    });

    $(ok, '[data-novo]').addEventListener('click', () => { form.reset(); atualizaCondicionais(); ok.hidden = true; form.hidden = false; $(form, 'input,select,textarea')?.focus(); });
  }

  document.querySelectorAll('.form-site').forEach(iniciar);
})();
