class_name DomFogoEffect
extends Node2D
## Explosão do Dom de Fogo — efeito puramente visual.
## O dano e o alcance já foram decididos pelo servidor; aqui só desenhamos
## o que os outros clientes (e o próprio) recebem via evento "dom_fogo_cast".

const PX_PER_UNIT := 32.0

var radius_units: float = 2.6
var lifetime: float = 0.38
var _age: float = 0.0

func _ready() -> void:
	z_index = 10
	set_process(true)

func _process(delta: float) -> void:
	_age += delta
	if _age >= lifetime:
		queue_free()
		return
	queue_redraw()

func _draw() -> void:
	var t: float = clamp(_age / lifetime, 0.0, 1.0)
	var radius: float = PX_PER_UNIT * radius_units * t
	var alpha: float = 1.0 - t
	# Miolo preenchido + anel vibrante por fora.
	draw_circle(Vector2.ZERO, radius, Color(1.0, 0.42, 0.08, alpha * 0.45))
	draw_arc(Vector2.ZERO, radius, 0.0, TAU, 36, Color(1.0, 0.82, 0.35, alpha), 2.5)
