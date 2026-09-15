class_name NPC3D
extends Node3D
## NPC estático de quest — Tomrik, o Ferreiro (placeholder até o servidor
## tomar conta da IA de quest na Fase 1). O "!" dourado gira suave acima
## dele — é o primeiro cabo visual de "questbot" do mundo, sem lógica ainda.

var _quest_marker: Node3D
var _spark := 0.0

func _ready() -> void:
	_build_body()
	_build_quest_marker()
	_build_name_label()

func _process(delta: float) -> void:
	_spark += delta
	if _quest_marker:
		_quest_marker.rotation.y += delta * 2.2                       # gira no eixo (estilo MMORPG)
		_quest_marker.position.y = 2.25 + sin(_spark * 2.4) * 0.06    # flutua igual respiração mágica

func _build_body() -> void:
	# Corpo (cilindro terroso — RTP	nullar vibes minaurosp)
	var body := MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = 0.26
	cyl.bottom_radius = 0.36
	cyl.height = 1.25
	body.mesh = cyl
	body.material_override = _mat(Color(0.36, 0.22, 0.12))
	body.position = Vector3(0, 0.63, 0)
	add_child(body)

	# Cabeça (esfera de pele — albedo quentinho)
	var head := MeshInstance3D.new()
	var sph := SphereMesh.new()
	sph.radius = 0.23
	sph.height = 0.44
	head.mesh = sph
	head.material_override = _mat(Color(0.78, 0.55, 0.38), 0.6)
	head.position = Vector3(0, 1.52, 0)
	add_child(head)

	# Barba quadrada on point (é um ferreiro!)
	var beard := MeshInstance3D.new()
	var beard_box := BoxMesh.new()
	beard_box.size = Vector3(0.28, 0.26, 0.14)
	beard.mesh = beard_box
	beard.material_override = _mat(Color(0.12, 0.07, 0.04))
	beard.position = Vector3(0, 1.42, 0.19)
	add_child(beard)

	# Cajado de ferreiro nas costas (cilindro fino cinza-ferro)
	var staff := MeshInstance3D.new()
	var staff_cyl := CylinderMesh.new()
	staff_cyl.top_radius = 0.045
	staff_cyl.bottom_radius = 0.045
	staff_cyl.height = 1.7
	staff.mesh = staff_cyl
	staff.material_override = _mat(Color(0.42, 0.40, 0.44), 0.35)
	staff.position = Vector3(-0.34, 0.9, -0.14)
	staff.rotation.z = 0.12
	add_child(staff)

func _build_quest_marker() -> void:
	_quest_marker = Node3D.new()
	_quest_marker.position = Vector3(0, 2.25, 0)

	# barra vertical do "!"
	var bar := MeshInstance3D.new()
	var bar_box := BoxMesh.new()
	bar_box.size = Vector3(0.07, 0.40, 0.07)
	bar.mesh = bar_box
	bar.material_override = _mat(Color(1.0, 0.82, 0.12), 0.25)
	bar.position = Vector3(0, 0.12, 0)
	_quest_marker.add_child(bar)

	# ponto do "!"
	var dot := MeshInstance3D.new()
	var dot_box := BoxMesh.new()
	dot_box.size = Vector3(0.11, 0.11, 0.11)
	dot.mesh = dot_box
	dot.material_override = _mat(Color(1.0, 0.92, 0.30), 0.22)
	dot.position = Vector3(0, -0.14, 0)
	_quest_marker.add_child(dot)

	add_child(_quest_marker)

func _build_name_label() -> void:
	var name_label := Label3D.new()
	name_label.text = "Tomrik, o Ferreiro\n«!» quest em breve"
	name_label.font_size = 26
	name_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	name_label.position = Vector3(0, 1.95, 0)
	add_child(name_label)

func _mat(color: Color, rough: float = 0.8) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = rough
	return m
