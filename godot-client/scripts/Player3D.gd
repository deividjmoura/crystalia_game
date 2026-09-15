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

	move_and_slide()

	# Interpola em direção ao servidor para não divergir
	global_position = global_position.lerp(_server_pos, 0.15)

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

func _build_avatar() -> void:
	# Placeholder low-poly (cápsula = corpo)
	var mesh_instance := MeshInstance3D.new()
	var capsule := CapsuleMesh.new()
	capsule.radius = 0.28
	capsule.height = 1.1
	mesh_instance.mesh = capsule
	mesh_instance.position.y = 0.9
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.95, 0.35, 0.12)  # Ignara / fogo
	mat.roughness = 0.55
	mesh_instance.material_override = mat
	add_child(mesh_instance)
	_avatar = mesh_instance

	# Colisão
	var col := CollisionShape3D.new()
	var shape := CapsuleShape3D.new()
	shape.radius = 0.28
	shape.height = 1.1
	col.shape = shape
	col.position.y = 0.9
	add_child(col)

func _build_name_label() -> void:
	_name_label = Label3D.new()
	_name_label.text = display_name
	_name_label.position = Vector3(0, 2.1, 0)
	_name_label.font_size = 32
	_name_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	add_child(_name_label)
