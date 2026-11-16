// Validações e máscaras dos formulários. Script clássico (sem import/export): expõe globalThis.Validacao.
// Funções puras, testadas em web/tests/formulario.test.mjs. O servidor repete as mesmas regras (nunca confie só no navegador).
(function (raiz) {
  const digitos = (s) => String(s ?? '').replace(/\D/g, '');

  function cpfValido(v) {
    const d = digitos(v);
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    for (const t of [9, 10]) {
      let soma = 0;
      for (let i = 0; i < t; i++) soma += Number(d[i]) * (t + 1 - i);
      const dv = ((soma * 10) % 11) % 10;
      if (dv !== Number(d[t])) return false;
    }
    return true;
  }

  // CNPJ numérico ou alfanumérico (vigente desde jul/2026): 12 posições [0-9A-Z] + 2 dígitos verificadores.
  const cnpjLimpo = (v) => String(v ?? '').toUpperCase().replace(/[.\-\/\s]/g, '');
  function cnpjValido(v) {
    const s = cnpjLimpo(v);
    if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(s) || /^(.)\1{13}$/.test(s)) return false;
    const dv = (base) => {
      let p = 2, soma = 0;
      for (let i = base.length - 1; i >= 0; i--) { soma += (base.charCodeAt(i) - 48) * p; p = p === 9 ? 2 : p + 1; }
      const r = soma % 11;
      return r < 2 ? 0 : 11 - r;
    };
    const d1 = dv(s.slice(0, 12)), d2 = dv(s.slice(0, 12) + d1);
    return s.endsWith(`${d1}${d2}`);
  }

  // Telefone BR: DDD 11-99, celular (9 dígitos começando em 9) ou fixo (8 dígitos começando em 2-5)
  function telefoneValido(v) {
    const d = digitos(v);
    if (d.length !== 10 && d.length !== 11) return false;
    if (Number(d.slice(0, 2)) < 11) return false;
    const n = d.slice(2);
    return n.length === 9 ? n[0] === '9' : /^[2-5]/.test(n);
  }

  const emailValido = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v ?? '').trim()) && String(v).length <= 254;

  // Data dd/mm/aaaa, real, no passado e com idade entre 14 e 110 anos
  function dataValida(v, hoje = new Date()) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v ?? ''));
    if (!m) return false;
    const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const dt = new Date(a, mes - 1, d);
    if (dt.getFullYear() !== a || dt.getMonth() !== mes - 1 || dt.getDate() !== d) return false;
    const idade = (hoje - dt) / (365.25 * 24 * 3600 * 1000);
    return idade >= 14 && idade <= 110;
  }

  // PIS/PASEP: 11 dígitos com dígito verificador
  function pisValido(v) {
    const d = digitos(v);
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    const pesos = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((s, p, i) => s + p * Number(d[i]), 0);
    const r = 11 - (soma % 11);
    return (r >= 10 ? 0 : r) === Number(d[10]);
  }

  // arquivo = { name, size }; regras = { accept: '.pdf,.doc', maxMB: 5 }
  function arquivoErro(arquivo, regras) {
    const ext = '.' + String(arquivo.name).split('.').pop().toLowerCase();
    const aceitas = String(regras.accept ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (aceitas.length && !aceitas.includes(ext)) return `"${arquivo.name}": tipo não aceito. Use ${aceitas.join(', ')}.`;
    if (arquivo.size > (regras.maxMB ?? 5) * 1024 * 1024) return `"${arquivo.name}": passa de ${regras.maxMB ?? 5} MB.`;
    if (arquivo.size === 0) return `"${arquivo.name}": o arquivo está vazio.`;
    return '';
  }

  const cortar = (v, n) => digitos(v).slice(0, n);
  const mascara = {
    cpf: (v) => cortar(v, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'),
    cnpj: (v) => { const s = String(v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 14); const p = [s.slice(0, 2), s.slice(2, 5), s.slice(5, 8), s.slice(8, 12), s.slice(12, 14)]; return p[0] + (p[1] ? '.' + p[1] : '') + (p[2] ? '.' + p[2] : '') + (p[3] ? '/' + p[3] : '') + (p[4] ? '-' + p[4] : ''); },
    pis: (v) => cortar(v, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{5})(\d)/, '$1.$2').replace(/(\d{2})(\d{1})$/, '$1-$2'),
    tel: (v) => { const d = cortar(v, 11); return d.length > 10 ? d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3') : d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').replace(/-$/, ''); },
    data: (v) => cortar(v, 8).replace(/(\d{2})(\d)/, '$1/$2').replace(/(\d{2})(\d)/, '$1/$2'),
  };

  // Mensagem de erro de UM campo (string vazia = válido). tipo: texto|email|tel|cpf|cnpj|data|pis|textarea|select|consent
  function erroCampo(tipo, valor, { obrigatorio = false, max = 0 } = {}) {
    const v = String(valor ?? '').trim();
    if (!v) return obrigatorio ? (tipo === 'consent' ? 'Marque esta opção para continuar.' : 'Preencha este campo.') : '';
    if (max && v.length > max) return `Use no máximo ${max} caracteres.`;
    switch (tipo) {
      case 'email': return emailValido(v) ? '' : 'Informe um e-mail válido, como nome@exemplo.com.';
      case 'tel': return telefoneValido(v) ? '' : 'Informe o telefone com DDD, por exemplo (35) 99999-9999.';
      case 'cpf': return cpfValido(v) ? '' : 'CPF inválido. Confira os números.';
      case 'cnpj': return cnpjValido(v) ? '' : 'CNPJ inválido. Confira os números.';
      case 'pis': return pisValido(v) ? '' : 'PIS/PASEP inválido. Confira os números.';
      case 'data': return dataValida(v) ? '' : 'Informe uma data válida no formato dd/mm/aaaa.';
      default: return '';
    }
  }

  raiz.Validacao = { digitos, cpfValido, cnpjValido, telefoneValido, emailValido, dataValida, pisValido, arquivoErro, mascara, erroCampo };
})(globalThis);
