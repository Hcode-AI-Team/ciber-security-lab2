import type { Achado, NoCveWatch } from "../estado";
import {
  dormir,
  ehObjeto,
  mensagemDeErro,
  obterJson,
  type FetchLike,
} from "../http";
import { classificarSeveridade } from "../severidade";

const NVD_API = "https://services.nvd.nist.gov/rest/json/cves/2.0";
const RESULTADOS_POR_PAGINA = 200;
// Sem chave: 5 req / 30 s. Com chave: 50 req / 30 s.
const PAUSA_SEM_CHAVE_MS = 6500;
const PAUSA_COM_CHAVE_MS = 700;

interface MetricaCvss {
  cvssData?: { baseScore?: number; baseSeverity?: string };
  baseSeverity?: string;
}

interface CveNVD {
  cve: {
    id: string;
    published?: string;
    descriptions?: Array<{ lang: string; value: string }>;
    metrics?: {
      cvssMetricV40?: MetricaCvss[];
      cvssMetricV31?: MetricaCvss[];
      cvssMetricV30?: MetricaCvss[];
      cvssMetricV2?: MetricaCvss[];
    };
  };
}

interface RespostaNVD {
  vulnerabilities: CveNVD[];
  totalResults?: number;
}

function ehRespostaNVD(dado: unknown): dado is RespostaNVD {
  return ehObjeto(dado) && Array.isArray(dado["vulnerabilities"]);
}

function metricaPrincipal(cve: CveNVD["cve"]): MetricaCvss | undefined {
  const m = cve.metrics;
  return (
    m?.cvssMetricV40?.[0] ??
    m?.cvssMetricV31?.[0] ??
    m?.cvssMetricV30?.[0] ??
    m?.cvssMetricV2?.[0]
  );
}

export function paraAchado(item: CveNVD, keyword: string): Achado {
  const metrica = metricaPrincipal(item.cve);
  const descricao =
    item.cve.descriptions?.find((d) => d.lang === "en")?.value ??
    "(sem descrição)";
  return {
    id: item.cve.id,
    aliases: [],
    fonte: "nvd",
    pacote: keyword,
    severidade: classificarSeveridade({
      rotulo: metrica?.cvssData?.baseSeverity ?? metrica?.baseSeverity,
      cvss: metrica?.cvssData?.baseScore,
    }),
    cvss: metrica?.cvssData?.baseScore,
    resumo: descricao.slice(0, 300),
    url: `https://nvd.nist.gov/vuln/detail/${item.cve.id}`,
    publicadoEm: item.cve.published,
  };
}

/** NVD exige datas sem o sufixo Z: yyyy-MM-ddTHH:mm:ss.SSS */
export function formatarDataNVD(data: Date): string {
  return data.toISOString().replace("Z", "");
}

export interface OpcoesNVD {
  fetchImpl?: FetchLike;
  apiKey?: string;
  agora?: () => Date;
  pausar?: (ms: number) => Promise<void>;
}

export async function consultarNVD(
  keywords: readonly string[],
  dias: number,
  opcoes: OpcoesNVD = {},
): Promise<{ achados: Achado[]; erros: string[] }> {
  const fetchImpl = opcoes.fetchImpl ?? fetch;
  const pausar = opcoes.pausar ?? dormir;
  const agora = (opcoes.agora ?? (() => new Date()))();
  const inicio = new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000);
  const headers: Record<string, string> = opcoes.apiKey
    ? { apiKey: opcoes.apiKey }
    : {};
  const pausa = opcoes.apiKey ? PAUSA_COM_CHAVE_MS : PAUSA_SEM_CHAVE_MS;

  const achados: Achado[] = [];
  const erros: string[] = [];

  for (const [indice, keyword] of keywords.entries()) {
    if (indice > 0) await pausar(pausa);
    const params = new URLSearchParams({
      keywordSearch: keyword,
      pubStartDate: formatarDataNVD(inicio),
      pubEndDate: formatarDataNVD(agora),
      resultsPerPage: String(RESULTADOS_POR_PAGINA),
    });
    try {
      const resposta = await obterJson(
        fetchImpl,
        `${NVD_API}?${params}`,
        { headers },
        ehRespostaNVD,
      );
      achados.push(
        ...resposta.vulnerabilities.map((v) => paraAchado(v, keyword)),
      );
    } catch (erro) {
      erros.push(`consultarNVD: "${keyword}": ${mensagemDeErro(erro)}`);
    }
  }

  return { achados, erros };
}

export function criarNoConsultarNVD(opcoes: OpcoesNVD = {}): NoCveWatch {
  return async (estado) => {
    const { achados, erros } = await consultarNVD(
      estado.keywordsNVD,
      estado.diasNVD,
      opcoes,
    );
    return { achadosBrutos: achados, erros };
  };
}
