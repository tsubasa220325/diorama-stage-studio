@tool
extends EditorScenePostImport

# Godot 4 post-import helper for .glb files exported by Diorama Stage Studio (v0.7.0).
# Enforces nearest-neighbor pixel filtering and attaches 2.5D cutout anchor nodes from extras.dioramaStage.

func _post_import(scene: Node) -> Object:
	_apply_pixel_materials(scene)
	_spawn_cutout_placeholders(scene)
	return scene

func _apply_pixel_materials(node: Node) -> void:
	if node is MeshInstance3D and node.mesh:
		for i in range(node.mesh.get_surface_count()):
			var mat := node.mesh.surface_get_material(i)
			if mat is BaseMaterial3D:
				mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	for child in node.get_children():
		_apply_pixel_materials(child)

func _spawn_cutout_placeholders(scene: Node) -> void:
	if not scene.has_meta("extras"):
		return
	var extras = scene.get_meta("extras")
	if typeof(extras) != TYPE_DICTIONARY or not extras.has("dioramaStage"):
		return
	var stage: Dictionary = extras["dioramaStage"]
	var geom: Dictionary = stage.get("geometry", {})
	var cutouts: Array = geom.get("cutouts", [])
	if cutouts.is_empty():
		return
	var holder := Node3D.new()
	holder.name = "DioramaCutouts"
	scene.add_child(holder)
	holder.owner = scene
	for c in cutouts:
		if typeof(c) != TYPE_DICTIONARY or c.get("hidden", false):
			continue
		var sprite := Sprite3D.new()
		sprite.name = str(c.get("id", "cutout"))
		var pos: Array = c.get("pos", [0.0, 0.0, -2.5])
		sprite.position = Vector3(float(pos[0]), float(pos[1]), float(pos[2]))
		sprite.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
		sprite.alpha_cut = SpriteBase3D.ALPHA_CUT_DISCARD
		sprite.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if c.get("castShadow", true) else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		sprite.set_meta("cutout_config", c)
		holder.add_child(sprite)
		sprite.owner = scene
