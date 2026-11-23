"""Baut die Winkekatze in Blender (bpy) und exportiert models/katze.glb.

Aufruf:  python tools/katze.py [ausgabe.glb] [vorschau.png]
(braucht das Python-Modul `bpy`, z. B. `pip install bpy`)

Koordinaten: Blender, Z oben, die Katze schaut nach -Y.
Die rechte Pfote der Katze (bei -X) winkt; ihr Objekt "Arm" hat den
Ursprung in der Schulter, damit Three.js um die X-Achse drehen kann.
"""
import math
import sys

import bpy  # noqa: I001 (bpy zuerst, sonst fehlt bmesh)
import bmesh
from mathutils import Matrix, Quaternion, Vector, noise
from mathutils.bvhtree import BVHTree

args = [a for a in sys.argv[1:] if not a.startswith("-")]
OUT = next((a for a in args if a.endswith(".glb")), "models/katze.glb")
PREVIEW = next((a for a in args if a.endswith(".png")), None)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
K = 1 / 0.6726  # Metaball: sichtbarer Radius -> Element-Radius (Schwelle 0.6)


# ---------------------------------------------------------------- Materialien
def material(name, color, rough=0.35, metal=0.0, emit=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = 1.0
    return m


M_KERAMIK = material("Keramik", (0.95, 0.93, 0.88), 0.18)
M_ROT = material("Rot", (0.38, 0.008, 0.01), 0.3)
M_GOLD = material("Gold", (1.0, 0.72, 0.25), 0.22, 1.0)
M_SCHWARZ = material("Schwarz", (0.015, 0.012, 0.012), 0.12)
M_ROSA = material("Rosa", (0.95, 0.45, 0.5), 0.35)
M_BAUCH = material("Bauch", (0.02, 0.0, 0.04), 0.1, emit=(0.05, 0.0, 0.1))
M_AUGE = material("Auge", (0.02, 0.015, 0.01), 0.08)

# Vertex-Farben (Kaliko-Flecken) im Keramik-Material verwenden, damit der
# glTF-Export sie mitnimmt.
_nt = M_KERAMIK.node_tree
_attr = _nt.nodes.new("ShaderNodeVertexColor")
_attr.layer_name = "Farbe"
_nt.links.new(_attr.outputs["Color"], _nt.nodes["Principled BSDF"].inputs["Base Color"])


def link(obj):
    scene.collection.objects.link(obj)
    return obj


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def smooth(obj):
    for p in obj.data.polygons:
        p.use_smooth = True


# ----------------------------------------------------------------- Metaballs
def quat_x_to(direction):
    return Vector((1, 0, 0)).rotation_difference(Vector(direction).normalized())


def metaball(name, elems, res=0.022):
    mb = bpy.data.metaballs.new(name)
    mb.resolution = res
    mb.render_resolution = res
    mb.threshold = 0.6
    obj = link(bpy.data.objects.new(name, mb))
    for el in elems:
        e = mb.elements.new()
        kind = el[0]
        if kind == "ball":
            _, co, r = el
            e.type = "BALL"
            e.co = co
            e.radius = r * K
        elif kind == "ell":
            _, co, size = el[:3]
            e.type = "ELLIPSOID"
            e.co = co
            e.radius = 1.0
            e.size_x, e.size_y, e.size_z = (s * K for s in size)
            if len(el) > 3:
                e.rotation = el[3]
        elif kind == "cap":  # Kapsel von a nach b mit Dicke r
            _, a, b, r = el
            a, b = Vector(a), Vector(b)
            e.type = "CAPSULE"
            e.co = (a + b) / 2
            e.radius = r * K
            e.size_x = (b - a).length / 2
            e.rotation = quat_x_to(b - a)
    return obj


def to_mesh(obj, name, decimate=0.35):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    me.name = name
    new = link(bpy.data.objects.new(name, me))
    bpy.data.objects.remove(obj)
    if decimate < 1:
        mod = new.modifiers.new("dec", "DECIMATE")
        mod.ratio = decimate
        bpy.context.view_layer.objects.active = new
        new.select_set(True)
        bpy.ops.object.modifier_apply(modifier="dec")
    smooth(new)
    return new


# -------------------------------------------------------------------- Körper
koerper = metaball("KoerperMB", [
    ("ell", (0, 0.02, 0.62), (0.56, 0.47, 0.6)),       # Rumpf
    ("ell", (0, 0.06, 0.3), (0.66, 0.54, 0.31)),       # Sitzfläche
    ("ell", (0, 0.0, 1.52), (0.66, 0.55, 0.5)),        # Kopf
    ("ball", (0.3, -0.22, 1.36), 0.27),                # Backen
    ("ball", (-0.3, -0.22, 1.36), 0.27),
    ("ell", (0, -0.4, 1.39), (0.17, 0.12, 0.11)),      # Schnauze
    ("ell", (0.24, -0.4, 0.1), (0.15, 0.19, 0.11)),    # Vorderpfoten
    ("ell", (-0.24, -0.4, 0.1), (0.15, 0.19, 0.11)),
    ("ell", (0.48, 0.1, 0.16), (0.2, 0.3, 0.16)),      # Hinterbeine
    ("ell", (-0.48, 0.1, 0.16), (0.2, 0.3, 0.16)),
    ("cap", (0.5, -0.08, 0.98), (0.47, -0.38, 0.7), 0.12),  # linker Arm (Münze)
    ("ell", (0.47, -0.43, 0.7), (0.14, 0.12, 0.13)),         # linke Pfote
    ("cap", (0.25, 0.52, 0.18), (0.55, 0.5, 0.42), 0.09),    # Schwanz
    ("ball", (0.58, 0.48, 0.48), 0.1),
])
koerper = to_mesh(koerper, "Katze", 0.5)
assign(koerper, M_KERAMIK)

SCHULTER = Vector((-0.47, -0.04, 1.0))
arm = metaball("ArmMB", [
    ("cap", tuple(SCHULTER), (-0.64, -0.16, 1.6), 0.125),
    ("ell", (-0.67, -0.2, 1.68), (0.17, 0.13, 0.17)),   # Pfote
    ("ball", (-0.6, -0.31, 1.62), 0.06),                 # Ballen
])
arm = to_mesh(arm, "Arm", 0.35)
arm.data.transform(Matrix.Translation(-SCHULTER))
arm.location = SCHULTER
assign(arm, M_KERAMIK)

# Raycast-Hilfe auf der Oberfläche des Körpers
_bm = bmesh.new()
_bm.from_mesh(koerper.data)
BVH = BVHTree.FromBMesh(_bm)


def surf(x, z, off=0.0):
    hit, nrm, _, _ = BVH.ray_cast(Vector((x, -3, z)), Vector((0, 1, 0)))
    if hit is None:
        raise RuntimeError(f"kein Treffer bei {x},{z}")
    return hit + nrm * off, nrm


# ------------------------------------------------------------- Kaliko-Farben
FLECKEN = [  # (Mitte, Radius, Farbe)
    (Vector((-0.45, -0.05, 1.85)), 0.42, (0.8, 0.3, 0.05)),   # orange ums rechte Ohr
    (Vector((0.38, 0.25, 1.55)), 0.3, (0.07, 0.06, 0.06)),     # schwarz am Hinterkopf
    (Vector((-0.45, 0.38, 0.55)), 0.4, (0.8, 0.3, 0.05)),     # orange am Rücken
    (Vector((0.5, 0.35, 0.25)), 0.32, (0.07, 0.06, 0.06)),     # schwarz an der Hüfte
]
WEISS = (0.97, 0.95, 0.9)


def faerben(obj, flecken):
    me = obj.data
    attr = me.color_attributes.new("Farbe", "BYTE_COLOR", "CORNER")
    mw = obj.matrix_world
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = mw @ me.vertices[me.loops[li].vertex_index].co
            col = WEISS
            for c, r, fc in flecken:
                d = (co - c).length + 0.12 * noise.noise(co * 4.0)
                if d < r:
                    col = fc
            attr.data[li].color = (*col, 1)
    me.color_attributes.active_color = attr


faerben(koerper, FLECKEN)
faerben(arm, FLECKEN)

# ---------------------------------------------------------------------- Ohren
def cone(name, base, tip, r, mat, segs=24):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=0.012,
                          depth=(Vector(tip) - Vector(base)).length)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    obj = link(bpy.data.objects.new(name, me))
    d = Vector(tip) - Vector(base)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d)
    obj.location = Vector(base) + d / 2
    mod = obj.modifiers.new("sub", "SUBSURF")
    mod.levels = 2
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier="sub")
    assign(obj, mat)
    smooth(obj)
    return obj


