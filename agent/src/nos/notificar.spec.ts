import { estadoInicial, type Achado } from "../estado";
import type { ClienteGitHub, IssueGitHub, NovaIssue } from "../github";
import {
  criarNoNotificar,
  extrairIdsConhecidos,
  marcador,
  montarCorpo,
  montarTitulo,
} from "./notificar";

const achado = (
  id: string,
  severidade: Achado["severidade"] = "ALTA",
): Achado => ({
  id,
  aliases: [],
  fonte: "osv",
  pacote: "exemplo",
  versao: "1.0.0",
  severidade,
  resumo: "Resumo | com pipe",
  url: `https://osv.dev/vulnerability/${id}`,
});

function issue(number: number, body: string | null): IssueGitHub {
  return {
    number,
    state: "open",
    title: `#${number}`,
    body,
    html_url: `https://github.com/x/y/issues/${number}`,
  };
}

function clienteFake(
  issues: IssueGitHub[],
): ClienteGitHub & { criadas: NovaIssue[] } {
  const criadas: NovaIssue[] = [];
  return {
    criadas,
    listarIssuesComLabel: async () => issues,
    criarIssue: async (nova) => {
      criadas.push(nova);
      return issue(99, nova.corpo);
    },
  };
}

describe("extrairIdsConhecidos", () => {
  it("lê os marcadores de todas as issues e ignora corpos nulos", () => {
    const ids = extrairIdsConhecidos([
      `texto ${marcador("CVE-2026-0001")}\n${marcador("GHSA-abcd")}`,
      null,
      "sem marcador",
    ]);
    expect([...ids].sort()).toEqual(["CVE-2026-0001", "GHSA-abcd"]);
  });
});

describe("montarTitulo / montarCorpo", () => {
  it("conta críticas e altas no título", () => {
    const titulo = montarTitulo(
      [achado("A", "CRITICA"), achado("B"), achado("C")],
      new Date("2026-11-04T10:00:00Z"),
    );
    expect(titulo).toBe("[CVE Watch] 1 crítica(s), 2 alta(s) — 2026-11-04");
  });

  it("escapa pipes e inclui marcador de dedupe por achado", () => {
    const corpo = montarCorpo([achado("CVE-1")], null, "org/repo");
    expect(corpo).toContain("Resumo \\| com pipe");
    expect(corpo).toContain(marcador("CVE-1"));
    expect(corpo).not.toContain("Triagem");
  });

  it("inclui a triagem quando presente", () => {
    const corpo = montarCorpo(
      [achado("CVE-1")],
      {
        resumo: "R",
        prioridades: [{ id: "CVE-1", acao: "upgrade", justificativa: "j" }],
        possiveisFalsosPositivos: ["CVE-9"],
      },
      "org/repo",
    );
    expect(corpo).toContain("Triagem (gerada por LLM");
    expect(corpo).toContain("| 1 | CVE-1 | upgrade | j |");
    expect(corpo).toContain("CVE-9");
  });
});

describe("criarNoNotificar", () => {
  const silencio = (): void => undefined;

  it("deduplica contra issues existentes e abre issue só com os novos", async () => {
    const cliente = clienteFake([issue(1, marcador("CVE-OLD"))]);
    const no = criarNoNotificar({
      cliente,
      repo: "org/repo",
      assignees: ["dev"],
      registrar: silencio,
    });

    const saida = await no(
      estadoInicial({
        dryRun: false,
        urgentes: [achado("CVE-OLD"), achado("CVE-NEW", "CRITICA")],
      }),
    );

    expect(cliente.criadas).toHaveLength(1);
    expect(cliente.criadas[0]?.assignees).toEqual(["dev"]);
    expect(cliente.criadas[0]?.corpo).toContain(marcador("CVE-NEW"));
    expect(cliente.criadas[0]?.corpo).not.toContain(marcador("CVE-OLD"));
    expect(saida.notificacao).toMatchObject({
      novos: ["CVE-NEW"],
      jaConhecidos: ["CVE-OLD"],
      issueUrl: "https://github.com/x/y/issues/99",
    });
  });

  it("não cria issue quando tudo já é conhecido", async () => {
    const cliente = clienteFake([issue(1, marcador("CVE-OLD"))]);
    const no = criarNoNotificar({
      cliente,
      repo: "org/repo",
      registrar: silencio,
    });

    const saida = await no(
      estadoInicial({ dryRun: false, urgentes: [achado("CVE-OLD")] }),
    );

    expect(cliente.criadas).toHaveLength(0);
    expect(saida.notificacao?.issueUrl).toBeNull();
  });

  it("em dry-run só imprime, mesmo com cliente", async () => {
    const cliente = clienteFake([]);
    const logs: string[] = [];
    const no = criarNoNotificar({
      cliente,
      repo: "org/repo",
      registrar: (m) => logs.push(m),
    });

    const saida = await no(
      estadoInicial({ dryRun: true, urgentes: [achado("CVE-1")] }),
    );

    expect(cliente.criadas).toHaveLength(0);
    expect(logs.join("\n")).toContain("DRY-RUN");
    expect(saida.notificacao?.dryRun).toBe(true);
  });

  it("segue sem deduplicação se listar issues falhar, registrando o erro", async () => {
    const cliente: ClienteGitHub = {
      listarIssuesComLabel: async () => {
        throw new Error("403");
      },
      criarIssue: async (nova) => issue(5, nova.corpo),
    };
    const no = criarNoNotificar({
      cliente,
      repo: "org/repo",
      registrar: silencio,
    });

    const saida = await no(
      estadoInicial({ dryRun: false, urgentes: [achado("CVE-1")] }),
    );

    expect(JSON.stringify(saida.erros)).toContain("não consegui listar issues");
    expect(saida.notificacao?.issueUrl).toBe("https://github.com/x/y/issues/5");
  });
});
