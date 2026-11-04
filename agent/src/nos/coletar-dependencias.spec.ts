import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { estadoInicial } from "../estado";
import {
  criarNoColetarDependencias,
  extrairDependencias,
  nomeDoCaminho,
} from "./coletar-dependencias";

const LOCK_EXEMPLO = JSON.stringify({
  name: "exemplo",
  lockfileVersion: 3,
  packages: {
    "": { name: "exemplo", version: "1.0.0" },
    "node_modules/@nestjs/core": { version: "11.2.5" },
    "node_modules/typeorm": { version: "0.3.31" },
    "node_modules/jest": { version: "29.7.0", dev: true },
    "node_modules/typeorm/node_modules/tslib": { version: "2.8.1" },
    "node_modules/tslib": { version: "2.8.1" },
    "node_modules/meu-link": { link: true, resolved: "../meu-link" },
    "node_modules/sem-versao": {},
  },
});

describe("nomeDoCaminho", () => {
  it("extrai o nome do pacote inclusive aninhado e com escopo", () => {
    expect(nomeDoCaminho("node_modules/typeorm")).toBe("typeorm");
    expect(nomeDoCaminho("node_modules/a/node_modules/@x/b")).toBe("@x/b");
  });

  it("retorna null para raiz ou caminho sem node_modules", () => {
    expect(nomeDoCaminho("")).toBeNull();
    expect(nomeDoCaminho("packages/app")).toBeNull();
  });
});

describe("extrairDependencias", () => {
  it("lista name@version únicos, ignorando raiz, links e entradas sem versão", () => {
    const deps = extrairDependencias(LOCK_EXEMPLO, "backend/package-lock.json");
    expect(deps.map((d) => `${d.nome}@${d.versao}`)).toEqual([
      "@nestjs/core@11.2.5",
      "typeorm@0.3.31",
      "jest@29.7.0",
      "tslib@2.8.1",
    ]);
  });

  it("marca dependências de desenvolvimento", () => {
    const deps = extrairDependencias(LOCK_EXEMPLO, "x");
    expect(deps.find((d) => d.nome === "jest")?.dev).toBe(true);
    expect(deps.find((d) => d.nome === "typeorm")?.dev).toBe(false);
  });

  it('rejeita lockfile v1 (sem "packages")', () => {
    expect(() =>
      extrairDependencias(JSON.stringify({ dependencies: {} }), "x"),
    ).toThrow(/lockfileVersion/);
  });
});

describe("criarNoColetarDependencias", () => {
  it("lê os lockfiles a partir de raizRepo e registra erro para arquivo ausente sem derrubar o grafo", async () => {
    const raiz = await mkdtemp(join(tmpdir(), "cve-watch-"));
    await writeFile(join(raiz, "lock-a.json"), LOCK_EXEMPLO);

    const no = criarNoColetarDependencias(["lock-a.json", "nao-existe.json"]);
    const estado = estadoInicial({ raizRepo: raiz });
    const atualizacao = await no(estado, {});

    expect(atualizacao).toBeDefined();
    const { dependencias, erros } = atualizacao as {
      dependencias: unknown[];
      erros: string[];
    };
    expect(dependencias).toHaveLength(4);
    expect(erros).toHaveLength(1);
    expect(erros[0]).toMatch(/nao-existe\.json/);
  });
});
