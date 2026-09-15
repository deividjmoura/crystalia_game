class_name Player3D
extends CharacterBody3D
## Jogador em 3ª pessoa.
## Envia apenas intenções (move_input) para o servidor autoritativo.
## Posição final continua vindo do servidor (interpolação visual).
##
## Avatar placeholder: cápsula + “membros” simples (substituir por mesh depois).

const SPEED := 4.5
const JUMP_VELOCITY := 5.5
const INTERP_SPEED := 12.0

@export var is_local_player: bool = true

var session_id: String = ""
var display_name: String = "Aventureiro"
var demo_mode: bool = false

# Estado autoritativo (servidor) — plano XZ mapeado para 3D
var _server_pos := Vector3.ZERO
# Só corrige a posição DEPOIS do 1º estado real do servidor.
# Sem isso, offline/POC o player faz lerp para a origem ("coleira" ~0,5 m do spawn).
var _has_server_state := false
var _last_input := Vector2.ZERO

var hp := 100.0
var max_hp := 100.0
var energy := 100.0
var max_energy := 100.0
var alive := true

var _camera_ctrl: CameraController
var _name_label: Label3D
var _avatar: Node3D

func _ready() -> void:
	_server_pos = global_position  # nasce no spawn, não na origem (0,0,0)
	_camera_ctrl = get_node_or_null("CameraController") as CameraController
	_build_avatar()
	_build_name_label()
	if is_local_player and _camera_ctrl:
		# Câmera só no local
		pass
	elif _camera_ctrl:
		_camera_ctrl.queue_free()
		_camera_ctrl = null

func _physics_process(delta: float) -> void:
	if not is_local_player:
		global_position = global_position.lerp(_server_pos, INTERP_SPEED * delta)
		return

	if demo_mode:
		_demo_move(delta)
		return

	var input_dir := Vector2.ZERO
	if _camera_ctrl:
		var forward := _camera_ctrl.get_forward_flat()
		var right := _camera_ctrl.get_right_flat()
		var f := Input.get_axis("move_down", "move_up")  # W/S
		var s := Input.get_axis("move_left", "move_right") # A/D
		var wish := (forward * f + right * s)
		if wish.length() > 0.01:
			wish = wish.normalized()
			input_dir = Vector2(wish.x, wish.z)
	else:
		input_dir = Vector2(
			Input.get_axis("move_left", "move_right"),
			Input.get_axis("move_up", "move_down")
		)

	if input_dir != _last_input:
		# Mantém o protocolo atual (servidor 2D)
		if Engine.has_singleton("NetworkManager") or NetworkManager:
			NetworkManager.send_move_input(input_dir.x, input_dir.y)
		_last_input = input_dir

	if Input.is_action_just_pressed("dom_fogo"):
		if NetworkManager:
			NetworkManager.use_dom_fogo()

	# Previsão visual local (servidor corrige)
	var direction := Vector3(input_dir.x, 0.0, input_dir.y)
	if direction.length() > 0.01:
		velocity.x = direction.x * SPEED
		velocity.z = direction.z * SPEED
	else:
		velocity.x = move_toward(velocity.x, 0.0, SPEED)
		velocity.z = move_toward(velocity.z, 0.0, SPEED)

	if not is_on_floor():
		velocity.y -= 17.0 * delta
	elif Input.is_action_just_pressed("ui_accept"):  # espaço já mapeado em alguns projetos
		velocity.y = JUMP_VELOCITY

	_rotate_avatar_to(input_dir, delta)
	move_and_slide()

	# Interpola em direção ao servidor para não divergir — apenas após o 1º
	# estado real recebido; sem rede (POC/demo offline) não puxa para a origem.
	if _has_server_state:
		global_position = global_position.lerp(_server_pos, 0.15)

func _rotate_avatar_to(direction: Vector2, delta: float) -> void:
	if not _avatar or direction.length() < 0.01:
		return
	# Personagem olha pra onde anda (suavizado) — estilo Cyber-Ascension
	var target_angle := atan2(direction.x, direction.y)
	_avatar.rotation.y = lerp_angle(_avatar.rotation.y, target_angle, 10.0 * delta)