ohren = []
for s in (1, -1):
    o = cone("Ohr", (0.36 * s, 0.02, 1.8), (0.5 * s, -0.02, 2.2), 0.19, M_KERAMIK)
    ohren.append(o)
    i = cone("OhrInnen", (0.36 * s, -0.08, 1.84), (0.48 * s, -0.1, 2.12), 0.11, M_ROSA)
    i.scale = (1, 0.35, 1)
faerben(ohren[1], FLECKEN)  # rechtes Ohr orange
faerben(ohren[0], [])


# ---------------------------------------------------------------- Gesicht
def ellipsoid(name, center, size, mat, normal=None, segs=32):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=segs // 2, radius=1)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    obj = link(bpy.data.objects.new(name, me))
    obj.scale = size
    obj.location = center
    if normal is not None:
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = Vector((0, -1, 0)).rotation_difference(normal)
    assign(obj, mat)
    smooth(obj)
    return obj


def tube(name, pts, r, mat):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = r
    cu.bevel_resolution = 4
    cu.use_fill_caps = True
    sp = cu.splines.new("POLY")
    sp.points.add(len(pts) - 1)
    for p, co in zip(sp.points, pts):
        p.co = (*co, 1)
    obj = link(bpy.data.objects.new(name, cu))
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    m = link(bpy.data.objects.new(name, me))
    bpy.data.objects.remove(obj)
    assign(m, mat)
    smooth(m)
    return m


