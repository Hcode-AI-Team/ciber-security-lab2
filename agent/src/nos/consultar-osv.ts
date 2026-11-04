import type { Achado, Dependencia, NoCveWatch } from "../estado";
import {
  ehObjeto,
  mapearComLimite,
  mensagemDeErro,
  obterJson,
  type FetchLike,
} from "../http";
import { classificarSeveridade } from "../severidade";

const OSV_API = "https://api.osv.dev/v1";
const TAMANHO_LOTE = 1000; // limite do querybatch
const CONCORRENCIA_DETALHES = 6;

interface RespostaQueryBatch {
  results: Array<{ vulns?: Array<{ id: string }> }>;
}

interface VulnOSV {
  id: string;
  aliases?: string[];
  summary?: string;
  details?: string;
  published?: string;
  database_specific?: { severity?: string };
  affected?: Array<{
    package?: { name?: string; ecosystem?: string };
    ecosystem_specific?: { severity?: string };
  }>;
}

function ehRespostaQueryBatch(dado: unknown): dado is RespostaQueryBatch {
  return ehObjeto(dado) && Array.isArray(dado["results"]);
}

function ehVulnOSV(dado: unknown): dado is VulnOSV {
  return ehObjeto(dado) && typeof dado["id"] === "string";
}

function rotuloDeSeveridade(vuln: VulnOSV): string | undefined {
  return (
    vuln.database_specific?.severity ??
    vuln.affected?.find((a) => a.ecosystem_specific?.severity)
      ?.ecosystem_specific?.severity
  );
}

export function paraAchado(
  vuln: VulnOSV,
  dependencia: Dependencia | undefined,
): Achado {
  const resumo = vuln.summary ?? vuln.details?.split("\n")[0] ?? "(sem resumo)";
  return {
    id: vuln.id,
    aliases: vuln.aliases ?? [],
    fonte: "osv",
    pacote: dependencia?.nome ?? vuln.affected?.[0]?.package?.name,
    versao: dependencia?.versao,
    severidade: classificarSeveridade({ rotulo: rotuloDeSeveridade(vuln) }),
    resumo: resumo.slice(0, 300),
    url: `https://osv.dev/vulnerability/${vuln.id}`,
    publicadoEm: vuln.published,
  };
}

export async function consultarOSV(
  dependencias: readonly Dependencia[],
  fetchImpl: FetchLike,
): Promise<{ achados: Achado[]; erros: string[] }> {
  const erros: string[] = [];
  const vulnPorId = new Map<string, Dependencia>();

  for (let i = 0; i < dependencias.length; i += TAMANHO_LOTE) {
    const lote = dependencias.slice(i, i + TAMANHO_LOTE);
    try {
      const resposta = await obterJson(
        fetchImpl,
        `${OSV_API}/querybatch`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            queries: lote.map((d) => ({
              package: { name: d.nome, ecosystem: "npm" },
              version: d.versao,
            })),
          }),
        },
        ehRespostaQueryBatch,
      );
      resposta.results.forEach((resultado, indice) => {
        const dependencia = lote[indice];
        for (const vuln of resultado.vulns ?? []) {
          if (dependencia && !vulnPorId.has(vuln.id))
            vulnPorId.set(vuln.id, dependencia);
        }
      });
    } catch (erro) {
      erros.push(
        `consultarOSV: lote ${i / TAMANHO_LOTE + 1}: ${mensagemDeErro(erro)}`,
      );
    }
  }

  const achados = await mapearComLimite(
    [...vulnPorId.entries()],
    CONCORRENCIA_DETALHES,
    async ([id, dep]) => {
      try {
        const vuln = await obterJson(
          fetchImpl,
          `${OSV_API}/vulns/${encodeURIComponent(id)}`,
          {},
          ehVulnOSV,
        );
        return paraAchado(vuln, dep);
      } catch (erro) {
        erros.push(`consultarOSV: detalhe ${id}: ${mensagemDeErro(erro)}`);
        return null;
      }
    },
  );

  return { achados: achados.filter((a): a is Achado => a !== null), erros };
}

export function criarNoConsultarOSV(fetchImpl: FetchLike = fetch): NoCveWatch {
  return async (estado) => {
    const { achados, erros } = await consultarOSV(
      estado.dependencias,
      fetchImpl,
    );
    return { achadosBrutos: achados, erros };
  };
}
