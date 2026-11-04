import { ehObjeto, obterJson, type FetchLike } from './http';

export interface IssueGitHub {
  number: number;
  state: string;
  title: string;
  body: string | null;
  html_url: string;
}

export interface NovaIssue {
  titulo: string;
  corpo: string;
  labels: string[];
  assignees: string[];
}

export interface ClienteGitHub {
  listarIssuesComLabel(label: string): Promise<IssueGitHub[]>;
  criarIssue(issue: NovaIssue): Promise<IssueGitHub>;
}

function ehIssue(dado: unknown): dado is IssueGitHub {
  return ehObjeto(dado) && typeof dado['number'] === 'number' && typeof dado['html_url'] === 'string';
}

function ehListaDeIssues(dado: unknown): dado is IssueGitHub[] {
  return Array.isArray(dado) && dado.every(ehIssue);
}

export function criarClienteGitHub(opcoes: { token: string; repo: string; fetchImpl?: FetchLike }): ClienteGitHub {
  const fetchImpl = opcoes.fetchImpl ?? fetch;
  const base = `https://api.github.com/repos/${opcoes.repo}`;
  const headers = {
    authorization: `Bearer ${opcoes.token}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'combio-cve-watch',
  };

  return {
    async listarIssuesComLabel(label) {
      const todas: IssueGitHub[] = [];
      for (let pagina = 1; pagina <= 5; pagina++) {
        const params = new URLSearchParams({ state: 'all', labels: label, per_page: '100', page: String(pagina) });
        const lote = await obterJson(fetchImpl, `${base}/issues?${params}`, { headers }, ehListaDeIssues);
        todas.push(...lote);
        if (lote.length < 100) break;
      }
      return todas;
    },

    async criarIssue(issue) {
      return obterJson(
        fetchImpl,
        `${base}/issues`,
        {
          method: 'POST',
          headers: { ...headers, 'content-type': 'application/json' },
          body: JSON.stringify({ title: issue.titulo, body: issue.corpo, labels: issue.labels, assignees: issue.assignees }),
        },
        ehIssue,
      );
    },
  };
}
