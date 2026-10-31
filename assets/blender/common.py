"""Original procedural reaction art. Blender is an offline authoring tool only."""
import argparse
from array import array
import json
import math
import sys
import time
from pathlib import Path

import bpy
from mathutils import Vector

FPS = 30
PALETTE = {"cream": "F4E6C5", "amber": "E6AE66", "ink": "283B42", "rose": "E9A18E",
           "mint": "79D7BF", "jade": "5B9F7C", "lavender": "B4ACE0", "orange": "F78D42"}


def material(name, color, alpha=1.0):
    color = PALETTE.get(color, color).lstrip("#")
    def linear(v):
        v = int(v, 16) / 255
        return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4
    rgba = tuple(linear(color[i:i + 2]) for i in (0, 2, 4)) + (alpha,)
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = rgba
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = .8
    bsdf.inputs["Alpha"].default_value = alpha
    if alpha < 1:
        mat.surface_render_method = "BLENDED"
    return mat


def empty(name, parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    return obj


def ico(name, location, scale, mat, parent=None):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1)
    obj = bpy.context.object
    obj.name, obj.parent = name, parent
    obj.location, obj.scale = location, scale
    obj.data.materials.append(mat)
    return obj


def cone(name, location, radius, depth, mat, parent=None, tip=0):
    bpy.ops.mesh.primitive_cone_add(vertices=7, radius1=radius, radius2=tip, depth=depth)
    obj = bpy.context.object
    obj.name, obj.parent, obj.location = name, parent, location
    obj.data.materials.append(mat)
    return obj


def tube(name, points, radius, mat, parent=None):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions, curve.resolution_u, curve.bevel_depth, curve.bevel_resolution = "3D", 8, radius, 0
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, co in zip(spline.bezier_points, points):
        point.co, point.handle_left_type, point.handle_right_type = co, "AUTO", "AUTO"
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.data.materials.append(mat)
    return obj


def key(obj, frame, *channels):
    for channel in channels or ("location", "rotation_euler", "scale"):
        obj.keyframe_insert(data_path=channel, frame=frame)


def ease(x):
    x = max(0, min(1, x))
    return x * x * (3 - 2 * x)


def shadow(name, x, width=1, depth=.4):
    root = empty(name)
    root.location = (x, 0, .015)
    for i in range(3):
        bpy.ops.mesh.primitive_circle_add(vertices=32, radius=1, fill_type="NGON")
        obj = bpy.context.object
        obj.parent = root
        obj.location = (0, 0, i * .001)
        obj.scale = (width * (1 - i * .17), depth * (1 - i * .17), 1)
        obj.data.materials.append(material(name + str(i), "ink", .025))
    return root


