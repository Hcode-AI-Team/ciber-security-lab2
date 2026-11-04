import {
  ReducedValue,
  StateSchema,
  type LangGraphRunnableConfig,
} from "@langchain/langgraph";
import * as z from "zod";

export const SeveridadeSchema = z.enum([
  "CRITICA",
  "ALTA",
  "MEDIA",
  "BAIXA",
  "DESCONHECIDA",
]);
export type Severidade = z.infer<typeof SeveridadeSchema>;

export const FonteSchema = z.enum(["osv", "nvd"]);
export type Fonte = z.infer<typeof FonteSchema>;

export const DependenciaSchema = z.object({
  nome: z.string(),
  versao: z.string(),
  origem: z.string(),
  dev: z.boolean(),
});
export type Dependencia = z.infer<typeof DependenciaSchema>;

export const AchadoSchema = z.object({
  id: z.string(),
  aliases: z.array(z.string()),
  fonte: FonteSchema,
  pacote: z.string().optional(),
  versao: z.string().optional(),
  severidade: SeveridadeSchema,
  cvss: z.number().optional(),
  resumo: z.string(),
  url: z.string(),
  publicadoEm: z.string().optional(),
});
export type Achado = z.infer<typeof AchadoSchema>;

export const TriagemSchema = z.object({
  resumo: z.string(),
  prioridades: z.array(
    z.object({
      id: z.string(),
      acao: z.string(),
      justificativa: z.string(),
    }),
  ),
  possiveisFalsosPositivos: z.array(z.string()),
});
export type Triagem = z.infer<typeof TriagemSchema>;

export const ResultadoNotificacaoSchema = z.object({
  issueUrl: z.string().nullable(),
  novos: z.array(z.string()),
  jaConhecidos: z.array(z.string()),
  dryRun: z.boolean(),
});
export type ResultadoNotificacao = z.infer<typeof ResultadoNotificacaoSchema>;

const concatenar = <T>(atual: T[], novo: T[]): T[] => atual.concat(novo);

export const KEYWORDS_NVD_PADRAO = [
  "NestJS",
  "TypeORM",
  "Angular",
  "Node.js",
  "TOTVS",
];

export const EstadoCveWatch = new StateSchema({
  // --- configuração da execução (entrada) ---
  modo: z.enum(["local", "ci"]).default("local"),
  dryRun: z.boolean().default(true),
  temLLM: z.boolean().default(false),
  diasNVD: z.number().int().positive().max(120).default(7),
  keywordsNVD: z.array(z.string()).default(() => KEYWORDS_NVD_PADRAO),
  raizRepo: z.string().default("."),

  // --- produzido pelos nós ---
  dependencias: z.array(DependenciaSchema).default(() => []),
  // OSV e NVD rodam em paralelo; o reducer junta o que cada um achou
  achadosBrutos: new ReducedValue(
    z.array(AchadoSchema).default(() => []),
    {
      reducer: concatenar,
    },
  ),
  achados: z.array(AchadoSchema).default(() => []),
  urgentes: z.array(AchadoSchema).default(() => []),
  triagem: TriagemSchema.nullable().default(null),
  aprovado: z.boolean().nullable().default(null),
  notificacao: ResultadoNotificacaoSchema.nullable().default(null),
  erros: new ReducedValue(
    z.array(z.string()).default(() => []),
    { reducer: concatenar },
  ),
});

export type Estado = typeof EstadoCveWatch.State;
export type AtualizacaoEstado = typeof EstadoCveWatch.Update;

/** Um nó é uma função: recebe o estado, devolve só o que mudou. */
export type NoCveWatch = (
  estado: Estado,
  config?: LangGraphRunnableConfig,
) => Promise<AtualizacaoEstado> | AtualizacaoEstado;

/** Estado completo com os defaults preenchidos — útil em testes e na CLI. */
export function estadoInicial(parcial: Partial<Estado> = {}): Estado {
  return {
    modo: "local",
    dryRun: true,
    temLLM: false,
    diasNVD: 7,
    keywordsNVD: [...KEYWORDS_NVD_PADRAO],
    raizRepo: ".",
    dependencias: [],
    achadosBrutos: [],
    achados: [],
    urgentes: [],
    triagem: null,
    aprovado: null,
    notificacao: null,
    erros: [],
    ...parcial,
  };
}