for s in (1, -1):  # Augen
    p, n = surf(0.22 * s, 1.56, 0.0)
    ellipsoid("Auge", p, (0.085, 0.045, 0.105), M_AUGE, n)
    p, n = surf(0.24 * s, 1.75, 0.01)            # Brauen-Punkte (rot)
    ellipsoid("Braue", p, (0.05, 0.02, 0.025), M_ROT, n)

p, n = surf(0, 1.43, 0.0)                         # Nase
ellipsoid("Nase", p, (0.05, 0.03, 0.035), M_ROSA, n)

mund = []                                         # Mund "ω"
for i in range(21):
    t = i / 20
    x = -0.1 + 0.2 * t
    z = 1.36 - 0.035 * math.sin(t * math.pi * 2) ** 2
    mund.append(surf(x, z, 0.008)[0])
tube("Mund", mund, 0.008, M_SCHWARZ)

for s in (1, -1):                                 # Schnurrhaare
    for k, dz in enumerate((0.03, -0.01, -0.05)):
        a, _ = surf(0.2 * s, 1.4 + dz, -0.01)
        b = a + Vector((0.42 * s, -0.08, dz * 2.2 - 0.02 * k))
        tube("Schnurrhaar", [a, a.lerp(b, 0.5) + Vector((0, -0.02, 0.01)), b], 0.006, M_SCHWARZ)

# ----------------------------------------------------- Halsband, Glocke, Münze
def radius_at(z, direction):
    d = Vector(direction)
    hit, _, _, _ = BVH.ray_cast(-d * 3 + Vector((0, 0, z)), d)
    return (hit - Vector((0, 0, z))).length


HZ = 1.1
rx = radius_at(HZ, (-1, 0, 0))
ry = radius_at(HZ, (0, 1, 0))
ry_back = radius_at(HZ, (0, -1, 0))
halsband = []
for i in range(97):
    a = 2 * math.pi * i / 96
    yr = ry if math.sin(a) < 0 else ry_back
    halsband.append(Vector((rx * 0.97 * math.cos(a), yr * 0.97 * math.sin(a), HZ - 0.02)))
tube("Halsband", halsband, 0.055, M_ROT)

