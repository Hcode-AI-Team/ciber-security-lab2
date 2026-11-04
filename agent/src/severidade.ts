import type { Achado, Severidade } from "./estado";

const PESO: Record<Severidade, number> = {
  CRITICA: 4,
  ALTA: 3,
  MEDIA: 2,
  BAIXA: 1,
  DESCONHECIDA: 0,
};

const ROTULOS: Record<string, Severidade> = {
  CRITICAL: "CRITICA",
  HIGH: "ALTA",
  MODERATE: "MEDIA",
  MEDIUM: "MEDIA",
  LOW: "BAIXA",
};

export function classificarPorCvss(score: number): Severidade {
  if (!Number.isFinite(score) || score <= 0) return "DESCONHECIDA";
  if (score >= 9) return "CRITICA";
  if (score >= 7) return "ALTA";
  if (score >= 4) return "MEDIA";
  return "BAIXA";
}

export function classificarPorRotulo(rotulo: string | undefined): Severidade {
  if (!rotulo) return "DESCONHECIDA";
  return ROTULOS[rotulo.trim().toUpperCase()] ?? "DESCONHECIDA";
}

/** Rótulo da fonte prevalece; CVSS numérico é o fallback. */
export function classificarSeveridade(entrada: {
  cvss?: number;
  rotulo?: string;
}): Severidade {
  const porRotulo = classificarPorRotulo(entrada.rotulo);
  if (porRotulo !== "DESCONHECIDA") return porRotulo;
  return entrada.cvss === undefined
    ? "DESCONHECIDA"
    : classificarPorCvss(entrada.cvss);
}

export function maisGrave(a: Severidade, b: Severidade): Severidade {
  return PESO[a] >= PESO[b] ? a : b;
}

/** Regra determinística do alerta: só ALTA e CRITICA viram issue urgente. O LLM nunca decide isto. */
export function ehUrgente(achado: Pick<Achado, "severidade">): boolean {
  return achado.severidade === "CRITICA" || achado.severidade === "ALTA";
}

export function ordenarPorSeveridade<
  T extends Pick<Achado, "severidade" | "id">,
>(achados: T[]): T[] {
  return [...achados].sort(
    (a, b) =>
      PESO[b.severidade] - PESO[a.severidade] || a.id.localeCompare(b.id),
  );
}
