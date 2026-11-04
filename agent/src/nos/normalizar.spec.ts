import type { Achado } from "../estado";
import { estadoInicial } from "../estado";
import { idCanonico, noNormalizar, normalizarAchados } from "./normalizar";

const base = (parcial: Partial<Achado> & Pick<Achado, "id">): Achado => ({
  aliases: [],
  fonte: "osv",
  severidade: "MEDIA",
  resumo: "r",
  url: "u",
  ...parcial,
});

describe("idCanonico", () => {
  it("prefere o CVE entre id e aliases", () => {
    expect(idCanonico({ id: "GHSA-abcd", aliases: ["CVE-2026-0001"] })).toBe(
      "CVE-2026-0001",
    );
    expect(idCanonico({ id: "CVE-2026-0002", aliases: ["GHSA-x"] })).toBe(
      "CVE-2026-0002",
    );
  });

  it("sem CVE mantém o id original", () => {
    expect(idCanonico({ id: "GHSA-only", aliases: [] })).toBe("GHSA-only");
  });
});

describe("normalizarAchados", () => {
  it("funde GHSA (OSV) e CVE (NVD) da mesma vulnerabilidade, mantendo a pior severidade e o pacote do OSV", () => {
    const resultado = normalizarAchados([
      base({
        id: "CVE-2026-0001",
        fonte: "nvd",
        pacote: "NestJS",
        severidade: "CRITICA",
        cvss: 9.8,
        resumo: "curto",
      }),
      base({
        id: "GHSA-abcd",
        aliases: ["CVE-2026-0001"],
        fonte: "osv",
        pacote: "@nestjs/core",
        versao: "11.0.0",
        severidade: "ALTA",
        resumo: "descrição mais longa",
      }),
    ]);
    expect(resultado).toHaveLength(1);
    const unico = resultado[0];
    expect(unico?.id).toBe("CVE-2026-0001");
    expect(unico?.aliases).toEqual(["GHSA-abcd"]);
    expect(unico?.severidade).toBe("CRITICA");
    expect(unico?.cvss).toBe(9.8);
    expect(unico?.pacote).toBe("@nestjs/core");
    expect(unico?.versao).toBe("11.0.0");
    expect(unico?.resumo).toBe("descrição mais longa");
  });

  it("não funde vulnerabilidades distintas e ordena pela severidade", () => {
    const resultado = normalizarAchados([
      base({ id: "GHSA-1", severidade: "BAIXA" }),
      base({ id: "CVE-2026-9", severidade: "ALTA" }),
      base({ id: "GHSA-2", aliases: ["CVE-2026-3"], severidade: "CRITICA" }),
    ]);
    expect(resultado.map((a) => a.id)).toEqual([
      "CVE-2026-3",
      "CVE-2026-9",
      "GHSA-1",
    ]);
  });

  it("lista vazia → lista vazia", () => {
    expect(normalizarAchados([])).toEqual([]);
  });
});

describe("noNormalizar", () => {
  it("separa os urgentes (ALTA/CRITICA) dos demais", async () => {
    const estado = estadoInicial({
      achadosBrutos: [
        base({ id: "CVE-1", severidade: "CRITICA" }),
        base({ id: "CVE-2", severidade: "MEDIA" }),
        base({ id: "CVE-3", severidade: "ALTA" }),
      ],
    });
    const atualizacao = await noNormalizar(estado);
    expect(atualizacao.achados?.map((a) => a.id)).toEqual([
      "CVE-1",
      "CVE-3",
      "CVE-2",
    ]);
    expect(atualizacao.urgentes?.map((a) => a.id)).toEqual(["CVE-1", "CVE-3"]);
  });
});
