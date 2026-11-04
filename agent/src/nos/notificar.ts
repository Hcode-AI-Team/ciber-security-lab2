import type {
  Achado,
  NoCveWatch,
  ResultadoNotificacao,
  Triagem,
} from "../estado";
import type { ClienteGitHub } from "../github";
import { mensagemDeErro } from "../http";

export const LABEL_RASTREIO = "cve-watch";
export const LABELS_ISSUE = ["seguranca", "urgente", LABEL_RASTREIO];

const MARCADOR = /<!--\s*cve-watch:([^\s]+?)\s*-->/g;

export function marcador(id: string): string {
  return `<!-- cve-watch:${id} -->`;
}

/** Ids já anunciados em qualquer issue (aberta ou fechada) com a label de rastreio. */
export function extrairIdsConhecidos(
  corpos: ReadonlyArray<string | null>,
): Set<string> {
  const ids = new Set<string>();
  for (const corpo of corpos) {
    for (const m of (corpo ?? "").matchAll(MARCADOR)) {
      if (m[1]) ids.add(m[1]);
    }
  }
  return ids;
}

export function montarTitulo(novos: readonly Achado[], data: Date): string {
  const criticos = novos.filter((a) => a.severidade === "CRITICA").length;
  const altos = novos.length - criticos;
  const partes = [
    criticos > 0 ? `${criticos} crítica(s)` : null,
    altos > 0 ? `${altos} alta(s)` : null,
  ].filter(Boolean);
  return `[CVE Watch] ${partes.join(", ")} — ${data.toISOString().slice(0, 10)}`;
}

export function montarCorpo(
  novos: readonly Achado[],
  triagem: Triagem | null,
  repo: string,
): string {
  const linhas: string[] = [
    "## Vulnerabilidades alta/crítica encontradas nas dependências",
    "",
    `Varredura automática do agente \`cve-watch\` (LangGraph, \`agent/\`) sobre os \`package-lock.json\` de \`${repo}\` + NVD por palavras-chave.`,
    "",
    "| Severidade | ID | Pacote | Versão | Fonte | Resumo |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const a of novos) {
    const resumo = a.resumo
      .replace(/\|/g, "\\|")
      .replace(/\s+/g, " ")
      .slice(0, 160);
    linhas.push(
      `| **${a.severidade}** | [${a.id}](${a.url}) | ${a.pacote ?? "—"} | ${a.versao ?? "—"} | ${a.fonte.toUpperCase()} | ${resumo} |`,
    );
  }
  if (triagem) {
    linhas.push(
      "",
      "### Triagem (gerada por LLM — revise antes de agir)",
      "",
      triagem.resumo,
      "",
    );
    if (triagem.prioridades.length > 0) {
      linhas.push(
        "| Prioridade | ID | Ação sugerida | Justificativa |",
        "| --- | --- | --- | --- |",
      );
      triagem.prioridades.forEach((p, i) =>
        linhas.push(`| ${i + 1} | ${p.id} | ${p.acao} | ${p.justificativa} |`),
      );
    }
    if (triagem.possiveisFalsosPositivos.length > 0) {
      linhas.push(
        "",
        `Possíveis falsos positivos (confirmar): ${triagem.possiveisFalsosPositivos.join(", ")}`,
      );
    }
  }
  linhas.push(
    "",
    "### O que fazer",
    "",
    "1. Confirmar se o pacote afetado chega a produção (dependência `dev` não roda em PRD, mas roda no CI).",
    "2. Planejar o upgrade; registrar a decisão nesta issue antes da próxima GMUD (`docs/politica-ia.md`, §4).",
    "3. Fechar a issue quando a versão corrigida estiver na `main`.",
    "",
    "<sub>Marcadores de deduplicação — não remover:</sub>",
    ...novos.map((a) => marcador(a.id)),
  );
  return linhas.join("\n");
}

export interface OpcoesNotificar {
  cliente: ClienteGitHub | null;
  repo: string;
  assignees?: string[];
  agora?: () => Date;
  registrar?: (mensagem: string) => void;
}

export function criarNoNotificar(opcoes: OpcoesNotificar): NoCveWatch {
  const log = opcoes.registrar ?? ((m: string) => console.log(m));
  return async (estado) => {
    const erros: string[] = [];
    const resultado: ResultadoNotificacao = {
      issueUrl: null,
      novos: [],
      jaConhecidos: [],
      dryRun: estado.dryRun,
    };

    let conhecidos = new Set<string>();
    if (opcoes.cliente) {
      try {
        const issues =
          await opcoes.cliente.listarIssuesComLabel(LABEL_RASTREIO);
        conhecidos = extrairIdsConhecidos(issues.map((i) => i.body));
      } catch (erro) {
        erros.push(
          `notificar: não consegui listar issues (${mensagemDeErro(erro)}); seguindo sem deduplicação`,
        );
      }
    }

    const novos = estado.urgentes.filter((a) => !conhecidos.has(a.id));
    resultado.novos = novos.map((a) => a.id);
    resultado.jaConhecidos = estado.urgentes
      .filter((a) => conhecidos.has(a.id))
      .map((a) => a.id);

    if (novos.length === 0) {
      log(
        `[notificar] nada novo: ${resultado.jaConhecidos.length} urgente(s) já têm issue.`,
      );
      return { notificacao: resultado, erros };
    }

    const data = (opcoes.agora ?? (() => new Date()))();
    const issue = {
      titulo: montarTitulo(novos, data),
      corpo: montarCorpo(novos, estado.triagem, opcoes.repo),
      labels: LABELS_ISSUE,
      assignees: opcoes.assignees ?? [],
    };

    if (estado.dryRun || !opcoes.cliente) {
      log(
        `[notificar] DRY-RUN — issue que seria aberta:\n\n# ${issue.titulo}\n\n${issue.corpo}\n`,
      );
      return { notificacao: resultado, erros };
    }

    try {
      const criada = await opcoes.cliente.criarIssue(issue);
      resultado.issueUrl = criada.html_url;
      log(`[notificar] issue aberta: ${criada.html_url}`);
    } catch (erro) {
      erros.push(`notificar: falha ao criar issue: ${mensagemDeErro(erro)}`);
    }
    return { notificacao: resultado, erros };
  };
}
