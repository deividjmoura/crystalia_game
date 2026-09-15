extends Node
## Autoload (registrado em project.godot) que cuida da conexão com o
## servidor autoritativo. Usa o WebSocketPeer nativo do Godot — sem addons.
##
## Resolução da URL do servidor (em ordem):
##   Web:  1. window.CRYSTALIA_WS_URL  (config.js entregue junto com o site)
##         2. ?server=wss://...        (querystring da URL do jogo)
##         3. PROD_WS_URL              (default de produção abaixo)
##   Desktop: ws://127.0.0.1:2567 (servidor local de desenvolvimento)

signal connected
signal disconnected
signal connection_failed
signal reconnect_attempt(attempt, max_attempts)
signal player_state_updated(session_id, state)
signal player_left(session_id)
signal dom_fogo_cast(session_id, x, y, range_units, hit_session_ids)
signal player_died(session_id, killer_id)
signal player_respawned(session_id)

const DEBUG_WS_URL := "ws://127.0.0.1:2567"
# Servidor de produção (Render). Sobrescrevível por config.js ou ?server=.
const PROD_WS_URL := "wss://crystalia-server.onrender.com"
# Backoff de reconexão (~60s no total): o plano grátis da Render dorme após
# 15 min ocioso e o cold start pode demorar até ~1 min.
const RECONNECT_DELAYS := [1.5, 1.5, 2.0, 2.0, 3.0, 3.0, 5.0, 5.0, 8.0, 8.0, 10.0, 10.0]

var _socket := WebSocketPeer.new()
var local_session_id := ""
var local_display_name := "Aventureiro"
var server_url := ""
var _connecting := false
var _was_connected := false
var _attempts := 0

func _ready() -> void:
	set_process(false)

func connect_to_ignara(display_name: String) -> void:
	local_display_name = display_name
	_attempts = 0
	_was_connected = false
	_socket = WebSocketPeer.new()
	_do_connect()

func _do_connect() -> void:
	server_url = _resolve_server_url()
	local_display_name = _resolve_display_name(local_display_name)
	var url := "%s/?name=%s" % [server_url, local_display_name.uri_encode()]
	print("[Net] conectando em ", url)

	var err := _socket.connect_to_url(url)
	if err != OK:
		push_error("[NetworkManager] falha ao iniciar conexão: %s" % err)
		_schedule_retry_or_fail()
		return
	_connecting = true
	set_process(true)

func send_move_input(dx: float, dy: float) -> void:
	_send({"type": "move_input", "dx": dx, "dy": dy})

func use_dom_fogo() -> void:
	_send({"type": "use_dom_fogo"})

func _send(data: Dictionary) -> void:
	if _socket.get_ready_state() != WebSocketPeer.STATE_OPEN:
		return
	_socket.send_text(JSON.stringify(data))

func _process(_delta: float) -> void:
	_socket.poll()
	var state := _socket.get_ready_state()

	if state == WebSocketPeer.STATE_OPEN and _connecting:
		_connecting = false
		_was_connected = true
		print("[Net] conectado ao servidor!")
		connected.emit()

	while _socket.get_available_packet_count() > 0:
		var packet := _socket.get_packet().get_string_from_utf8()
		_handle_message(packet)

	if state == WebSocketPeer.STATE_CLOSED:
		# Código != -1 indica que a conexão foi aceita em algum momento.
		var close_code := _socket.get_close_code()
		print("[Net] conexão fechada. Código: ", close_code, " razão: ", _socket.get_close_reason())
		set_process(false)
		if _was_connected:
			disconnected.emit()
		else:
			_schedule_retry_or_fail()

func _schedule_retry_or_fail() -> void:
	if _attempts < RECONNECT_DELAYS.size():
		var delay: float = RECONNECT_DELAYS[_attempts]
		_attempts += 1
		print("[Net] tentativa %d/%d em %.1fs..." % [_attempts, RECONNECT_DELAYS.size(), delay])
		reconnect_attempt.emit(_attempts, RECONNECT_DELAYS.size())
		await get_tree().create_timer(delay).timeout
		_socket = WebSocketPeer.new()
		_do_connect()
	else:
		print("[Net] servidor inacessível — entrando em MODO DEMO (offline).")
		connection_failed.emit()

func _handle_message(raw: String) -> void:
	var json := JSON.new()
	if json.parse(raw) != OK:
		return
	var msg = json.get_data()
	if typeof(msg) != TYPE_DICTIONARY:
		return

	match msg.get("type", ""):
		"welcome":
			local_session_id = msg.get("sessionId", "")
		"state":
			var players: Dictionary = msg.get("players", {})
			for session_id in players.keys():
				player_state_updated.emit(session_id, players[session_id])
		"player_left":
			player_left.emit(msg.get("sessionId", ""))
		"event":
			_handle_event(msg)

func _handle_event(msg: Dictionary) -> void:
	match msg.get("name", ""):
		"dom_fogo_cast":
			dom_fogo_cast.emit(
				msg.get("sessionId", ""),
				msg.get("x", 0.0),
				msg.get("y", 0.0),
				msg.get("range", 2.6),
				msg.get("hitSessionIds", [])
			)
		"player_died":
			player_died.emit(msg.get("sessionId", ""), msg.get("killerId", ""))
		"player_respawned":
			player_respawned.emit(msg.get("sessionId", ""))

# ------------------------- Resolução de ambiente -------------------------

func _new_bridge():
	# load() condicional: em desktop o script (que usa JavaScriptBridge)
	# nunca é parseado.
	if not OS.has_feature("web"):
		return null
	return load("res://scripts/web/WebBridge.gd").new()

func _resolve_server_url() -> String:
	if not OS.has_feature("web"):
		return DEBUG_WS_URL

	var bridge = _new_bridge()
	if bridge:
		var from_query: String = bridge.server_url_from_query()
		if from_query != "":
			return from_query
		var from_window: String = bridge.server_url_from_window()
		if from_window != "":
			return _ensure_wss(from_window)
	return PROD_WS_URL

func _resolve_display_name(fallback: String) -> String:
	if OS.has_feature("web"):
		var bridge = _new_bridge()
		if bridge:
			var from_query: String = bridge.name_from_query()
			if from_query != "":
				return from_query.substr(0, 20)
	return fallback

func _ensure_wss(url: String) -> String:
	# Página https:// não pode abrir ws:// (mixed content) — normaliza.
	if url.begins_with("https://"):
		return "wss://" + url.substr("https://".length())
	if url.begins_with("http://"):
		return "ws://" + url.substr("http://".length())
	return url
