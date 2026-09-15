extends RefCounted
## Ponte com o navegador — só é carregada em exports Web
## (ver NetworkManager._new_bridge, que faz load() deste arquivo apenas quando
## OS.has_feature("web")). Em desktop este arquivo nunca é parseado, então o
## uso de JavaScriptBridge não quebra o jogo fora do navegador.

## Avalia um pedaço de JS e devolve o resultado como String ("" se nulo/erro).
func eval_string(code: String) -> String:
	var result = JavaScriptBridge.eval(code, true)
	if result == null:
		return ""
	return str(result)

## URL do servidor definida pela hospedagem (config.js na pasta do export):
##   window.CRYSTALIA_WS_URL = "wss://seu-servidor.onrender.com"
func server_url_from_window() -> String:
	return eval_string("window.CRYSTALIA_WS_URL || ''").strip_edges()

## Override via querystring: https://site/?server=wss://host
func server_url_from_query() -> String:
	return eval_string("new URLSearchParams(location.search).get('server') || ''").strip_edges()

## Nome do aventureiro via querystring: https://site/?name=Crystal
func name_from_query() -> String:
	return eval_string("new URLSearchParams(location.search).get('name') || ''").strip_edges()
