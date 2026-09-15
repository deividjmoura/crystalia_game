class_name IgnaraPlayer
extends CharacterBody2D
## Representa a Ignara do jogador local ou as dos outros.
##
## Regra de ouro: este script NUNCA decide posição/HP/dano finais em rede.
## Só captura input (local) e exibe o estado autoritativo do servidor.
## Existe ainda o MODO DEMO offline (servidor inacessível no navegador):
## movimento autoritativo do próprio cliente, claramente sinalizado na tela.

const PX_PER_UNIT := 32.0
const MOVE_SPEED_UNITS := 4.0
const ENERGY_REGEN := 5.0
const FOGO_RANGE := 2.6
const WORLD_HALF_W := 20.0
const WORLD_HALF_H := 11.0

@export var is_local_player: bool = true
@export var interpolation_speed: float = 14.0

var session_id: String = ""
var display_name: String = "?"
var demo_mode: bool = false

var _server_position := Vector2.ZERO
var _last_sent_input := Vector2.ZERO

var hp := 100.0
var max_hp := 100.0
var energy := 100.0
var max_energy := 100.0
var alive := true
var _flash := 0.0

var _sprite: ColorRect
var _name_label: Label
var _hud: CanvasLayer
var _hp_label: Label
var _energy_label: Label

func _ready() -> void:
	_sprite = $Sprite2D
	_name_label = Label.new()
	_name_label.position = Vector2(-40, -34)
	_name_label.custom_minimum_size = Vector2(80, 0)
	_name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_name_label.add_theme_font_size_override("font_size", 12)
	add_child(_name_label)

	if is_local_player:
		_build_hud()
	_apply_appearance()

func _physics_process(delta: float) -> void:
	if not is_local_player:
		global_position = global_position.lerp(_server_position, interpolation_speed * delta)
		_update_visual_state(delta)
		return

	var input_dir := Vector2(
		Input.get_axis("move_left", "move_right"),
		Input.get_axis("move_up", "move_down")
	)

	if demo_mode:
		# MODO DEMO offline: simulação puramente visual, sem valer nada em rede.
		global_position += input_dir * (MOVE_SPEED_UNITS * PX_PER_UNIT) * delta
		global_position.x = clamp(global_position.x, -WORLD_HALF_W * PX_PER_UNIT, WORLD_HALF_W * PX_PER_UNIT)
		global_position.y = clamp(global_position.y, -WORLD_HALF_H * PX_PER_UNIT, WORLD_HALF_H * PX_PER_UNIT)
		energy = min(max_energy, energy + ENERGY_REGEN * delta)
		if Input.is_action_just_pressed("dom_fogo"):
			_spawn_fire_effect()
		_update_hud()
		return

	if input_dir != _last_sent_input:
		NetworkManager.send_move_input(input_dir.x, input_dir.y)
		_last_sent_input = input_dir

	if Input.is_action_just_pressed("dom_fogo"):
		NetworkManager.use_dom_fogo()

	global_position = global_position.lerp(_server_position, interpolation_speed * delta)
	_update_visual_state(delta)

func configure(session: String, local: bool) -> void:
	session_id = session
	is_local_player = local
	_apply_appearance()

func apply_state(state: Dictionary) -> void:
	var new_hp: float = float(state.get("hp", hp))
	if new_hp < hp - 0.01:
		_flash = 0.25
	hp = new_hp
	max_hp = float(state.get("maxHp", max_hp))
	energy = float(state.get("energy", energy))
	max_energy = float(state.get("maxEnergy", max_energy))
	alive = bool(state.get("alive", alive))
	if state.has("x") and state.has("y"):
		_server_position = Vector2(float(state["x"]), float(state["y"])) * PX_PER_UNIT
	var name_value: String = String(state.get("displayName", display_name))
	if name_value != display_name:
		display_name = name_value
		_name_label.text = display_name
	_update_hud()

func _update_visual_state(delta: float) -> void:
	_flash = max(0.0, _flash - delta)
	if _flash > 0.0:
		modulate = Color(1.0, 0.35, 0.35)
	else:
		modulate = Color(1, 1, 1, 1.0 if alive else 0.3)

func _spawn_fire_effect() -> void:
	if energy < 20.0:
		return
	energy -= 20.0
	var fx := Node2D.new()
	fx.set_script(load("res://scripts/FireEffect.gd"))
	fx.set("radius_units", FOGO_RANGE)
	fx.position = global_position
	get_parent().add_child(fx)

func _apply_appearance() -> void:
	if not _has_sprite():
		return
	var cor: Color
	if is_local_player:
		cor = Color(0.95, 0.4, 0.15) # laranja de fogo
	else:
		cor = Color(0.2, 0.78, 0.78) # azul-petróleo (outros aventureiros)
	_sprite.color = cor
	_name_label.text = display_name

func _has_sprite() -> bool:
	return is_inside_tree() and _sprite != null

func _build_hud() -> void:
	_hud = CanvasLayer.new()
	add_child(_hud)

	var box := VBoxContainer.new()
	box.position = Vector2(16, 16)
	_hud.add_child(box)

	_hp_label = Label.new()
	_energy_label = Label.new()
	_hp_label.add_theme_font_size_override("font_size", 18)
	_energy_label.add_theme_font_size_override("font_size", 18)
	box.add_child(_hp_label)
	box.add_child(_energy_label)
	_update_hud()

func _update_hud() -> void:
	if _hp_label == null:
		return
	_hp_label.text = "HP: %d / %d" % [int(hp), int(max_hp)]
	_energy_label.text = "Energia: %d / %d" % [int(energy), int(max_energy)]
