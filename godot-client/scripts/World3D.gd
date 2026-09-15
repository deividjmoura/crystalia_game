class_name IgnaraWorld3D
extends Node3D
## IgnaraWorld3D — primeira sala 3D do Crystalia (POC 3ª pessoa).
## (class_name evita colisão: World3D é classe nativa do Godot!)
##
## Showcase offline intencional: demo_mode ligado no LocalPlayer, sem rede.
## (O servidor continua autoritativo no mundo 2D; aqui validamos a câmera,
## o movimento em 3ª pessoa e o clima Cyber-Ascension pro irmão do Deivid.)
## Todo o cenário é montado por código — sem nenhum asset pesado no repo.

const ROOM_HALF := 12.0          # sala 24x24
const WALL_HEIGHT := 3.0
const TORCH_LUM_ENERGY := 1.6

var _local_player: CharacterBody3D

func _ready() -> void:
	_local_player = get_node_or_null("LocalPlayer") as CharacterBody3D
	if _local_player:
		# Player3D sempre tem demo_mode (POC); set direto é seguro.
		_local_player.set("demo_mode", true)
	_build_ambience()
	_build_room()

func _build_ambience() -> void:
	# Céu escuro-abafado de Ignara (fogo latente no ar)
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0.05, 0.02, 0.03)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.50, 0.24, 0.14)
	e.ambient_light_energy = 0.35
	env.environment = e
	add_child(env)

func _build_room() -> void:
	# 4 paredes (cor da terra vulcânica)
	var wall_mat := _make_mat(Color(0.30, 0.15, 0.09))
	_wall(Vector3(0, WALL_HEIGHT / 2.0, -ROOM_HALF), Vector3(ROOM_HALF * 2 + 1, WALL_HEIGHT, 1), wall_mat)
	_wall(Vector3(0, WALL_HEIGHT / 2.0,  ROOM_HALF), Vector3(ROOM_HALF * 2 + 1, WALL_HEIGHT, 1), wall_mat)
	_wall(Vector3(-ROOM_HALF, WALL_HEIGHT / 2.0, 0), Vector3(1, WALL_HEIGHT, ROOM_HALF * 2 - 2), wall_mat)
	_wall(Vector3( ROOM_HALF, WALL_HEIGHT / 2.0, 0), Vector3(1, WALL_HEIGHT, ROOM_HALF * 2 - 2), wall_mat)

	# 4 colunas com "brasa" nos cantos — OmniLights âmbar poucas (GL/web-friendly)
	var col_mat := _make_mat(Color(0.16, 0.08, 0.05))
	for corner in [Vector2(-9, -9), Vector2(9, -9), Vector2(-9, 9), Vector2(9, 9)]:
		_column(Vector3(corner.x, 0, corner.y), col_mat)

	# Coroa de chao atrás do NPC (detalhe que o irmão vê direto)
	var rug := MeshInstance3D.new()
	var rug_mesh := CylinderMesh.new()
	rug_mesh.top_radius = 4.0
	rug_mesh.bottom_radius = 4.0
	rug_mesh.height = 0.06
	rug.mesh = rug_mesh
	rug.material_override = _make_mat(Color(0.42, 0.18, 0.10))
	rug.position = Vector3(0, 0.28, -6)
	add_child(rug)

func _wall(pos: Vector3, size: Vector3, mat: StandardMaterial3D) -> void:
	var body := StaticBody3D.new()
	body.position = pos
	var mesh_i := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = size
	mesh_i.mesh = box
	mesh_i.material_override = mat
	body.add_child(mesh_i)
	var shape_i := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	shape_i.shape = shape
	body.add_child(shape_i)
	add_child(body)

func _column(pos: Vector3, mat: StandardMaterial3D) -> void:
	# coluna de pedra
	var mesh_i := MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = 0.55
	cyl.bottom_radius = 0.70
	cyl.height = 3.4
	mesh_i.mesh = cyl
	mesh_i.material_override = mat
	mesh_i.position = pos + Vector3(0, 1.7, 0)
	add_child(mesh_i)
	# "brasa" da coluna (baixa intensidade — GL Compatibility + web-friendly)
	var light := OmniLight3D.new()
	light.position = pos + Vector3(0, 3.1, 0)
	light.light_color = Color(1.0, 0.55, 0.20)
	light.light_energy = TORCH_LUM_ENERGY
	light.omni_range = 8.0
	light.shadow_enabled = false
	add_child(light)
	# cume metálico do braseiro
	var top := MeshInstance3D.new()
	var top_box := BoxMesh.new()
	top_box.size = Vector3(1.2, 0.18, 1.2)
	top.mesh = top_box
	top.material_override = _make_mat(Color(0.10, 0.05, 0.03), 0.3)
	top.position = pos + Vector3(0, 3.44, 0)
	add_child(top)

func _make_mat(color: Color, rough: float = 0.9) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = rough
	return m
