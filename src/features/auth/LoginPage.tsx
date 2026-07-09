import { useState, type FormEvent } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { homeDoRole } from "@/app/nav";

export function LoginPage() {
  const { session, role, carregando, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Já autenticado → vai para a home do papel.
  if (!carregando && session) return <Navigate to={homeDoRole(role)} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const { error } = await signIn(email.trim(), senha);
    setEnviando(false);
    if (error) setErro("E-mail ou senha inválidos.");
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg bg-white p-8 shadow-sm"
      >
        <img
          src="/assets/brand/logo_horizontal_colorido.png"
          alt="Sindcom"
          className="mx-auto mb-2 max-w-[200px]"
        />
        <h1 className="text-center text-2xl font-semibold">Entrar</h1>

        <label className="flex flex-col gap-1 text-sm">
          E-mail
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-black/15 px-3 py-2 outline-none focus:border-realce"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Senha
          <input
            type="password"
            required
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="rounded-md border border-black/15 px-3 py-2 outline-none focus:border-realce"
          />
        </label>

        {erro && <p className="text-sm text-estado-erro">{erro}</p>}

        <button
          type="submit"
          disabled={enviando}
          className="rounded-md bg-realce px-4 py-2 font-bold text-white disabled:opacity-60"
        >
          {enviando ? "Entrando…" : "Entrar"}
        </button>

        <Link to="/recuperar-senha" className="text-center text-sm text-texto-2 hover:text-realce">
          Esqueci minha senha
        </Link>
      </form>
    </div>
  );
}
