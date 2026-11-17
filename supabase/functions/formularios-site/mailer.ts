// Entrega de e-mail. Interface trocável: o provedor concreto é decidido pelo teste do WP 2.0
// (caixa SMTP na Hostgator, script PHP ou outro). NUNCA Google, Brevo ou n8n.

export interface Anexo { nome: string; contentType: string; conteudo: Uint8Array }
export interface Envio {
  para: string;
  responderPara?: string;
  assunto: string;
  texto: string;
  anexos: Anexo[];
}
export interface Mailer { enviar(e: Envio): Promise<void> }

/** Implementação de teste: guarda o que seria enviado. */
export class MailerMemoria implements Mailer {
  enviados: Envio[] = [];
  falhar = false;
  enviar(e: Envio): Promise<void> {
    if (this.falhar) return Promise.reject(new Error("falha simulada"));
    this.enviados.push(e);
    return Promise.resolve();
  }
}

export interface ConfigSmtp { host: string; porta: number; usuario: string; senha: string; de: string }

export function configSmtp(env: (k: string) => string | undefined): ConfigSmtp | null {
  const host = env("SMTP_HOST"), usuario = env("SMTP_USER"), senha = env("SMTP_PASS"), de = env("SMTP_FROM");
  if (!host || !usuario || !senha || !de) return null;
  return { host, porta: Number(env("SMTP_PORT") ?? 465), usuario, senha, de };
}

/** SMTP via denomailer (importado só quando usado, para os testes não dependerem da rede). */
export class MailerSmtp implements Mailer {
  constructor(private cfg: ConfigSmtp) {}
  async enviar(e: Envio): Promise<void> {
    const { SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts");
    const cliente = new SMTPClient({
      connection: { hostname: this.cfg.host, port: this.cfg.porta, tls: this.cfg.porta === 465, auth: { username: this.cfg.usuario, password: this.cfg.senha } },
    });
    try {
      await cliente.send({
        from: this.cfg.de,
        to: e.para,
        replyTo: e.responderPara,
        subject: e.assunto,
        content: e.texto,
        attachments: e.anexos.map((a) => ({ filename: a.nome, content: a.conteudo, contentType: a.contentType, encoding: "binary" as const })),
      });
    } finally {
      await cliente.close();
    }
  }
}
