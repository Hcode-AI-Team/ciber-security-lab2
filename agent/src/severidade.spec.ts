import {
  classificarPorCvss,
  classificarPorRotulo,
  classificarSeveridade,
  ehUrgente,
  maisGrave,
  ordenarPorSeveridade,
} from "./severidade";

describe("severidade", () => {
  describe("classificarPorCvss", () => {
    it.each([
      [10, "CRITICA"],
      [9, "CRITICA"],
      [8.9, "ALTA"],
      [7, "ALTA"],
      [6.9, "MEDIA"],
      [4, "MEDIA"],
      [3.9, "BAIXA"],
      [0.1, "BAIXA"],
    ])("cvss %p → %s", (score, esperado) => {
      expect(classificarPorCvss(score)).toBe(esperado);
    });

    it("zero, negativo ou NaN → DESCONHECIDA", () => {
      expect(classificarPorCvss(0)).toBe("DESCONHECIDA");
      expect(classificarPorCvss(-1)).toBe("DESCONHECIDA");
      expect(classificarPorCvss(Number.NaN)).toBe("DESCONHECIDA");
    });
  });

  describe("classificarPorRotulo", () => {
    it("aceita rótulos do GHSA/OSV e do NVD, sem distinguir caixa", () => {
      expect(classificarPorRotulo("CRITICAL")).toBe("CRITICA");
      expect(classificarPorRotulo("high")).toBe("ALTA");
      expect(classificarPorRotulo("Moderate")).toBe("MEDIA");
      expect(classificarPorRotulo("MEDIUM")).toBe("MEDIA");
      expect(classificarPorRotulo(" low ")).toBe("BAIXA");
    });

    it("rótulo ausente ou desconhecido → DESCONHECIDA", () => {
      expect(classificarPorRotulo(undefined)).toBe("DESCONHECIDA");
      expect(classificarPorRotulo("whatever")).toBe("DESCONHECIDA");
    });
  });

  describe("classificarSeveridade", () => {
    it("prefere o rótulo da fonte quando existe", () => {
      expect(classificarSeveridade({ rotulo: "LOW", cvss: 9.8 })).toBe("BAIXA");
    });

    it("usa o CVSS quando o rótulo não resolve", () => {
      expect(classificarSeveridade({ rotulo: "xpto", cvss: 9.8 })).toBe(
        "CRITICA",
      );
      expect(classificarSeveridade({ cvss: 5 })).toBe("MEDIA");
    });

    it("sem nada → DESCONHECIDA", () => {
      expect(classificarSeveridade({})).toBe("DESCONHECIDA");
    });
  });

  describe("ehUrgente", () => {
    it("só CRITICA e ALTA são urgentes", () => {
      expect(ehUrgente({ severidade: "CRITICA" })).toBe(true);
      expect(ehUrgente({ severidade: "ALTA" })).toBe(true);
      expect(ehUrgente({ severidade: "MEDIA" })).toBe(false);
      expect(ehUrgente({ severidade: "BAIXA" })).toBe(false);
      expect(ehUrgente({ severidade: "DESCONHECIDA" })).toBe(false);
    });
  });

  it("maisGrave escolhe a pior das duas", () => {
    expect(maisGrave("MEDIA", "CRITICA")).toBe("CRITICA");
    expect(maisGrave("ALTA", "BAIXA")).toBe("ALTA");
    expect(maisGrave("DESCONHECIDA", "BAIXA")).toBe("BAIXA");
  });

  it("ordenarPorSeveridade põe a mais grave primeiro e desempata por id", () => {
    const ordenado = ordenarPorSeveridade([
      { id: "CVE-2", severidade: "BAIXA" },
      { id: "CVE-9", severidade: "CRITICA" },
      { id: "CVE-1", severidade: "CRITICA" },
      { id: "CVE-5", severidade: "ALTA" },
    ]);
    expect(ordenado.map((a) => a.id)).toEqual([
      "CVE-1",
      "CVE-9",
      "CVE-5",
      "CVE-2",
    ]);
  });
});
