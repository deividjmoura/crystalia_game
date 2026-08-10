extends Node
## Autoload (já registrado em project.godot) que gerencia a conexão com o
## servidor autoritativo.
##
## Usa o WebSocketPeer embutido do próprio Godot — não precisa de nenhum
## addon/plugin instalado. O protocolo é JSON simples, definido no servidor
## em server/src/game/IgnaraRoom.js.

signal connected
signal disconnected
signal player_state_updated(session_id, state)
signal dom_fogo_cast(session_id, x, y, hit_session_ids)
signal player_died(session_id, killer_id)
signal player_respawned(session_id)

const SERVER_URL := "ws://127.0.0.1:2567"

var _socket := WebSocketPeer.new()
var local_session_id := ""
var _connecting := false

func connect_to_ignara(display_name: String) -> void:
	var url := "%s/?name=%s" % [SERVER_URL, display_name.uri_encode()]
	print("[DEBUG] tentando conectar em: ", url)
	var err := _socket.connect_to_url(url)
	if err != OK:
		push_error("[NetworkManager] falha ao iniciar conexão: %s" % err)
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
		print("[DEBUG] conectado ao servidor!")
		connected.emit()

	while _socket.get_available_packet_count() > 0:
		var packet := _socket.get_packet().get_string_from_utf8()
		print("[DEBUG] recebido: ", packet)
		_handle_message(packet)

	if state == WebSocketPeer.STATE_CLOSED and not _connecting:
		print("[DEBUG] conexão fechada. Código: ", _socket.get_close_code(), " razão: ", _socket.get_close_reason())
		set_process(false)
		disconnected.emit()
		
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
		"event":
			_handle_event(msg)

func _handle_event(msg: Dictionary) -> void:
	match msg.get("name", ""):
		"dom_fogo_cast":
			dom_fogo_cast.emit(msg.get("sessionId", ""), msg.get("x", 0.0), msg.get("y", 0.0), msg.get("hitSessionIds", []))
		"player_died":
			player_died.emit(msg.get("sessionId", ""), msg.get("killerId", ""))
		"player_respawned":
			player_respawned.emit(msg.get("sessionId", ""))