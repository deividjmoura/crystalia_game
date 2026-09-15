extends Node2D
## Mundo de Ignara. Mantém o registro de quem está na sala:
## - o jogador local é o nó "LocalPlayer" da cena;
## - cada sessionId remoto vira um Player.tscn instanciado em código;
## - tudo é posicionado a partir do estado que o servidor envia.

const PX_PER_UNIT := 32.0
const PlayerScene := preload("res://scenes/Player.tscn")
const FireEffectScript := preload("res://scripts/FireEffect.gd")

var _players: Dictionary = {} # sessionId -> IgnaraPlayer
@onready var _local_player: IgnaraPlayer = $LocalPlayer

var _status_label: Label
var _demo_banner: Label

func _ready() -> void:
	_build_overlay()

	# Controles de toque (mobile): só VISÍVEIS em aparelhos com touchscreen.
	# Injetam as mesmas ações do Input Map do teclado (ver MobileControls.gd).
	var mobile_controls := preload("res://scripts/MobileControls.gd").new()
	add_child(mobile_controls)

	NetworkManager.player_state_updated.connect(_on_player_state)
	NetworkManager.player_left.connect(_on_player_left)
	NetworkManager.dom_fogo_cast.connect(_on_dom_fogo)
	NetworkManager.connected.connect(func() -> void: _set_status("CONECTADO — IGNARA", Color(0.4, 1.0, 0.6)))
	NetworkManager.disconnected.connect(func() -> void: _set_status("DESCONECTADO", Color(1.0, 0.5, 0.4)))
	NetworkManager.reconnect_attempt.connect(_on_reconnect_attempt)
	NetworkManager.connection_failed.connect(_enter_demo_mode)

	# TODO: nome real depois do login (Supabase Auth). No navegador dá pra
	# usar ?name=SeuNome na URL.
	NetworkManager.connect_to_ignara("Aventureiro de Teste")

func _on_player_state(session_id: String, state: Dictionary) -> void:
	if session_id == NetworkManager.local_session_id:
		if not _players.has(session_id):
			_players[session_id] = _local_player
			_local_player.configure(session_id, true)
		_local_player.apply_state(state)
		return

	if not _players.has(session_id):
		var remote: IgnaraPlayer = PlayerScene.instantiate()
		remote.is_local_player = false
		add_child(remote)
		remote.configure(session_id, false)
		_players[session_id] = remote

	_players[session_id].apply_state(state)

func _on_player_left(session_id: String) -> void:
	if not _players.has(session_id):
		return
	if session_id == NetworkManager.local_session_id:
		return
	var node: Node = _players[session_id]
	_players.erase(session_id)
	node.queue_free()

func _on_dom_fogo(session_id: String, x: float, y: float, range_units: float, _hits: Array) -> void:
	var fx := Node2D.new()
	fx.set_script(FireEffectScript)
	fx.set("radius_units", range_units)
	fx.position = Vector2(x, y) * PX_PER_UNIT
	add_child(fx)

func _enter_demo_mode() -> void:
	_set_status("MODO DEMO — servidor offline", Color(1.0, 0.75, 0.3))
	_demo_banner.visible = true
	if _local_player != null:
		_local_player.demo_mode = true

func _on_reconnect_attempt(attempt: int, max_attempts: int) -> void:
	_set_status("RECONECTANDO (%d/%d)..." % [attempt, max_attempts], Color(1.0, 0.8, 0.4))

# ------------------------------ UI simples ------------------------------

func _build_overlay() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)

	_status_label = Label.new()
	_status_label.text = "CONECTANDO..."
	_status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_status_label.add_theme_font_size_override("font_size", 16)
	_status_label.add_theme_color_override("font_color", Color(0.6, 1.0, 0.8))
	var status_panel := PanelContainer.new()
	status_panel.position = Vector2(900, 14)
	status_panel.custom_minimum_size = Vector2(360, 32)
	status_panel.add_child(_status_label)
	layer.add_child(status_panel)

	var help := Label.new()
	help.text = "WASD: mover   ·   ESPAÇO: Dom de Fogo"
	help.add_theme_font_size_override("font_size", 15)
	var help_panel := PanelContainer.new()
	help_panel.position = Vector2(16, 660)
	help_panel.add_child(help)
	layer.add_child(help_panel)

	_demo_banner = Label.new()
	_demo_banner.text = "⚠ SEM CONEXÃO COM O SERVIDOR — você vê apenas um DEMO local. Conecte com alguém para o multiplayer."
	_demo_banner.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_demo_banner.add_theme_font_size_override("font_size", 16)
	_demo_banner.add_theme_color_override("font_color", Color(1.0, 0.8, 0.4))
	var demo_panel := PanelContainer.new()
	demo_panel.position = Vector2(190, 60)
	demo_panel.custom_minimum_size = Vector2(900, 40)
	demo_panel.add_child(_demo_banner)
	demo_panel.visible = false
	layer.add_child(demo_panel)

func _set_status(text: String, color: Color) -> void:
	if _status_label:
		_status_label.text = text
		_status_label.add_theme_color_override("font_color", color)
