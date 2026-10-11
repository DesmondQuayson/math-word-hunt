"""
MathNexa Math Tug of War - headless MakeHuman (MPFB2) character build.

Blender 4.5 LTS + MPFB 2.0.18 (GPL tooling; every generated mesh, target and
texture used here is CC0: MakeHuman base mesh, system assets, shirts01,
pants01, shoes01, eyebrows01, eyelashes01, faceunits01).

  blender -b --python build_characters.py -- --spec characters.json --out <dir> [--only name]

Per character: build the human from the spec, add the Mixamo-named rig,
bake body-shape targets, load the ARKit face units we animate, interpolate
them to eyebrows/eyelashes/eyes, remove helper geometry, downscale textures,
export glTF (separate .bin + WebP textures) and render a preview PNG.
"""
import bpy, sys, os, json, math, time, traceback

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


SPEC = arg("--spec")
OUT = arg("--out")
ONLY = arg("--only")
TEX = int(arg("--texture-size", "1024"))

bpy.ops.preferences.addon_enable(module="bl_ext.user_default.mpfb")
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.objectservice import ObjectService
from bl_ext.user_default.mpfb.services.exportservice import ExportService
from bl_ext.user_default.mpfb.services.faceservice import FaceService
from bl_ext.user_default.mpfb.services.targetservice import TargetService

# Face units we animate at runtime (expressions are blends of these).
FACE_UNITS = [
    "browDownLeft", "browDownRight", "browInnerUp", "browOuterUpLeft", "browOuterUpRight",
    "cheekSquintLeft", "cheekSquintRight",
    "eyeBlinkLeft", "eyeBlinkRight", "eyeSquintLeft", "eyeSquintRight", "eyeWideLeft", "eyeWideRight",
    "jawOpen", "mouthClose", "mouthFrownLeft", "mouthFrownRight", "mouthSmileLeft", "mouthSmileRight",
    "mouthPressLeft", "mouthPressRight", "mouthPucker", "mouthStretchLeft", "mouthStretchRight",
    "noseSneerLeft", "noseSneerRight", "mouthShrugLower", "mouthDimpleLeft", "mouthDimpleRight"
]


def log(*parts):
    print("[tug-build]", *parts, flush=True)


def reset_scene():
    bpy.ops.wm.read_homefile(use_empty=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.armatures, bpy.data.objects):
        for item in list(block):
            try:
                block.remove(item)
            except Exception:
                pass


COVERED_BONES = {"mixamorig:Hips", "mixamorig:Spine", "mixamorig:Spine1", "mixamorig:Spine2",
                 "mixamorig:LeftUpLeg", "mixamorig:RightUpLeg", "mixamorig:LeftLeg", "mixamorig:RightLeg"}


FOOT_GROUPS = ("mixamorig:LeftFoot", "mixamorig:RightFoot", "mixamorig:LeftToeBase", "mixamorig:RightToeBase",
               "mixamorig:LeftLeg", "mixamorig:RightLeg")


def reweight_footwear(basemesh):
    """Footwear follows the foot: copy each shoe vertex's deform weights from the
    nearest body vertex of the foot/ankle region. MakeHuman's proxy fitting binds
    most shoe vertices to the shin bone, which tears the shoe open at the ankle as
    soon as the knee bends; the body's own foot vertices carry the right blend
    (toes -> ToeBase, foot -> Foot, collar -> a little Leg)."""
    from mathutils.kdtree import KDTree
    groups = {g.index: g.name for g in basemesh.vertex_groups}
    region = []
    for vertex in basemesh.data.vertices:
        best, best_weight = None, 0.0
        for element in vertex.groups:
            name = groups.get(element.group)
            if name and element.weight > best_weight:
                best, best_weight = name, element.weight
        if best in FOOT_GROUPS:
            region.append(vertex)
    if not region:
        log("reweight_footwear: no foot vertices on the body")
        return
    tree = KDTree(len(region))
    for index, vertex in enumerate(region):
        tree.insert(basemesh.matrix_world @ vertex.co, index)
    tree.balance()
    for obj in bpy.data.objects:
        if obj.type != "MESH" or "shoe" not in obj.name.lower():
            continue
        shoe_groups = {g.name: g for g in obj.vertex_groups}
        for name in set(groups.values()):
            if name not in shoe_groups:
                shoe_groups[name] = obj.vertex_groups.new(name=name)
        for vertex in obj.data.vertices:
            for group in obj.vertex_groups:
                group.remove([vertex.index])
            _, index, _ = tree.find(obj.matrix_world @ vertex.co)
            source = region[index]
            total = sum(element.weight for element in source.groups) or 1.0
            for element in source.groups:
                name = groups.get(element.group)
                if name and element.weight > 0.0:
                    shoe_groups[name].add([vertex.index], element.weight / total, "REPLACE")
        log("reweighted footwear", obj.name, len(obj.data.vertices), "vertices from", len(region), "foot vertices")