gp, gn = surf(0, 1.0, 0.05)
glocke = ellipsoid("Glocke", gp, (0.105, 0.105, 0.1), M_GOLD)
ellipsoid("GlockeSchlitz", gp + Vector((0, -0.095, -0.03)), (0.06, 0.01, 0.012), M_SCHWARZ)

koban = ellipsoid("Koban", (0.6, -0.47, 0.66), (0.15, 0.03, 0.24), M_GOLD, segs=48)
koban.rotation_mode = "XYZ"
koban.rotation_euler = (0.1, 0, -0.12)

# ------------------------------------------------------- Bauchfenster + Ring
BP, BN = surf(0, 0.6, 0.0)
FR = 0.265         # Radius des Fensters
u = BN.cross(Vector((0, 0, 1))).normalized()
v = BN.cross(u).normalized()


def projiziert(rr, phi, off):
    start = BP + BN * 0.6 + (u * math.cos(phi) + v * math.sin(phi)) * rr
    hit, nrm, _, _ = BVH.ray_cast(start, -BN)
    return hit + nrm * off


bm = bmesh.new()
uv_layer = bm.loops.layers.uv.new("UVMap")
RINGS, SEGS = 16, 72
grid = [[(bm.verts.new(projiziert(0, 0, 0.012)), 0.5, 0.5)]]
for i in range(1, RINGS + 1):
    row = []
    for j in range(SEGS):
        phi = 2 * math.pi * j / SEGS
        t = i / RINGS
        row.append((bm.verts.new(projiziert(FR * t, phi, 0.012)),
                    0.5 + 0.5 * t * math.cos(phi), 0.5 + 0.5 * t * math.sin(phi)))
    grid.append(row)
for j in range(SEGS):
    tri = (grid[0][0], grid[1][j], grid[1][(j + 1) % SEGS])
    f = bm.faces.new([x[0] for x in tri])
    for loop, src in zip(f.loops, tri):
        loop[uv_layer].uv = (src[1], src[2])
for i in range(1, RINGS):
    for j in range(SEGS):
        q = (grid[i][j], grid[i + 1][j], grid[i + 1][(j + 1) % SEGS], grid[i][(j + 1) % SEGS])
        f = bm.faces.new([x[0] for x in q])
        for loop, src in zip(f.loops, q):
            loop[uv_layer].uv = (src[1], src[2])
bm.normal_update()
me = bpy.data.meshes.new("Bauch")
bm.to_mesh(me)
bauch = link(bpy.data.objects.new("Bauch", me))
for poly in me.polygons:
    if poly.normal.dot(BN) < 0:
        poly.flip()
assign(bauch, M_BAUCH)
smooth(bauch)

tube("Bauchring", [projiziert(FR + 0.012, 2 * math.pi * j / 120, 0.02) for j in range(121)],
     0.03, M_GOLD)

# ---------------------------------------------------------------- Export
for o in scene.objects:
    o.select_set(o.type == "MESH")
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True,
                          export_apply=True, export_vertex_color="ACTIVE",
                          export_yup=True)
info = {o.name: len(o.data.polygons) for o in scene.objects if o.type == "MESH"}
print("EXPORT", OUT, sum(info.values()), "Flächen", "Bauchmitte", tuple(round(c, 3) for c in BP))

# ---------------------------------------------------------------- Vorschau
if PREVIEW:
    cam = link(bpy.data.objects.new("Kamera", bpy.data.cameras.new("Kamera")))
    cam.location = (1.6, -4.6, 1.6)
    cam.rotation_euler = (math.radians(87), 0, math.radians(19))
    cam.data.lens = 50
    scene.camera = cam
    for loc, energy in (((2.5, -3, 4), 900), ((-3, -2, 2), 300), ((0, 3, 3), 500)):
        L = link(bpy.data.objects.new("Licht", bpy.data.lights.new("Licht", "AREA")))
        L.location = loc
        L.data.energy = energy
        L.data.size = 2
        L.rotation_euler = (Vector((0, 0, 1.1)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    world = bpy.data.worlds.new("W")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.05, 0.04, 0.05, 1)
    scene.world = world
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 24
    scene.cycles.device = "CPU"
    scene.render.resolution_x = 700
    scene.render.resolution_y = 800
    scene.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)
    print("VORSCHAU", PREVIEW)
