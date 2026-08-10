# Estrutura e decisões de arquitetura

## Por que o cliente nunca calcula posição/dano final
Todo o design de segurança do documento original (seção 3) parte de um
princípio: **servidor autoritativo**. Isso já está refletido no esqueleto:

- `IgnaraRoom.js` roda um `_fixedTick` a 20x/s que é a ÚNICA fonte de verdade
  de posição, HP e energia.
- O cliente (`Player.gd`) só manda `move_input` (direção) e `use_dom_fogo`
  (intenção) — nunca manda "estou na posição X,Y" ou "causei N de dano".
- `Player.gd` faz interpolação visual (`lerp`) até a posição que o servidor
  confirmou, pra não parecer travado, mas sem confiar em nada calculado
  localmente.

Isso é o que evita o problema clássico de "editei a memória do jogo pra andar
mais rápido" ou "mandei um pacote dizendo que matei o boss".

## Por que WebSocket puro em vez de Colyseus
A primeira versão do esqueleto usava Colyseus. Na prática, o SDK oficial pra
Godot 4 ainda é experimental (GDExtension baixado manualmente do GitHub, sem
distribuição estável na Asset Library) — trocar por `WebSocketPeer` nativo do
Godot + `ws` no Node remove essa dependência frágil sem abrir mão de nada
essencial: o servidor continua sendo a única fonte de verdade, só que fala
JSON simples (`{ type: "...", ... }`) em vez do protocolo binário do Colyseus.
Se o projeto crescer e precisar de matchmaking mais sofisticado, dá pra
reavaliar o Colyseus (ou Nakama) depois — não é uma decisão definitiva.

## Por que uma Room por ilha
No MVP só existe `IgnaraRoom`. Quando Maren/Terrunha/Zéfira entrarem (Fase 2),
a ideia é uma classe de room por ilha, roteada pelo path/porta da conexão, já
que cada ilha tem Dom e regras próprias. Lógica compartilhada (movimento, HP)
pode subir pra uma classe base depois, sem forçar isso agora.

## Por que Supabase só guarda estado "frio"
`quest_progress`, `inventory_items` e o perfil (`profiles`) são persistidos
pelo servidor de jogo (com a `service_role` key, que ignora RLS) — nunca
diretamente pelo cliente. O cliente só lê os próprios dados via Supabase Auth
+ RLS (políticas de `select` já estão no schema). Isso seria o próximo passo
depois do esqueleto: plugar `IgnaraRoom.onJoin`/`onLeave` no Supabase pra
carregar e salvar o progresso real, em vez do placeholder atual (`hp = 100`
sempre, começando do zero).

## O que falta pra sair do "esqueleto" pro MVP jogável
Ver `docs/ROADMAP.md` — é a checklist com o que ainda não está implementado
(diálogo do Tomrik, sistema de quests, drops de cristal, boss do Bragmar).
