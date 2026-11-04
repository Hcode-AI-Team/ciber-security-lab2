import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Dependencia, NoCveWatch } from "../estado";

export const LOCKFILES_PADRAO = [
  "backend/package-lock.json",
  "frontend/package-lock.json",
];

interface EntradaLock {
  version?: string;
  dev?: boolean;
  link?: boolean;
}

interface PackageLock {
  lockfileVersion?: number;
  packages?: Record<string, EntradaLock>;
}

function ehPackageLock(valor: unknown): valor is PackageLock {
  return typeof valor === "object" && valor !== null && "packages" in valor;
}

/** "node_modules/a/node_modules/@x/b" → "@x/b" */
export function nomeDoCaminho(caminho: string): string | null {
  const marcador = "node_modules/";
  const indice = caminho.lastIndexOf(marcador);
  if (indice < 0) return null;
  const nome = caminho.slice(indice + marcador.length);
  return nome.length > 0 ? nome : null;
}

export function extrairDependencias(
  conteudo: string,
  origem: string,
): Dependencia[] {
  const json: unknown = JSON.parse(conteudo);
  if (!ehPackageLock(json) || !json.packages) {
    throw new Error(
      `${origem}: package-lock sem "packages" (lockfileVersion >= 2 é obrigatório)`,
    );
  }

  const vistos = new Set<string>();
  const resultado: Dependencia[] = [];
  for (const [caminho, entrada] of Object.entries(json.packages)) {
    if (caminho === "" || entrada.link === true || !entrada.version) continue;
    const nome = nomeDoCaminho(caminho);
    if (!nome) continue;
    const chave = `${nome}@${entrada.version}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    resultado.push({
      nome,
      versao: entrada.version,
      origem,
      dev: entrada.dev === true,
    });
  }
  return resultado;
}

export function criarNoColetarDependencias(
  lockfiles: string[] = LOCKFILES_PADRAO,
): NoCveWatch {
  return async (estado) => {
    const dependencias: Dependencia[] = [];
    const erros: string[] = [];
    for (const relativo of lockfiles) {
      const caminho = join(estado.raizRepo, relativo);
      try {
        const conteudo = await readFile(caminho, "utf8");
        dependencias.push(...extrairDependencias(conteudo, relativo));
      } catch (erro) {
        erros.push(
          `coletarDependencias: ${relativo}: ${erro instanceof Error ? erro.message : String(erro)}`,
        );
      }
    }
    return { dependencias, erros };
  };
}
