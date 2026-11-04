# Encontro 5 — Lab: validando os hooks e o subagente de segurança

> **Objetivo:** provar que as camadas de proteção do repositório estão ativas:
>
> 1. **Hook do agente (`preToolUse`):** impede a IA de escrever segredos.
> 2. **Hook local do git (`pre-commit`):** bloqueia o commit de código vulnerável.
> 3. **Gate remoto (CI `security-scan` + subagente `security-reviewer`):** reprova o PR.
>
> ⚠️ Todos os segredos deste lab são **falsos**. Use **sempre** uma branch de teste e **nunca** faça merge dela.

---

## Parte 0 — Pré-requisitos

```powershell
node --version        # >= 20
gh auth status        # autenticado no GitHub
git remote -v         # aponta para o repositório remoto
git switch main; git pull
```

---

## Parte 1 — O hook do agente está funcionando (e não quebrado)?

Um hook `preToolUse` **com erro** bloqueia **tudo**, até leituras (`Denied by preToolUse hook ... (hook errored)`). Isso não prova nada: o hook precisa **decidir**, e não falhar.

### 1.1 Localize a configuração

- `.claude/settings.json` (Claude Code) ou `.github/hooks/*.json` (Copilot)
- Scripts: `aula/kit/hooks/protege-segredos.mjs`, `lint-arquivo.mjs`

### 1.2 Rode o hook manualmente

```powershell
# Leitura -> deve PERMITIR (exit 0)
'{"tool_name":"view","tool_input":{"path":"README.md"}}' | node aula/kit/hooks/protege-segredos.mjs
$LASTEXITCODE

# Escrita de segredo -> deve BLOQUEAR (exit diferente de 0)
'{"tool_name":"create","tool_input":{"path":"x.ts","file_text":"const k = \"AKIAIOSFODNN7EXAMPLE\";"}}' | node aula/kit/hooks/protege-segredos.mjs
$LASTEXITCODE

# Bateria de ataques do kit
node aula/kit/hooks/testar-ataques.mjs
```

### 1.3 Causas comuns de "hook errored"

- Caminho relativo do script (ele precisa funcionar a partir da raiz do repositório)
- `node` fora do PATH do VS Code
- Formato do JSON de entrada diferente (o do Claude Code é diferente do do Copilot)
- Exceção ao ler o stdin ou ao fazer o parse do JSON

✅ **Critério:** a leitura passa e a escrita do segredo é bloqueada.

---

## Parte 2 — Criar os arquivos vulneráveis

```powershell
git switch -c teste/gate-seguranca
New-Item -ItemType Directory -Force backend/src/teste-seguranca
```

Crie os três arquivos **manualmente** no editor. Não peça ao agente: isso é testado na Parte 3.

### Arquivo 1: `backend/src/teste-seguranca/segredo.ts` (credencial hardcoded)

```ts
export const AWS_ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE";
export const AWS_SECRET_ACCESS_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
export const DB_URL = "mysql://root:SenhaFalsa123@10.0.0.5:3306/manutencao";
```

### Arquivo 2: `backend/src/teste-seguranca/sql-injection.ts` (SQL injection)

```ts
import { DataSource } from "typeorm";

export async function buscarOrdens(
  ds: DataSource,
  upv: string,
): Promise<unknown> {
  return ds.query(`SELECT * FROM ordem_manutencao WHERE upvId = '${upv}'`);
}
```

### Arquivo 3: `backend/src/teste-seguranca/comando.ts` (command injection + path traversal)

```ts
import { execSync } from "child_process";
import { readFileSync } from "fs";

export function lerLog(arquivo: string): string {
  execSync(`cat logs-upv/${arquivo}`);
  return readFileSync(`logs-upv/${arquivo}`, "utf8");
}
```

---

## Parte 3 — Camada 1: hook do agente

No chat, peça:

> Crie `backend/src/teste-seguranca/segredo2.ts` com `export const KEY = 'AKIAIOSFODNN7EXAMPLE';`

✅ Esperado: o hook nega **só essa escrita**. Em seguida peça "leia o README.md": ✅ deve funcionar.
❌ Se as duas forem negadas, o hook está com erro (volte à Parte 1). ❌ Se as duas passarem, o hook não está ativo.

---

## Parte 4 — Camada 2: hook local do git

```powershell
git add backend/src/teste-seguranca/
git commit -m "teste: arquivos vulneraveis para validar gates"
$LASTEXITCODE
```

✅ Esperado: o commit é **bloqueado** (exit diferente de 0).

❌ Se passou, verifique a instalação:

```powershell
git config core.hooksPath
Get-ChildItem -Force .git/hooks | Where-Object { $_.Name -notlike '*.sample' }
```

---

## Parte 5 — Camada 3: CI + subagente de segurança

Pule o hook local **só nesta branch de teste**, para provar que o gate remoto também pega:

```powershell
git commit --no-verify -m "teste: arquivos vulneraveis para validar gates"
git push -u origin teste/gate-seguranca
gh pr create --draft --title "TESTE: gate de seguranca" --body "Validacao dos hooks e do security-reviewer. NAO MERGEAR."
gh pr checks --watch
```

✅ Esperado: o `security-scan` **falha** e o PR fica bloqueado.

### Rodando o subagente

> @security-reviewer revise o diff da branch `teste/gate-seguranca` contra `main`

| Arquivo            | Vulnerabilidade esperada           | Severidade            |
| ------------------ | ---------------------------------- | --------------------- |
| `segredo.ts`       | Credenciais hardcoded              | 🔴 CRITICAL           |
| `sql-injection.ts` | SQL injection por interpolação     | 🔴 CRITICAL / 🟠 HIGH |
| `comando.ts`       | Command injection + path traversal | 🔴 CRITICAL / 🟠 HIGH |

✅ Esperado: ele aponta os três e entrega Markdown + JSON. Ele **não aprova e não corrige**.

---

## Parte 6 — Checklist de evidências

- [ ] Hook do agente: a leitura passa e a escrita do segredo é negada
- [ ] `testar-ataques.mjs` passou
- [ ] `git commit` bloqueado pelo hook local
- [ ] `security-scan` falhou no PR
- [ ] `security-reviewer` apontou os 3 arquivos

---

## Parte 7 — Limpeza (obrigatória)

```powershell
gh pr close --delete-branch
git switch main
git branch -D teste/gate-seguranca
Remove-Item -Recurse -Force backend/src/teste-seguranca -ErrorAction SilentlyContinue
```

> 💡 Mesmo um segredo falso no histórico dispara alertas de secret scanning. Uma branch de teste **nunca** entra na `main`.
