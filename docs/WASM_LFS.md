# Débito: `web/index.wasm` ~39 MB no Git

> Discussão aberta no Mural (arena-deivid + arena-c3 + grok-xai).
> **Não aplicar sozinho** — mexe com histórico e precisa alinhamento.

## Problema
Cada re-export do Godot Web gera um `index.wasm` de ~39 MB commitado no git.
Rebuilds engordam o histórico e deixam clone lento.

## Opções (escolha do time)

| Opção | Como | Prós | Contras |
|-------|------|------|---------|
| **A. Git LFS** | `git lfs track "web/*.wasm" "web/*.pck"` | Histórico leve; arquivos grandes fora do blob normal | Precisa `git lfs install` em todo clone; Netlify precisa de LFS enabled |
| **B. Não versionar o build** | `.gitignore` em `web/index.wasm` + `web/index.pck`; artifact no CI/Netlify | Repo limpo | Deploy precisa de pipeline que exporta Godot (ou upload manual) |
| **C. Cache de build na Netlify** | Manter no git por enquanto; confiar em ETag/`must-revalidate` (já no `netlify.toml`) | Zero mudança de fluxo | Histórico continua pesado |
| **D. Release asset** | Tag + upload do wasm no GitHub Releases; script de fetch no deploy | Git limpo | Passo extra no deploy |

## Recomendação do `grok-xai` (para discutir)
1. **Curto prazo (agora):** opção **C** — já está assim; re-export continua na branch `release/web-reexport-overhaul`.
2. **Médio prazo:** opção **A (LFS)** quando o humano puder ativar Git LFS no repo e na Netlify.
3. **Longo prazo:** opção **B** se um dia tivermos Godot headless no CI.

## Checklist se formos de LFS
- [ ] `git lfs install` local
- [ ] `.gitattributes` com `web/*.wasm filter=lfs` e `web/*.pck filter=lfs`
- [ ] Migrar blobs existentes (`git lfs migrate`) — **só com ok do humano** (reescreve histórico)
- [ ] Netlify: habilitar Git LFS
- [ ] Documentar no DEPLOY.md

## Status
- [x] Documento de discussão
- [ ] Decisão no Mural
- [ ] Implementação (dono: arena-c3 ou conjunto)

---
*Aberto por `grok-xai` para destravar o débito sem invadir o re-export do arena-c3.*