def delete_covered_body(basemesh):
    """Remove body vertices whose dominant deform bone is under clothing."""
    import bmesh
    groups = {g.index: g.name for g in basemesh.vertex_groups}
    doomed = set()
    for vertex in basemesh.data.vertices:
        best, best_weight = None, 0.0
        for element in vertex.groups:
            name = groups.get(element.group)
            if name and name.startswith("mixamorig:") and element.weight > best_weight:
                best, best_weight = name, element.weight
        if best in COVERED_BONES and best_weight > 0.5:
            doomed.add(vertex.index)
    if not doomed:
        return
    bpy.ops.object.mode_set(mode="OBJECT")
    mesh = bmesh.new()
    mesh.from_mesh(basemesh.data)
    mesh.verts.ensure_lookup_table()
    # Keep shape keys intact: bmesh delete on a mesh with shape keys is supported
    # when done through bmesh.from_mesh/to_mesh with the key layers present.
    remove = [mesh.verts[index] for index in doomed]
    bmesh.ops.delete(mesh, geom=remove, context="VERTS")
    mesh.to_mesh(basemesh.data)
    mesh.free()
    basemesh.data.update()
    log("deleted covered body vertices", len(doomed), "left", len(basemesh.data.vertices))


def build(spec):
    reset_scene()
    info = HumanService._create_default_human_info_dict()
    info["name"] = spec["name"]
    info["phenotype"].update(spec.get("phenotype", {}))
    if "race" in spec:
        info["phenotype"]["race"] = spec["race"]
    info["rig"] = spec.get("rig", "mixamo")
    for part in ("eyes", "eyebrows", "eyelashes", "teeth", "tongue", "hair"):
        info[part] = spec.get(part, "")
    info["clothes"] = list(spec.get("clothes", []))
    info["skin_mhmat"] = spec["skin"]
    info["skin_material_type"] = "GAMEENGINE"
    info["eyes_material_type"] = "GAMEENGINE"
    info["clothes_material_type"] = "GAMEENGINE"
    info["targets"] = list(spec.get("targets", []))
    info["alternative_materials"] = dict(spec.get("alternative_materials", {}))

    settings = HumanService.get_default_deserialization_settings()
    # detailed_helpers keeps the joint cubes the Mixamo rig fits its bones to (removed again before export).
    settings.update({"subdiv_levels": 0, "detailed_helpers": True, "extra_vertex_groups": False,
                     "override_skin_model": "GAMEENGINE", "override_rig": "PRESET", "material_instances": "NEVER"})
    basemesh = HumanService.deserialize_from_dict(info, settings)
    rig = basemesh.parent
    log("built", basemesh.name, "rig", rig.name if rig else None, "bones", len(rig.data.bones) if rig else 0)

    # 1. Bake the body-shape (macro + detail) targets into the mesh.
    TargetService.bake_targets(basemesh)
    # 2. Load the face units we animate (full-mesh indices, so before helpers go).
    FaceService.load_targets(basemesh, load_microsoft_visemes=False, load_meta_visemes=False, load_arkit_faceunits=True)
    wanted = {TargetService.expression_name_to_shapekey_name(name) for name in FACE_UNITS}
    wanted_plain = set(FACE_UNITS)
    for key in list(basemesh.data.shape_keys.key_blocks):
        if key.name == "Basis":
            continue
        if key.name not in wanted and key.name not in wanted_plain:
            basemesh.shape_key_remove(key)
    names = [k.name for k in basemesh.data.shape_keys.key_blocks]
    log("shape keys on body", len(names) - 1)
    # 3. Carry the face units to eyebrows/eyelashes/eyes/teeth only (hair and clothes do not emote).
    FaceService.interpolate_targets(basemesh)
    keep_morphs = ("eyebrow", "eyelashes", "teeth", "low-poly", "high-poly")
    for obj in bpy.data.objects:
        if obj.type != "MESH" or obj == basemesh or not obj.data.shape_keys:
            continue
        if any(token in obj.name for token in keep_morphs):
            continue
        for key in list(obj.data.shape_keys.key_blocks):
            obj.shape_key_remove(key)
    # 4. Remove helper geometry and apply clothes delete-groups (keeps shape keys).
    ExportService.bake_modifiers_remove_helpers(basemesh, bake_masks=True, bake_subdiv=False, remove_helpers=True, also_proxy=False)

    # 4a. Footwear deforms with the foot, not the shin (see reweight_footwear), before the shin goes.
    reweight_footwear(basemesh)

    # 4b. Delete body geometry that clothes always cover (torso, thighs, shins):
    # nothing can poke through a shirt or trousers, and the body mesh shrinks.
    delete_covered_body(basemesh)

    # 5. Shrink textures.
    for image in bpy.data.images:
        if image.size[0] > TEX or image.size[1] > TEX:
            w, h = image.size
            scale = TEX / max(w, h)
            image.scale(max(1, int(w * scale)), max(1, int(h * scale)))

    stats = {"objects": []}
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            mesh = obj.data
            tris = sum(len(poly.vertices) - 2 for poly in mesh.polygons)
            stats["objects"].append({"name": obj.name, "vertices": len(mesh.vertices), "triangles": tris,
                                     "shape_keys": len(mesh.shape_keys.key_blocks) - 1 if mesh.shape_keys else 0,
                                     "materials": [m.name for m in mesh.materials if m]})
    stats["bones"] = [b.name for b in rig.data.bones] if rig else []
    return basemesh, rig, stats


