class_name DomFogoEffect
extends Node2D
## Explosão do Dom de Fogo — efeito puramente visual.
## O dano e o alcance já foram decididos pelo servidor; aqui só desenhamos
## o que os outros clientes (e o próprio) recebem via evento "dom_fogo_cast".
##
## Visual atualizado 2026-09-15: mais camadas e cores alinhadas com ART_DIRECTION.

const PX_PER_UNIT := 32.0

var radius_units: float = 2.6
var lifetime: float = 0.42
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
	var radius: float = PX_PER_UNIT * radius_units * ease_out(t)
	var alpha: float = 1.0 - t

	# Núcleo quente
	draw_circle(Vector2.ZERO, radius * 0.35, Color(1.0, 0.95, 0.6, alpha * 0.7))
	# Corpo de fogo
	draw_circle(Vector2.ZERO, radius * 0.75, Color(1.0, 0.45, 0.08, alpha * 0.5))
	# Anel externo vibrante
	draw_arc(Vector2.ZERO, radius, 0.0, TAU, 40, Color(1.0, 0.75, 0.25, alpha * 0.9), 3.0)
	# Anel secundário (expansão)
	draw_arc(Vector2.ZERO, radius * 1.08, 0.0, TAU, 32, Color(1.0, 0.3, 0.05, alpha * 0.45), 1.8)

func ease_out(x: float) -> float:
	return 1.0 - (1.0 - x) * (1.0 - x)