func _demo_move(delta: float) -> void:
	var input_dir := Vector2(
		Input.get_axis("move_left", "move_right"),
		Input.get_axis("move_up", "move_down")
	)
	var direction := Vector3(input_dir.x, 0.0, input_dir.y)
	if direction.length() > 0.01:
		direction = direction.normalized()
		velocity.x = direction.x * SPEED
		velocity.z = direction.z * SPEED
	else:
		velocity.x = move_toward(velocity.x, 0.0, SPEED)
		velocity.z = move_toward(velocity.z, 0.0, SPEED)
	if not is_on_floor():
		velocity.y -= 17.0 * delta
	move_and_slide()

func configure(session: String, local: bool) -> void:
	session_id = session
	is_local_player = local
	if not local and _camera_ctrl:
		_camera_ctrl.queue_free()
		_camera_ctrl = null

func apply_state(state: Dictionary) -> void:
	_has_server_state = true
	hp = float(state.get("hp", hp))
	max_hp = float(state.get("maxHp", max_hp))
	energy = float(state.get("energy", energy))
	max_energy = float(state.get("maxEnergy", max_energy))
	alive = bool(state.get("alive", alive))
	if state.has("x") and state.has("y"):
		# Servidor ainda fala em unidades 2D; mapeamos Y do server → Z do 3D
		_server_pos = Vector3(float(state["x"]) * 1.0, global_position.y, float(state["y"]) * 1.0)
	var name_value: String = String(state.get("displayName", display_name))
	if name_value != display_name:
		display_name = name_value
		if _name_label:
			_name_label.text = display_name

## Avatar low-poly do guerreiro Ignara — espelho 3D do sprite 2D
## (player_ignara.png): cabelo preto espetado, cachecol vermelho-chama,
## armadura escura com detalhes dourados e espada nas costas.
## Tudo procedural: zero assets, ~15 primitivas, <2k tris.
const _CORES := {
	"pele":    Color(0.87, 0.68, 0.50),  # rosto/pele
	"cabelo":  Color(0.12, 0.10, 0.09),  # preto castanho sintético
	"olho":    Color(0.85, 0.27, 0.10),  # olhos castanho-fogo (emissive!)
	"cachecol":Color(0.90, 0.31, 0.10),  # cachecol vermelho Ignara
	"armadura":Color(0.13, 0.11, 0.11),  # couraço escuro quase-preto
	"ouro":    Color(0.85, 0.55, 0.16),  # detalhes dourados
	"calca":   Color(0.14, 0.16, 0.22),  # calça preta-azulada
	"bota":    Color(0.08, 0.07, 0.06),  # botas pretas
	"lamina":  Color(0.72, 0.70, 0.74),  # aço da espada
}

