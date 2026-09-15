class_name CameraController
extends Node3D
## Câmera de 3ª pessoa com SpringArm3D.
## Inspirada no Cyber-Ascension (câmera atrás da cabeça + recuo em obstáculos).
##
## Uso: coloque como filho do Player3D. O SpringArm3D + Camera3D devem ser filhos deste nó.

@export var mouse_sensitivity: float = 0.0025
@export var pitch_min: float = -1.2
@export var pitch_max: float = 0.6
@export var spring_length: float = 4.5
@export var invert_y: bool = false

var _yaw: float = 0.0
var _pitch: float = 0.2
var _spring: SpringArm3D
var _camera: Camera3D

func _ready() -> void:
	_spring = get_node_or_null("SpringArm3D") as SpringArm3D
	_camera = get_node_or_null("SpringArm3D/Camera3D") as Camera3D
	if _spring:
		_spring.spring_length = spring_length
		# Colisão para não atravessar paredes
		_spring.collision_mask = 1
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		var motion := event as InputEventMouseMotion
		_yaw -= motion.relative.x * mouse_sensitivity
		var y_sign := -1.0 if invert_y else 1.0
		_pitch -= motion.relative.y * mouse_sensitivity * y_sign
		_pitch = clampf(_pitch, pitch_min, pitch_max)
	elif event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		if Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _process(_delta: float) -> void:
	rotation.y = _yaw
	if _spring:
		_spring.rotation.x = _pitch

func get_look_yaw() -> float:
	return _yaw

func get_forward_flat() -> Vector3:
	# Direção no plano XZ (para movimento relativo à câmera)
	return Vector3(-sin(_yaw), 0.0, -cos(_yaw)).normalized()

func get_right_flat() -> Vector3:
	return Vector3(cos(_yaw), 0.0, -sin(_yaw)).normalized()
