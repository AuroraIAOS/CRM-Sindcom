// node --test web/tests/formulario.test.mjs — valida as funções puras de src/assets/js/validacao.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const g = {};
new Function('globalThis', readFileSync(new URL('../src/assets/js/validacao.js', import.meta.url), 'utf8'))(g);
const V = g.Validacao;

test('CPF', () => {
  assert.equal(V.cpfValido('529.982.247-25'), true);
  assert.equal(V.cpfValido('52998224725'), true);
  assert.equal(V.cpfValido('529.982.247-24'), false);
  assert.equal(V.cpfValido('111.111.111-11'), false);
  assert.equal(V.cpfValido('123'), false);
});

test('CNPJ (o do próprio SINDCOM é válido)', () => {
  assert.equal(V.cnpjValido('23.778.277/0001-45'), true);
  assert.equal(V.cnpjValido('23.778.277/0001-46'), false);
  assert.equal(V.cnpjValido('00000000000000'), false);
  assert.equal(V.cnpjValido('12.ABC.345/01DE-35'), true); // exemplo oficial de CNPJ alfanumérico
  assert.equal(V.cnpjValido('12.ABC.345/01DE-36'), false);
});

test('telefone BR', () => {
  assert.equal(V.telefoneValido('(35) 99999-9999'), true);
  assert.equal(V.telefoneValido('(35) 3526-3847'), true);
  assert.equal(V.telefoneValido('35 8999-9999'), false); // 8 dígitos começando em 8 não é fixo
  assert.equal(V.telefoneValido('(05) 99999-9999'), false); // DDD inválido
  assert.equal(V.telefoneValido('9999-9999'), false); // sem DDD
});

test('e-mail', () => {
  assert.equal(V.emailValido('contato@sindcompassos.org'), true);
  assert.equal(V.emailValido('contato@sindcompassos'), false);
  assert.equal(V.emailValido('a b@x.com'), false);
});

test('data de nascimento', () => {
  const hoje = new Date(2026, 10, 12);
  assert.equal(V.dataValida('15/03/1990', hoje), true);
  assert.equal(V.dataValida('31/02/1990', hoje), false);
  assert.equal(V.dataValida('15/03/2020', hoje), false); // menor de 14
  assert.equal(V.dataValida('1990-03-15', hoje), false);
});

test('PIS/PASEP', () => {
  assert.equal(V.pisValido('120.12345.67-8'), false);
  assert.equal(V.pisValido('12345678919'), true);
  assert.equal(V.pisValido('00000000000'), false);
});

test('arquivos', () => {
  const regras = { accept: '.pdf,.doc,.docx', maxMB: 5 };
  assert.equal(V.arquivoErro({ name: 'cv.PDF', size: 1000 }, regras), '');
  assert.match(V.arquivoErro({ name: 'cv.exe', size: 1000 }, regras), /tipo não aceito/);
  assert.match(V.arquivoErro({ name: 'cv.pdf', size: 6 * 1024 * 1024 }, regras), /passa de 5 MB/);
  assert.match(V.arquivoErro({ name: 'cv.pdf', size: 0 }, regras), /vazio/);
});

test('máscaras', () => {
  assert.equal(V.mascara.cpf('52998224725'), '529.982.247-25');
  assert.equal(V.mascara.cnpj('23778277000145'), '23.778.277/0001-45');
  assert.equal(V.mascara.cnpj('12abc34501de35'), '12.ABC.345/01DE-35');
  assert.equal(V.mascara.tel('35999999999'), '(35) 99999-9999');
  assert.equal(V.mascara.tel('3535263847'), '(35) 3526-3847');
  assert.equal(V.mascara.data('15031990'), '15/03/1990');
});

test('erroCampo: obrigatório, limite e consentimento', () => {
  assert.equal(V.erroCampo('texto', '', { obrigatorio: true }), 'Preencha este campo.');
  assert.equal(V.erroCampo('texto', '', { obrigatorio: false }), '');
  assert.match(V.erroCampo('texto', 'x'.repeat(11), { max: 10 }), /no máximo 10/);
  assert.match(V.erroCampo('consent', '', { obrigatorio: true }), /Marque/);
  assert.match(V.erroCampo('email', 'ruim', { obrigatorio: true }), /e-mail válido/);
});

test('CSS: campo condicional oculto não pode ser reexibido por display do componente; sem "(opcional)" nos rótulos', () => {
  const css = readFileSync(new URL('../src/assets/css/paginas/formulario.css', import.meta.url), 'utf8');
  assert.match(css, /\.campo\[hidden\]\s*\{\s*display:\s*none/);
  const tpl = readFileSync(new URL('../src/_includes/formulario.njk', import.meta.url), 'utf8');
  assert.doesNotMatch(tpl, /\(opcional\)/);
  const dados = readFileSync(new URL('../src/_data/formularios.json', import.meta.url), 'utf8');
  assert.doesNotMatch(dados, /\(opcional\)/);
});
