export type FetchLike = (
  entrada: string,
  init?: RequestInit,
) => Promise<Response>;

export const dormir = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

export async function obterJson<T>(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit = {},
  validar: (dado: unknown) => dado is T,
): Promise<T> {
  const resposta = await fetchImpl(url, init);
  if (!resposta.ok) {
    throw new Error(`HTTP ${resposta.status} em ${url}`);
  }
  const dado: unknown = await resposta.json();
  if (!validar(dado)) {
    throw new Error(`Resposta inesperada de ${url}`);
  }
  return dado;
}

/** Roda `tarefa` sobre cada item com no máximo `limite` em voo — gentileza com APIs públicas. */
export async function mapearComLimite<T, R>(
  itens: readonly T[],
  limite: number,
  tarefa: (item: T) => Promise<R>,
): Promise<R[]> {
  const resultados: R[] = new Array<R>(itens.length);
  let proximo = 0;
  const trabalhador = async (): Promise<void> => {
    while (proximo < itens.length) {
      const indice = proximo++;
      const item = itens[indice];
      if (item === undefined) continue;
      resultados[indice] = await tarefa(item);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limite, itens.length) }, trabalhador),
  );
  return resultados;
}

export function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

export function mensagemDeErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}
