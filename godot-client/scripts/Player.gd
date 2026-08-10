extends CharacterBody2D
## Representa o jogador local (ou remoto) na cena.
##
## Regra de ouro: este script NUNCA decide a posição final, o HP ou a energia.
## Ele só:
## 1. Captura input local e manda pro servidor (NetworkManager).
## 2. Lê o estado autoritativo que o servidor mandar de volta e aplica/exibe.
## Isso evita speed hacking, teleporte e "god mode" via cliente modificado.

@export var is_local_player := true
@export var interpolation_speed := 12.0

var _server_position := Vector2.ZERO
var _last_sent_input := Vector2.ZERO

var hp := 100.0
var max_hp := 100.0
var energy := 100.0
var max_energy := 100.0
var alive := true

var _hud: CanvasLayer
var _hp_label: Label
var _energy_label: Label

func _ready() -> void:
	if is_local_player:
		NetworkManager.player_state_updated.connect(_on_player_state_updated)
		NetworkManager.player_died.connect(_on_player_died)
		NetworkManager.player_respawned.connect(_on_player_respawned)
		_build_hud()

func _physics_process(delta: float) -> void:
	if is_local_player:
		var input_dir := Vector2(
			Input.get_axis("move_left", "move_right"),
			Input.get_axis("move_up", "move_down")
		)
		if input_dir != _last_sent_input:
			NetworkManager.send_move_input(input_dir.x, input_dir.y)
			_last_sent_input = input_dir

		if Input.is_action_just_pressed("dom_fogo"):
			NetworkManager.use_dom_fogo()

	global_position = global_position.lerp(_server_position, interpolation_speed * delta)

	# Feedback visual simples de morte — sem mecânica nenhuma no cliente,
	# só exibição do que o servidor já decidiu.
	modulate.a = 1.0 if alive else 0.3

func _on_player_state_updated(session_id: String, state: Dictionary) -> void:
	if session_id != NetworkManager.local_session_id:
		return
	_server_position = Vector2(state.get("x", 0.0), state.get("y", 0.0)) * 32.0 # 32px por unidade
	hp = state.get("hp", hp)
	max_hp = state.get("maxHp", max_hp)
	energy = state.get("energy", energy)
	max_energy = state.get("maxEnergy", max_energy)
	alive = state.get("alive", alive)
	_update_hud()

func _on_player_died(session_id: String, _killer_id: String) -> void:
	if session_id != NetworkManager.local_session_id:
		return
	# Espaço pra som/partícula de morte depois.
	pass

func _on_player_respawned(session_id: String) -> void:
	if session_id != NetworkManager.local_session_id:
		return
	# Espaço pra som/partícula de respawn depois.
	pass

func _build_hud() -> void:
	_hud = CanvasLayer.new()
	add_child(_hud)

	var box := VBoxContainer.new()
	box.position = Vector2(16, 16)
	_hud.add_child(box)

	_hp_label = Label.new()
	_energy_label = Label.new()
	box.add_child(_hp_label)
	box.add_child(_energy_label)
	_update_hud()

func _update_hud() -> void:
	if _hp_label == null:
		return
	_hp_label.text = "HP: %d / %d" % [int(hp), int(max_hp)]
	_energy_label.text = "Energia: %d / %d" % [int(energy), int(max_energy)]