func _build_avatar() -> void:
	_avatar = Node3D.new()
	add_child(_avatar)

	# --- Perfps e botas (leve afastar para postura de luta) ---
	for side in [-1.0, 1.0]:
		var boot := _box(Vector3(0.11, 0.10, 0.16), Vector3(side * 0.105, 0.05, 0.02), _CORES.bota)
		var leg  := _cyl(0.075, 0.62, Vector3(side * 0.105, 0.42, 0), _CORES.calca)
		_avatar.add_child(boot)
		_avatar.add_child(leg)

	# --- Torso: couraço escuro + tabard/cinto dourado ---
	_avatar.add_child(_cyl(0.24, 0.62, Vector3(0, 0.95, 0), _CORES.armadura))
	_avatar.add_child(_box(Vector3(0.46, 0.12, 0.36), Vector3(0, 0.66, 0.02), _CORES.ouro))       # cinto
	_avatar.add_child(_box(Vector3(0.36, 0.30, 0.05), Vector3(0, 1.00, 0.235), _CORES.cachecol)) # brasão chama frente

	# --- Braços com ombreiras douradas ---
	for side in [-1.0, 1.0]:
		_avatar.add_child(_box(Vector3(0.16, 0.10, 0.16), Vector3(side * 0.30, 1.18, 0), _CORES.ouro))    # ombreira
		_avatar.add_child(_cyl(0.07, 0.52, Vector3(side * 0.34, 0.87, 0), _CORES.armadura))                # braço

	# --- Cabeça + cabelo preto espetado ---
	_avatar.add_child(_sphere(0.22, Vector3(0, 1.50, 0), _CORES.pele))
	var hair := _sphere(0.235, Vector3(0, 1.56, -0.02), _CORES.cabelo)  # capacete de cabelo (um pouco maior/atrás)
	_avatar.add_child(hair)
	# franja (box gainchada para frente)
	var fringe := _box(Vector3(0.34, 0.12, 0.10), Vector3(0, 1.55, 0.135), _CORES.cabelo)
	fringe.rotation.x = -0.12
	_avatar.add_child(fringe)
	# "espinhos" estilo anime: 3 cones/levantes low-poly
	for i in [-1.0, 0.0, 1.0]:
		var spike := MeshInstance3D.new()
		var cone := CylinderMesh.new()
		cone.top_radius = 0.0
		cone.bottom_radius = 0.055
		cone.height = 0.18
		spike.mesh = cone
		spike.material_override = _mat(_CORES.cabelo)
		spike.position = Vector3(i * 0.10, 1.82, -0.04 - abs(i) * 0.03)
		spike.rotation.x = -0.35
		spike.rotation.z = i * 0.25
		_avatar.add_child(spike)

	# --- Olhos flamejantes (emissive brilha low cost!) ---
	for side in [-1.0, 1.0]:
		var eye := _box(Vector3(0.045, 0.06, 0.045), Vector3(side * 0.085, 1.52, 0.195), _CORES.olho)
		(eye.material_override as StandardMaterial3D).emission_enabled = true
		(eye.material_override as StandardMaterial3D).emission = _CORES.olho
		(eye.material_override as StandardMaterial3D).emission_energy_multiplier = 2.2
		_avatar.add_child(eye)

	# --- Cachecol: rolo no pescoço + ponta caída atrás ---
	var scarf := _cyl(0.245, 0.14, Vector3(0, 1.32, 0), _CORES.cachecol)
	_avatar.add_child(scarf)
	var tail := _box(Vector3(0.16, 0.42, 0.052), Vector3(0, 1.08, -0.238), _CORES.cachecol)
	tail.rotation.x = 0.18
	_avatar.add_child(tail)

	# --- Espada nas costas (punho escuro + guarda dourada + lâmina aço) ---
	var grip   := _cyl(0.035, 0.24, Vector3(0.16, 1.72, -0.20), _CORES.armadura)
	var guard  := _box(Vector3(0.16, 0.04, 0.04), Vector3(0.16, 1.60, -0.20), _CORES.ouro)
	var blade  := _box(Vector3(0.055, 0.60, 0.022), Vector3(0.16, 1.31, -0.20), _CORES.lamina)
	for piece in [grip, guard, blade]:
		piece.rotation.z = -0.16  # anguladinha cansada antes eroi
		_avatar.add_child(piece)

	# Colisão do corpo (cápsula) — filha do CharacterBody3D, NÃO do _avatar
	# (o avatar gira com o movimento; a cápsula deve ficar quieta).
	# SEM ela o player atravessa o chão e cai eternamente — foi o que
	# aconteceu quando este bloco ficou preso depois do `return` de _mat().
	var col := CollisionShape3D.new()
	var shape := CapsuleShape3D.new()
	shape.radius = 0.28
	shape.height = 1.1
	col.shape = shape
	col.position.y = 0.9
	add_child(col)

func _box(size: Vector3, pos: Vector3, color: Color) -> MeshInstance3D:
	var m := MeshInstance3D.new()
	var b := BoxMesh.new()
	b.size = size
	m.mesh = b
	m.material_override = _mat(color)
	m.position = pos
	return m

func _cyl(radius: float, height: float, pos: Vector3, color: Color) -> MeshInstance3D:
	var m := MeshInstance3D.new()
	var c := CylinderMesh.new()
	c.top_radius = radius
	c.bottom_radius = radius
	c.height = height
	m.mesh = c
	m.material_override = _mat(color)
	m.position = pos
	return m

func _sphere(radius: float, pos: Vector3, color: Color) -> MeshInstance3D:
	var m := MeshInstance3D.new()
	var s := SphereMesh.new()
	s.radius = radius
	s.height = radius * 2.0
	m.mesh = s
	m.material_override = _mat(color)
	m.position = pos
	return m

func _mat(color: Color) -> StandardMaterial3D:
	var mm := StandardMaterial3D.new()
	mm.albedo_color = color
	mm.roughness = 0.72
	return mm

func _build_name_label() -> void:
	_name_label = Label3D.new()
	_name_label.text = display_name
	_name_label.position = Vector3(0, 2.1, 0)
	_name_label.font_size = 32
	_name_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	add_child(_name_label)
