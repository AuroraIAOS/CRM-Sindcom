// Exige `npm run build` antes. Carrega a página gerada no jsdom e exercita o componente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const js = (f) => readFileSync(new URL(`../src/assets/js/${f}`, import.meta.url), 'utf8');
function abrir(pagina, url = 'http://localhost/') {
  const html = readFileSync(new URL(`../dist/${pagina}/index.html`, import.meta.url), 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url });
  dom.window.eval(js('validacao.js')); dom.window.eval(js('formulario.js'));
  return dom.window;
}
const enviar = (w, f) => f.dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
const preenche = (w, form, nome, v) => { const el = form.elements[nome]; el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };

test('contato: vazio mostra resumo e erros acessíveis', () => {
  const w = abrir('contato'); const form = w.document.querySelector('.form-site form');
  enviar(w, form);
  const resumo = w.document.querySelector('.form-site__resumo');
  assert.equal(resumo.hidden, false);
  assert.match(resumo.textContent, /Corrija 8 campos/);
  assert.equal(form.elements.nome.getAttribute('aria-invalid'), 'true');
  assert.equal(w.document.getElementById('erro-contato-nome').hidden, false);
});

test('contato: ?assunto= preenche e válido não mostra erro (modo demonstração)', () => {
  const w = abrir('contato', 'http://localhost/contato/?assunto=Duvida'); const form = w.document.querySelector('.form-site form');
  assert.equal(form.elements.assunto.value, 'Duvida');
  preenche(w, form, 'nome', 'Maria Souza'); preenche(w, form, 'telefone', '35999999999');
  preenche(w, form, 'email', 'maria@exemplo.com'); preenche(w, form, 'cidade', 'Passos');
  preenche(w, form, 'estado', 'MG'); preenche(w, form, 'mensagem', 'Olá');
  form.elements.consentimento.checked = true;
  assert.equal(form.elements.telefone.value, '(35) 99999-9999'); // máscara aplicada
  enviar(w, form);
  assert.equal(w.document.querySelector('.form-site__resumo').hidden, true);
  assert.match(w.document.querySelector('.form-site__status').textContent, /modo demonstração/);
});

test('denúncia: campos de identificação só aparecem com "sim" e anônimo não os valida', () => {
  const w = abrir('denuncie'); const form = w.document.querySelector('.form-site form');
  const bloco = form.elements.nome.closest('.campo');
  assert.equal(bloco.hidden, true); assert.equal(form.elements.nome.disabled, true);
  const sim = form.querySelector('[name=identificar][value=sim]'); sim.checked = true; sim.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(bloco.hidden, false); assert.equal(form.elements.nome.disabled, false);
  const nao = form.querySelector('[name=identificar][value=nao]'); nao.checked = true; nao.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(bloco.hidden, true);
});

test('filiação: CPF inválido é recusado; todas as páginas têm honeypot e um único formulário', () => {
  const w = abrir('filie-se'); const form = w.document.querySelector('.form-site form');
  preenche(w, form, 'cpf', '11111111111'); enviar(w, form);
  assert.match(w.document.getElementById('erro-filiacao-cpf').textContent, /CPF inválido/);
  for (const p of ['contato', 'filie-se', 'denuncie', 'curriculo', 'vaga']) {
    const d = abrir(p).document;
    assert.equal(d.querySelectorAll('.form-site').length, 1, p);
    assert.ok(d.querySelector('input[name=_hp]'), p);
  }
});