def export(spec, basemesh, rig):
    out_dir = os.path.join(OUT, spec["name"])
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, spec["name"] + ".gltf")
    for obj in bpy.data.objects:
        obj.select_set(True)
    options = dict(
        filepath=path, export_format="GLTF_SEPARATE", export_texture_dir="", export_image_format="WEBP",
        export_image_quality=82, export_apply=True, export_yup=True, export_skins=True, export_morph=True,
        export_morph_normal=False, export_morph_tangent=False, export_try_sparse_sk=True, export_animations=False,
        export_lights=False, export_cameras=False, export_extras=False, export_all_influences=False,
        export_def_bones=True, export_texcoords=True, export_normals=True, export_tangents=False,
        export_materials="EXPORT", use_selection=False, export_unused_images=False, export_shared_accessors=True,
        export_hierarchy_flatten_bones=False, export_vertex_color="NONE"
    )
    while True:
        try:
            bpy.ops.export_scene.gltf(**options)
            break
        except TypeError as exc:
            message = str(exc)
            dropped = None
            for key in list(options.keys()):
                if key in message:
                    dropped = key
                    break
            if not dropped:
                raise
            log("dropping unknown export option", dropped)
            options.pop(dropped)
    log("exported", path)
    return path


def preview(spec, rig):
    out_dir = os.path.join(OUT, spec["name"])
    scene = bpy.context.scene
    cam_data = bpy.data.cameras.new("cam")
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = (0.0, -3.6, 1.05)
    cam.rotation_euler = (math.radians(86), 0, 0)
    cam_data.lens = 60
    scene.camera = cam
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 3.0
    sun_obj = bpy.data.objects.new("sun", sun)
    sun_obj.rotation_euler = (math.radians(50), math.radians(10), math.radians(30))
    scene.collection.objects.link(sun_obj)
    fill = bpy.data.lights.new("fill", "AREA")
    fill.energy = 400
    fill_obj = bpy.data.objects.new("fill", fill)
    fill_obj.location = (-2.5, -2.5, 1.6)
    scene.collection.objects.link(fill_obj)
    world = bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.72, 0.84, 0.95, 1.0)
        bg.inputs[1].default_value = 0.9
    scene.render.resolution_x = 520
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "BLENDER_WORKBENCH"):
        try:
            scene.render.engine = engine
            scene.render.filepath = os.path.join(out_dir, spec["name"] + "-preview.png")
            bpy.ops.render.render(write_still=True)
            log("preview", engine, scene.render.filepath)
            return
        except Exception as exc:
            log("preview failed with", engine, exc)


def main():
    with open(SPEC, "r", encoding="utf-8") as handle:
        specs = json.load(handle)
    report = {}
    for spec in specs:
        if ONLY and spec["name"] != ONLY:
            continue
        started = time.time()
        try:
            basemesh, rig, stats = build(spec)
            path = export(spec, basemesh, rig)
            stats["gltf"] = path
            stats["seconds"] = round(time.time() - started, 1)
            try:
                preview(spec, rig)
            except Exception:
                traceback.print_exc()
            report[spec["name"]] = stats
            log("done", spec["name"], stats["seconds"], "s")
        except Exception:
            traceback.print_exc()
            report[spec["name"]] = {"error": traceback.format_exc()}
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "build-report.json"), "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
    log("REPORT", json.dumps({k: (v.get("error", "ok")[:200] if isinstance(v, dict) else v) for k, v in report.items()}))


main()
