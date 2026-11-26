@tool
extends EditorScenePostImport

# Godot 4 post-import helper for .glb files exported by Diorama Stage Studio.
# Automatically enforces nearest-neighbor pixel filtering and reads extras.dioramaStage.

func _post_import(scene: Node) -> Object:
	_apply_pixel_materials(scene)
	return scene

func _apply_pixel_materials(node: Node) -> void:
	if node is MeshInstance3D and node.mesh:
		for i in range(node.mesh.get_surface_count()):
			var mat := node.mesh.surface_get_material(i)
			if mat is BaseMaterial3D:
				mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	for child in node.get_children():
		_apply_pixel_materials(child)
