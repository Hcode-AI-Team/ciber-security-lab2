import type { Achado, NoCveWatch } from "../estado";
import { ehUrgente, maisGrave, ordenarPorSeveridade } from "../severidade";

/** Mesma vulnerabilidade pode chegar como GHSA (OSV) e CVE (NVD): o CVE vira a identidade canônica. */
export function idCanonico(achado: Pick<Achado, "id" | "aliases">): string {
  const candidatos = [achado.id, ...achado.aliases];
  return candidatos.find((c) => c.startsWith("CVE-")) ?? achado.id;
}

function mesclar(base: Achado, extra: Achado): Achado {
  const aliases = new Set<string>([
    ...base.aliases,
    ...extra.aliases,
    base.id,
    extra.id,
  ]);
  aliases.delete(idCanonico(base));
  return {
    ...base,
    id: idCanonico(base),
    aliases: [...aliases].sort(),
    severidade: maisGrave(base.severidade, extra.severidade),
    cvss: base.cvss ?? extra.cvss,
    // OSV sabe qual pacote do nosso lock está afetado; NVD só sabe a palavra-chave
    pacote:
      base.fonte === "osv"
        ? base.pacote
        : extra.fonte === "osv"
          ? extra.pacote
          : base.pacote,
    versao: base.versao ?? extra.versao,
    resumo:
      base.resumo.length >= extra.resumo.length ? base.resumo : extra.resumo,
    publicadoEm: base.publicadoEm ?? extra.publicadoEm,
  };
}

export function normalizarAchados(brutos: readonly Achado[]): Achado[] {
  const porId = new Map<string, Achado>();
  for (const achado of brutos) {
    const chave = idCanonico(achado);
    const existente = porId.get(chave);
    porId.set(
      chave,
      existente
        ? mesclar(existente, achado)
        : {
            ...achado,
            id: chave,
            aliases: achado.aliases
              .filter((a) => a !== chave)
              .concat(achado.id !== chave ? [achado.id] : [])
              .sort(),
          },
    );
  }
  return ordenarPorSeveridade([...porId.values()]);
}

export const noNormalizar: NoCveWatch = (estado) => {
  const achados = normalizarAchados(estado.achadosBrutos);
  return { achados, urgentes: achados.filter(ehUrgente) };
};
