extends Node2D

func _ready() -> void:
	# TODO: pegar o nome real depois de implementar login (Supabase Auth).
	NetworkManager.connect_to_ignara("Aventureiro de Teste")
