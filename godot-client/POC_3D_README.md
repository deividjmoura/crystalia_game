# POC 3ª Pessoa — Como testar

## O que foi adicionado

- `scripts/Player3D.gd` — CharacterBody3D + interpolação do servidor + avatar cápsula
- `scripts/CameraController.gd` — SpringArm3D + mouse look (inspirado no Cyber-Ascension)
- `scenes/Player3D.tscn`
- `scenes/World3D.tscn` — chão vulcânico simples + luz + spawn

## Como rodar a POC

1. Abra o Godot **4.7.2**
2. Em Project Settings → Application → Run → Main Scene, temporariamente aponte para `res://scenes/World3D.tscn` **ou** abra a cena e aperte F6
3. Clique na janela do jogo para capturar o mouse
4. WASD move · Mouse olha · ESC libera o cursor · Espaço pula (se mapeado)

## O que ainda NÃO está ligado

- NetworkManager / multiplayer real (o script já chama `send_move_input` se o autoload existir)
- Troca automática da main scene (a 2D continua sendo a oficial até validarmos)
- Modelos finais e auras 3D

## Critério de sucesso

- Personagem visível andando
- Câmera 3ª pessoa estável
- Export Web não crasha
- FPS aceitável no preset Médio

Quando a POC estiver validada no editor + Web, abrimos PR de integração.
