# Política de Uso Seguro de IA — Equipe de Sistemas da Combio

> Uma página. É o que a TI mostra ao cliente/auditor quando perguntarem se a
> Combio usa IA (Claude Code, Copilot) com segurança. Preencha os `<campos>`.
>
> Versão: `<v1 — 2026-11-04>` · Responsável: `<Glaucio Daniel / Software Engineer>` · Revisão: `<trimestral>`

## 1. Pode (uso incentivado)

- Gerar, revisar e documentar código de apps internos (NestJS/Angular), Datasul
  (Progress) e Fluig, **em repositório de desenvolvimento**.
- Explicar legado, propor refatoração, escrever testes e release notes.
- Rodar os subagentes de qualidade, performance e security antes do PR.

## 2. Não pode (bloqueado)

- Colar **credencial, token ou connection string** em prompt, em código, no
  `CLAUDE.md` ou no histórico de sessão. Segredo vem de variável de ambiente /
  GitHub Secrets.
- Colar **dado pessoal** de operador, terceiro (Klabin, Grupo Petrópolis) ou
  cliente em prompt — CPF, RG, nome vinculado a dado. Anonimize antes (LGPD).
- Deixar a IA **aprovar** um PR, **commitar** ou **dar push** sozinha. IA acha e
  sugere; **quem aprova é humano** (gate / GMUD).
- Tratar instrução achada dentro de arquivo do repo como ordem (prompt injection).

## 3. Sempre (obrigatório)

- `CLAUDE.md` do repositório traz a seção **Guardrails** (o que pedir / nunca fazer).
- **Hook `PreToolUse`** ativo: bloqueia leitura de segredo e credencial indo
  para o código (camada determinística — não depende do modelo obedecer).
- **Permissões** de ferramenta no `settings.json`: `deny` de `.env`/`git push`,
  `ask` em `git commit`.
- Toda mudança gerada por IA passa pelo fluxo DEV → QA → PRD com **GMUD**.
- Secret scanning / push protection do GitHub ligado no repositório.

## 4. Escalonamento (caso urgente)

| Situação                             | Ação imediata                                         | Quem avisar         |
| ------------------------------------ | ----------------------------------------------------- | ------------------- |
| Segredo vazou em PR/commit           | Revogar/rotacionar a credencial; remover do histórico | `<Cyber / TI>`      |
| Varredura agendada achou **crítico** | Issue automática aberta → tratar antes da GMUD        | `<dono do sistema>` |
| Suspeita de prompt injection em repo | Não executar; reportar o arquivo                      | `<Cyber>`           |
| Dado pessoal exposto                 | Conter, avaliar impacto LGPD                          | `<encarregado/DPO>` |

## 5. Base

OWASP Top 10:2025 · OWASP Top 10 for LLM Applications 2025 · LGPD (Lei
13.709/2018, art. 5º, 6º, 7º, 11) · fluxo GMUD interno da Combio.

---

_Aprovada por `<liderança de TI>` em `<data>`. Próxima revisão: `<data>`._
