## MobileControls — joystick virtual (esquerdo) + botão 🔥 (direito).
##
## Estratégia "teclado fantasma": injeta as MESMAS ações do Input Map que o
## teclado usa (Input.action_press/release com força analógica 0..1).
## Resultado: Player.gd, modo demo e rede continuam exatamente iguais —
## zero mudanças fora deste arquivo.
##
## Só aparece em aparelhos com touchscreen (teste feito via DisplayServer;
## no export Web desktop retorna false e nada é desenhado/exibido).

extends CanvasLayer

const JOY_CENTER := Vector2(150, 560)   # base do joystick (viewport 1280x720)
const JOY_RADIUS := 90.0                # raio externo (caminhada máxima)
const KNOB_RADIUS := 38.0               # knob (a "bolinha" do polegar)
const FIRE_CENTER := Vector2(1130, 560) # botão de fogo
const FIRE_RADIUS := 62.0

var _joy_touch := -1      # índice do dedo comandando o joystick (-1 = livre)
var _fire_touch := -1     # índice do dedo comandando o fogo
var _joy_dir := Vector2.ZERO
var _fire_flashing := 0.0 # feedback visual curto ao tocar 🔥

func _ready() -> void:
	layer = 10
	visible = _has_touchscreen()
	set_process(true)

func _has_touchscreen() -> bool:
	# Detecção em camadas (cada layer cobre um browser que esconde features):
	if OS.has_feature("web_android") or OS.has_feature("web_ios"):
		return true
	if DisplayServer.has_feature(DisplayServer.FEATURE_TOUCHSCREEN):
		return true
	if OS.has_feature("web"):
		var js = Engine.get_singleton("JavaScriptBridge")
		if js:
			# ?touch=1 força controles (debug; depois tiro daí se der)
			var forced = js.eval("new URLSearchParams(location.search).has('touch')")
			if forced == true:
				return true
			var res = js.eval("'ontouchstart' in window || navigator.maxTouchPoints > 0 || matchMedia('(pointer:coarse)').matches")
			if res == true:
				return true
	return false

func _process(delta: float) -> void:
	_fire_flashing = max(0.0, _fire_flashing - delta)
	if visible:
		# Redesenha o feedback visual (flashing) — só quando layer presente.
		queue_redraw()

func _input(event: InputEvent) -> void:
	if not visible:
		return
	if event is InputEventScreenTouch:
		if event.pressed:
			_try_claim_touch(event.index, event.position)
		else:
			_release_touch(event.index)
	elif event is InputEventScreenDrag:
		if event.index == _joy_touch:
			_update_joystick(event.position)

func _try_claim_touch(idx: int, pos: Vector2) -> void:
	# Fogo primeiro (alvo menor): se tocou perto do botão 🔥, é fogo.
	if pos.distance_to(FIRE_CENTER) <= FIRE_RADIUS + 20.0 and _fire_touch == -1:
		_fire_touch = idx
		_press_fire()
		return
	# Senão, qualquer toque na metade esquerda da tela vira joystick (dedão).
	if pos.x <= get_viewport().get_visible_rect().size.x * 0.55 and _joy_touch == -1:
		_joy_touch = idx
		_update_joystick(pos)

func _release_touch(idx: int) -> void:
	if idx == _joy_touch:
		_joy_touch = -1
		_joy_dir = Vector2.ZERO
		_release_move_actions()
	if idx == _fire_touch:
		_fire_touch = -1

func _update_joystick(pos: Vector2) -> void:
	var offset := pos - JOY_CENTER
	if offset.length() > JOY_RADIUS:
		offset = offset.normalized() * JOY_RADIUS
	_joy_dir = offset / JOY_RADIUS
	_apply_move_actions(_joy_dir)

# ------ injeção no Input Map ("teclado fantasma") ------
func _apply_move_actions(dir: Vector2) -> void:
	_set_axis("move_left",  "move_right", dir.x)
	_set_axis("move_up",    "move_down",  dir.y)

func _set_axis(neg_action: StringName, pos_action: StringName, value: float) -> void:
	var strong := clampf(value, -1.0, 1.0)
	if strong > 0.0:
		Input.action_release(neg_action)
		Input.action_press(pos_action, strong)
	elif strong < 0.0:
		Input.action_release(pos_action)
		Input.action_press(neg_action, -strong)
	else:
		Input.action_release(neg_action)
		Input.action_release(pos_action)

func _release_move_actions() -> void:
	for a in ["move_left", "move_right", "move_up", "move_down"]:
		Input.action_release(a)

func _press_fire() -> void:
	# just_pressed precisa de press+release rápidos para o Player.gd disparar.
	Input.action_press("dom_fogo")
	Input.action_release("dom_fogo")
	_fire_flashing = 0.18

func _notification(what: int) -> void:
	# Se a tela perder foco com dedo preso, solta tudo (anti "andar pra sempre").
	if what == NOTIFICATION_WM_WINDOW_FOCUS_OUT or what == NOTIFICATION_APPLICATION_PAUSED:
		_joy_touch = -1
		_fire_touch = -1
		_release_move_actions()

# ------ visual (puro cosmético — nada aqui afeta a autoridade da rede) ------
func _draw() -> void:
	# joystick: base + anel
	draw_circle(JOY_CENTER, JOY_RADIUS, Color(1, 1, 1, 0.10))
	draw_arc(JOY_CENTER, JOY_RADIUS, 0, TAU, 48, Color(1, 1, 1, 0.28), 3.0)
	# knob segue o dedo (ou descansa no centro)
	var knob_pos := JOY_CENTER + _joy_dir * (JOY_RADIUS - KNOB_RADIUS)
	draw_circle(knob_pos, KNOB_RADIUS, Color(1.0, 0.62, 0.2, 0.35))  # laranja Crystalia
	draw_arc(knob_pos, KNOB_RADIUS, 0, TAU, 40, Color(1.0, 0.8, 0.5, 0.7), 2.0)

	# botão 🔥
	var fire_col := Color(1.0, 0.5, 0.15, 0.30 + _fire_flashing * 1.7)
	draw_circle(FIRE_CENTER, FIRE_RADIUS, fire_col)
	draw_arc(FIRE_CENTER, FIRE_RADIUS, 0, TAU, 48, Color(1.0, 0.85, 0.6, 0.8), 3.0)
	draw_circle(FIRE_CENTER, FIRE_RADIUS * 0.42, Color(1.0, 0.75, 0.2, 0.55)) # núcleo chama