def setup(name, seconds, center=1.5, width=13.2):
    args = argparse.ArgumentParser()
    args.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "renders" / name)
    args.add_argument("--preview", action="store_true")
    options = args.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = (960, 540) if options.preview else (1920, 1080)
    scene.render.resolution_percentage = 100
    scene.render.fps = FPS
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 15
    scene.eevee.taa_render_samples = 8 if options.preview else 16
    scene.eevee.use_raytracing = False
    scene.eevee.use_fast_gi = False
    scene.eevee.shadow_ray_count = 2
    scene.eevee.shadow_step_count = 4
    scene.render.use_sequencer = False
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (.48, .58, .7, 1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .35
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    for label, location, energy, size, color in [
        ("warm softbox", (-4, -6, 8), 1000, 7, (1, .81, .61)),
        ("mint fill", (5, -1, 5), 650, 6, (.69, 1, .92)),
        ("peach rim", (0, 5, 7), 1200, 5, (1, .63, .42)),
    ]:
        data = bpy.data.lights.new(label, "AREA")
        data.energy, data.shape, data.size, data.color = energy, "DISK", size, color
        obj = bpy.data.objects.new(label, data)
        bpy.context.collection.objects.link(obj)
        obj.location = location
        obj.rotation_euler = (Vector((0, 0, 1)) - obj.location).to_track_quat("-Z", "Y").to_euler()
    camera = bpy.data.objects.new("orthographic stage", bpy.data.cameras.new("stage lens"))
    bpy.context.collection.objects.link(camera)
    camera.location = (0, -20, 11)
    camera.rotation_euler = (Vector((0, 0, center)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type, camera.data.ortho_scale = "ORTHO", width
    scene.camera = camera
    scene.frame_start, scene.frame_end = 1, round(seconds * FPS)
    return scene, options


def endpoint_alpha(path):
    """Measure saved RGBA pixels, including tiny antialiased or shadow remnants."""
    image = bpy.data.images.load(str(path), check_existing=False)
    try:
        pixels = array("f", [0]) * len(image.pixels)
        image.pixels.foreach_get(pixels)
        alpha = pixels[3::4]
        visible = sum(a > 0 for a in alpha)
        return {"file": path.name, "visiblePixels": visible,
                "coveragePercent": 100 * visible / len(alpha), "maxAlpha": max(alpha)}
    finally:
        bpy.data.images.remove(image)


def finish(scene, options, name):
    """Render once to PNG, then encode that sequence through Blender's VSE, without rerendering 3D."""
    output = options.output.resolve() / ("preview" if options.preview else "")
    frames = output / "frames"
    frames.mkdir(parents=True, exist_ok=True)
    movie = output / f"{name}{'-preview' if options.preview else ''}.mov"
    movie.unlink(missing_ok=True)
    # Never mix an old, longer sequence with this invocation.
    for old in frames.glob("frame_*.png"):
        old.unlink()
    step = 2 if options.preview else 1
    fps = FPS // step
    start = time.perf_counter()
    paths = []
    for index, frame in enumerate(range(scene.frame_start, scene.frame_end + 1, step), 1):
        scene.frame_set(frame)
        path = frames / f"frame_{index:04d}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        paths.append(path)
        if index == 1 or index % 15 == 0:
            print(f"DEMO frame {index} / {scene.frame_end // step}", flush=True)
    render_seconds = time.perf_counter() - start
    endpoints = {"first": endpoint_alpha(paths[0]), "last": endpoint_alpha(paths[-1])}
    result = {"name": name, "prerendered": True, "engine": "EEVEE", "preview": options.preview,
              "width": scene.render.resolution_x, "height": scene.render.resolution_y, "fps": fps,
              "frames": len(paths), "durationSeconds": len(paths) / fps, "codec": "QuickTime PNG RGBA",
              "renderSeconds": round(render_seconds, 2), "endpoints": endpoints}
    if any(frame["visiblePixels"] for frame in endpoints.values()):
        result["status"] = "failed-endpoint-alpha"
        (output / "render.json").write_text(json.dumps(result, indent=2) + "\n")
        raise AssertionError("Overlay endpoints must be fully transparent: " + json.dumps(endpoints))
    encode = bpy.data.scenes.new("encode PNG alpha sequence")
    encode.render.resolution_x, encode.render.resolution_y = scene.render.resolution_x, scene.render.resolution_y
    encode.render.resolution_percentage, encode.render.fps = 100, fps
    encode.render.film_transparent = True
    encode.render.image_settings.media_type = "VIDEO"
    encode.render.image_settings.file_format = "FFMPEG"
    encode.render.ffmpeg.format, encode.render.ffmpeg.codec = "QUICKTIME", "PNG"
    encode.render.image_settings.color_mode = "RGBA"
    encode.render.filepath = str(movie)
    encode.render.use_sequencer = True
    # Already display-referred PNGs: do not apply the 3D view transform twice.
    encode.view_settings.view_transform = "Standard"
    editor = encode.sequence_editor_create()
    strip = editor.strips.new_image("rendered RGBA", str(paths[0]), channel=1, frame_start=1)
    for path in paths[1:]:
        strip.elements.append(path.name)
    strip.frame_final_duration = len(paths)
    strip.alpha_mode = "STRAIGHT"
    encode.frame_start, encode.frame_end = 1, len(paths)
    bpy.ops.render.render(animation=True, scene=encode.name)
    result.update(status="passed", totalSeconds=round(time.perf_counter() - start, 2))
    (output / "render.json").write_text(json.dumps(result, indent=2) + "\n")
    print("DEMO result " + json.dumps(result), flush=True)
