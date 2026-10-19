"""
notched_cube_stack.py
─────────────────────
Blender Python script — exploded axonometric stack:

  [Upper dome]             ← larger, flatter, most transparent
  [Dome]                   ← hovers above floating slabs (SubSubLayer footprint)
  [Small floating slabs]   ← Float_i_j, above corner notches
        ↑ Dashes_i_j
  [4×4 base slab layer]    ← floats above sub-layer
        ↑ SubLayer_Dashes
  [SubLayer shell]         ← cavity = base layer footprint
        ↑ SubSubLayer_Dashes
  [SubSubLayer shell]      ← cavity = sub-layer outer footprint

HOW TO RUN
  Blender → Scripting workspace → open this file → Run Script
  (Scene is cleared first — Ctrl+Z to undo.)
"""

import bpy
import bmesh
import math
import mathutils

# ══════════════════════════════════════════════════════════════
#  CONFIG
# ══════════════════════════════════════════════════════════════

CUBE_SIZE      = 2.0              # XY side length of each slab
CUBE_HEIGHT    = CUBE_SIZE / 2    # Z height of each slab (half of XY)
WALL_THICKNESS = 0.1              # solid wall remaining around corner notches
NOTCH_FRACTION = 1 - (WALL_THICKNESS / (CUBE_SIZE / 2))  # derived

# Floating slabs above corner notches
FLOAT_GAP      = 1.5              # gap: base slab top → float slab bottom

# Thin shell sub-layer
SHELL_HEIGHT   = 0.2              # total Z height of the shell
SHELL_MARGIN   = 0.5              # XY border beyond the base layer footprint
SHELL_WALL_Z   = 0.05             # floor thickness left at the bottom of the shell
BASE_FLOAT_GAP = 1.5              # gap: shell top → base layer bottom

# Dashes (shared by both connector sets)
DASH_LENGTH    = 0.2
DASH_GAP       = 0.15
DASH_THICKNESS = 0.03

GRID_X         = 4
GRID_Y         = 4
ARRAY_SPACING  = 1.0              # 1.0 = touching slabs (solid base layer)
CAM_DISTANCE    = 45.0
CAM_ORTHO_SCALE = 18.0            # increase to zoom out, decrease to zoom in
CAM_POS         = (21, -36, 14)   # camera world position

# Layer colours — edit freely.  Matched in order against object name substrings.
LAYER_COLORS = [
    ("SubSubLayer", (0.18, 0.06, 0.52)),   # deep violet    (lowest)
    ("SubLayer",    (0.04, 0.52, 0.45)),   # jade teal
    ("Slab_",       (0.25, 0.52, 0.72)),   # steel blue
    ("Dashes",      (0.20, 0.42, 0.60)),   # darker blue — matches Dashes_ and DashesB_
    ("Float",       (0.95, 0.62, 0.15)),   # warm amber — matches Float_ and FloatB_
]

# Domes — stacked with vertical gaps between each
DOME_GAP      = 0.5                # gap: float slab top → lower dome rim
DOME_HEIGHT   = 2.0                # Z height of lower dome
DOME_OVERSIZE = 1.2                # XY scale over SubSubLayer footprint
DOME_ALPHA    = 0.2
DOME_COLOR    = (0.18, 0.72, 0.62)  # lighter jade teal (lighter shade of Serverless Hosting)

DOME_SPACING        = -1.2         # vertical gap between each dome's top and next dome's base

UPPER_DOME_HEIGHT   = 2.5
UPPER_DOME_OVERSIZE = 1.7
UPPER_DOME_ALPHA    = 0.4
UPPER_DOME_COLOR    = (0.02, 0.12, 0.92)  # intense blue

OUTER_DOME_HEIGHT   = 3.0
OUTER_DOME_OVERSIZE = 2.0
OUTER_DOME_ALPHA    = 0.3
OUTER_DOME_COLOR    = (0.62, 0.04, 0.52)  # red-purple

# ══════════════════════════════════════════════════════════════


def _get_bsdf(mat):
    """Return the Principled BSDF node, found by type (locale-safe)."""
    return next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)


def _make_material(name, color_rgba, roughness=0.35, alpha=1.0,
                   transmission=0.0, blend=False):
    """Create a Principled BSDF material, compatible with Blender 3.x and 4.x."""
    mat           = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    if blend:
        try:
            mat.blend_method = 'BLEND'   # removed in Blender 4.2+
        except AttributeError:
            pass
    bsdf = _get_bsdf(mat)
    if bsdf is None:
        return mat
    bsdf.inputs["Base Color"].default_value = color_rgba
    bsdf.inputs["Roughness"].default_value  = roughness
    bsdf.inputs["Alpha"].default_value      = alpha
    for tx_name in ("Transmission Weight", "Transmission"):
        tx = bsdf.inputs.get(tx_name)
        if tx:
            tx.default_value = transmission
            break
    return mat


def setup_lighting():
    """Sun key light + softer fill light + grey world background."""
    # Key light — from upper-right-front (matches isometric view angle)
    key      = bpy.data.lights.new(name="KeyLight", type='SUN')
    key.energy = 4.0
    key_obj  = bpy.data.objects.new("KeyLight", key)
    bpy.context.scene.collection.objects.link(key_obj)
    key_obj.rotation_euler = (math.radians(50), math.radians(0), math.radians(45))

    # Fill light — from upper-left, softer
    fill     = bpy.data.lights.new(name="FillLight", type='SUN')
    fill.energy = 1.5
    fill_obj = bpy.data.objects.new("FillLight", fill)
    bpy.context.scene.collection.objects.link(fill_obj)
    fill_obj.rotation_euler = (math.radians(60), math.radians(0), math.radians(-135))

    # World background — pure white; rebuild node tree to guarantee the colour
    world = bpy.context.scene.world
    if world is None:
        world = bpy.data.worlds.new("World")
        bpy.context.scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    bg_node  = nt.nodes.new('ShaderNodeBackground')
    out_node = nt.nodes.new('ShaderNodeOutputWorld')
    bg_node.inputs['Color'].default_value    = (1.0, 1.0, 1.0, 1.0)
    bg_node.inputs['Strength'].default_value = 1.0
    nt.links.new(bg_node.outputs['Background'], out_node.inputs['Surface'])


def clear_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for col in (bpy.data.meshes, bpy.data.cameras, bpy.data.lights, bpy.data.materials):
        for item in list(col):
            col.remove(item)


def make_slab(location, name):
    """CUBE_SIZE × CUBE_SIZE × CUBE_HEIGHT rectangular prism."""
    # Create at origin so obj.location is a reliable property (primitive_cube_add
    # bakes its location arg into vertex coords in script context, leaving obj.location=0).
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (CUBE_SIZE, CUBE_SIZE, CUBE_HEIGHT)
    bpy.ops.object.transform_apply(scale=True)
    obj.location = location   # set AFTER scale bake — now obj.location is trustworthy
    return obj


def _make_box(location, sx, sy, sz, name):
    """Generic rectangular prism of dimensions sx × sy × sz."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(scale=True)
    return obj


def _boolean_cut(base, cutter):
    """Apply a Boolean Difference from cutter onto base, then delete cutter."""
    bpy.context.view_layer.objects.active = base
    bpy.ops.object.mode_set(mode='OBJECT')
    mod           = base.modifiers.new(name="_cut", type='BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.object    = cutter
    mod.solver    = 'EXACT'
    bpy.ops.object.modifier_apply(modifier="_cut")
    bpy.data.objects.remove(cutter, do_unlink=True)


def _make_dashes(corners_xy, z_start, z_end, name):
    """
    Create joined dash segments at each (x, y) in corners_xy,
    spanning z_start → z_end vertically.
    """
    dash_objects = []
    for (x, y) in corners_xy:
        z = z_start
        while z < z_end:
            seg = min(DASH_LENGTH, z_end - z)
            bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z + seg / 2))
            d = bpy.context.active_object
            d.scale = (DASH_THICKNESS, DASH_THICKNESS, seg)
            bpy.ops.object.transform_apply(scale=True)
            dash_objects.append(d)
            z += seg + DASH_GAP

    bpy.ops.object.select_all(action='DESELECT')
    for d in dash_objects:
        d.select_set(True)
    bpy.context.view_layer.objects.active = dash_objects[0]
    bpy.ops.object.join()
    bpy.context.active_object.name = name
    return bpy.context.active_object


def cut_notch(obj, notch_pos):
    """
    Boolean-subtract a proportional notch from obj.

    notch_pos (x, y, z): each value in [-1, 1]
      0  = centred on that axis
      ±1 = flush with that face
    """
    notch_xy = CUBE_SIZE   * NOTCH_FRACTION
    notch_z  = CUBE_HEIGHT * NOTCH_FRACTION
    offsets  = [
        notch_pos[0] * (CUBE_SIZE   / 2 - notch_xy / 2),
        notch_pos[1] * (CUBE_SIZE   / 2 - notch_xy / 2),
        notch_pos[2] * (CUBE_HEIGHT / 2 - notch_z  / 2),
    ]
    cutter_loc = tuple(obj.location[a] + offsets[a] for a in range(3))
    cutter = _make_box(cutter_loc, notch_xy, notch_xy, notch_z, "_cutter_tmp")
    _boolean_cut(obj, cutter)


def place_floating_slab(base_obj, notch_pos, name):
    """Slab sized to the notch, hovering FLOAT_GAP above base_obj."""
    notch_xy = CUBE_SIZE   * NOTCH_FRACTION
    notch_z  = CUBE_HEIGHT * NOTCH_FRACTION
    ox = notch_pos[0] * (CUBE_SIZE   / 2 - notch_xy / 2)
    oy = notch_pos[1] * (CUBE_SIZE   / 2 - notch_xy / 2)
    oz = base_obj.location.z + CUBE_HEIGHT / 2 + FLOAT_GAP / 2 + notch_z / 2
    return _make_box(
        (base_obj.location.x + ox, base_obj.location.y + oy, oz),
        notch_xy, notch_xy, notch_z,
        name,
    )


def add_dashed_connectors(base_obj, notch_pos, name):
    """Four dashed lines: top corners of notch → bottom corners of float slab."""
    notch_xy = CUBE_SIZE * NOTCH_FRACTION
    hw = notch_xy / 2
    cx = base_obj.location.x + notch_pos[0] * (CUBE_SIZE / 2 - hw)
    cy = base_obj.location.y + notch_pos[1] * (CUBE_SIZE / 2 - hw)
    z_start = base_obj.location.z + CUBE_HEIGHT / 2
    z_end   = z_start + FLOAT_GAP
    corners = [
        (cx - hw, cy - hw), (cx + hw, cy - hw),
        (cx - hw, cy + hw), (cx + hw, cy + hw),
    ]
    return _make_dashes(corners, z_start, z_end, name)


def _create_shell_layer(cavity_w, cavity_d, cx, cy,
                        above_bottom_z, above_height, name_prefix):
    """
    Generic shell layer: flat tray + vertical walls + dashed connectors.

    cavity_w, cavity_d : XY size of the central cavity
                         (= outer footprint of the layer directly above)
    cx, cy             : XY centre of this shell
    above_bottom_z     : Z of the bottom face of the layer directly above
    above_height       : height of that layer (used to size the walls)
    name_prefix        : e.g. "SubLayer" or "SubSubLayer"

    Returns the shell slab object.
    The shell bottom is at:  above_bottom_z − BASE_FLOAT_GAP − SHELL_HEIGHT
    """
    outer_w  = cavity_w + 2 * SHELL_MARGIN
    outer_d  = cavity_d + 2 * SHELL_MARGIN
    shell_z  = above_bottom_z - BASE_FLOAT_GAP - SHELL_HEIGHT / 2

    # ── Flat tray ─────────────────────────────────────────────
    shell = _make_box((cx, cy, shell_z), outer_w, outer_d, SHELL_HEIGHT,
                      f"{name_prefix}_Shell")

    # ── Cavity notch (open from top, thin floor) ───────────────
    notch_z  = SHELL_HEIGHT - SHELL_WALL_Z
    notch_cz = shell_z + SHELL_WALL_Z / 2   # top of notch = top of shell
    cutter   = _make_box((cx, cy, notch_cz), cavity_w, cavity_d, notch_z,
                         "_shell_cutter_tmp")
    _boolean_cut(shell, cutter)

    # ── Vertical walls ─────────────────────────────────────────
    # Anchor at shell top, rise 1/4 of (gap + above layer height).
    shell_top_z = above_bottom_z - BASE_FLOAT_GAP   # = shell_z + SHELL_HEIGHT/2
    wall_h      = (BASE_FLOAT_GAP + above_height) / 4
    wall_cz     = shell_top_z + wall_h / 2

    # Left/right span full outer depth (covers corners).
    # Front/back span inner cavity width only (no corner overlap).
    wall_specs = [
        (cx - cavity_w / 2 - SHELL_MARGIN / 2, cy,                               SHELL_MARGIN, outer_d,      wall_h),  # left
        (cx + cavity_w / 2 + SHELL_MARGIN / 2, cy,                               SHELL_MARGIN, outer_d,      wall_h),  # right
        (cx,                                    cy - cavity_d / 2 - SHELL_MARGIN / 2, cavity_w, SHELL_MARGIN, wall_h),  # front
        (cx,                                    cy + cavity_d / 2 + SHELL_MARGIN / 2, cavity_w, SHELL_MARGIN, wall_h),  # back
    ]
    wall_pieces = [
        _make_box((wx, wy, wall_cz), sx, sy, sz, "_wall_tmp")
        for wx, wy, sx, sy, sz in wall_specs
    ]
    bpy.ops.object.select_all(action='DESELECT')
    for w in wall_pieces:
        w.select_set(True)
    bpy.context.view_layer.objects.active = wall_pieces[0]
    bpy.ops.object.join()
    bpy.context.active_object.name = f"{name_prefix}_Walls"

    # ── Dashed connectors: shell cavity corners → layer-above bottom corners
    hw = cavity_w / 2
    hd = cavity_d / 2
    corners = [
        (cx - hw, cy - hd), (cx + hw, cy - hd),
        (cx - hw, cy + hd), (cx + hw, cy + hd),
    ]
    _make_dashes(corners, shell_top_z, above_bottom_z, f"{name_prefix}_Dashes")

    return shell


def create_shell_layers():
    """
    Build the sub-layer and sub-sub-layer beneath the base grid.

    Each layer's cavity matches the outer footprint of the layer above it:
      SubLayer    cavity = base layer footprint
      SubSubLayer cavity = SubLayer outer footprint
    """
    step    = CUBE_SIZE * ARRAY_SPACING
    grid_cx = (GRID_X - 1) * step / 2
    grid_cy = (GRID_Y - 1) * step / 2
    fp_w    = GRID_X * step
    fp_d    = GRID_Y * step

    # ── Sub-layer ─────────────────────────────────────────────
    sub_shell = _create_shell_layer(
        cavity_w       = fp_w,
        cavity_d       = fp_d,
        cx             = grid_cx,
        cy             = grid_cy,
        above_bottom_z = -CUBE_HEIGHT / 2,
        above_height   = CUBE_HEIGHT,
        name_prefix    = "SubLayer",
    )

    # ── Sub-sub-layer ─────────────────────────────────────────
    # Cavity = sub-layer's outer footprint; sits below the sub-layer shell.
    sub_bottom_z = -CUBE_HEIGHT / 2 - BASE_FLOAT_GAP - SHELL_HEIGHT
    _create_shell_layer(
        cavity_w       = fp_w  + 2 * SHELL_MARGIN,
        cavity_d       = fp_d  + 2 * SHELL_MARGIN,
        cx             = grid_cx,
        cy             = grid_cy,
        above_bottom_z = sub_bottom_z,
        above_height   = SHELL_HEIGHT,
        name_prefix    = "SubSubLayer",
    )

    return sub_shell


def create_lotus(cx, cy, base_z, name="Lotus_center"):
    """
    Stylised lotus flower rooted at (cx, cy, base_z).
    Yellow central pod + three rings of white petals (6 / 8 / 10).

    Each petal is a tilted ellipsoid placed so its INNER END is at radius
    `base_r` (near the pod) and its outer tip extends away.  This creates
    the "pinched base / fanning tip" shape of a real lotus petal.

    Geometry:  inner-end z  = base_z   (flush with slab top)
               center z     = base_z + sy*sin(rx)
               outer-tip z  = base_z + 2*sy*sin(rx)
    """
    core_mat  = _make_material("LotusCoreMat",  (1.00, 0.88, 0.10, 1.0), roughness=0.20)
    petal_mat = _make_material("LotusPetalMat", (1.00, 0.42, 0.02, 1.0), roughness=0.08)
    parts = []

    def _ellipsoid(loc, scale_xyz, rx, rz):
        bpy.ops.mesh.primitive_uv_sphere_add(
            radius=1, segments=10, ring_count=5, location=(0, 0, 0)
        )
        obj = bpy.context.active_object
        obj.scale          = scale_xyz
        obj.rotation_euler = (rx, 0.0, rz)
        bpy.ops.object.transform_apply(rotation=True, scale=True)
        obj.location = loc
        obj.data.materials.append(petal_mat)
        obj.name = "_lotus_part"
        parts.append(obj)

    def _petal(base_r, scale_xyz, rx, angle):
        """
        Place ellipsoid so its inner end sits at radius base_r and z = base_z.
        center_r = base_r + sy*cos(rx)   (shift outward by half projected length)
        loc_z    = base_z + sy*sin(rx)   (raise center so inner end = base_z)
        """
        sy       = scale_xyz[1]
        center_r = base_r + sy * math.cos(rx)
        loc_z    = base_z + sy * math.sin(rx)
        _ellipsoid(
            loc       = (cx + center_r * math.cos(angle),
                         cy + center_r * math.sin(angle),
                         loc_z),
            scale_xyz = scale_xyz,
            rx        = rx,
            rz        = angle - math.pi / 2,
        )

    # ── Central pod — yellow ───────────────────────────────────
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=1, segments=14, ring_count=7, location=(0, 0, 0)
    )
    pod = bpy.context.active_object
    pod.scale = (0.38, 0.38, 0.22)
    bpy.ops.object.transform_apply(scale=True)
    pod.location = (cx, cy, base_z + 0.15)
    pod.data.materials.append(core_mat)
    pod.name = "_lotus_part"
    parts.append(pod)

    # ── Ring 1 — 6 petals, upright cup ────────────────────────
    #   inner end at r=0.05, tip reaches r≈0.85, tip_z≈base_z+1.15
    for k in range(6):
        _petal(0.05, (0.15, 0.70, 0.10), math.radians(55), 2 * math.pi * k / 6)

    # ── Ring 2 — 8 petals, staggered, mid-spread ──────────────
    #   inner end at r=0.10, tip reaches r≈1.48, tip_z≈base_z+1.16
    for k in range(8):
        _petal(0.10, (0.20, 0.90, 0.07), math.radians(40),
               2 * math.pi * k / 8 + math.pi / 8)

    # ── Ring 3 — 10 petals, staggered, nearly flat ────────────
    #   inner end at r=0.15, tip reaches r≈2.22, tip_z≈base_z+0.75
    for k in range(10):
        _petal(0.15, (0.26, 1.10, 0.05), math.radians(20),
               2 * math.pi * k / 10 + math.pi / 10)

    # ── Join + smooth shading ──────────────────────────────────
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    lotus = bpy.context.active_object
    lotus.name = name
    for poly in lotus.data.polygons:
        poly.use_smooth = True

    # ── Stem — 4 tight dashes, slab top → lotus base ──────────
    stem_hw = 0.12
    _make_dashes(
        [(cx - stem_hw, cy - stem_hw), (cx + stem_hw, cy - stem_hw),
         (cx - stem_hw, cy + stem_hw), (cx + stem_hw, cy + stem_hw)],
        CUBE_HEIGHT / 2, base_z,
        "DashesC_stem",
    )
    return lotus


def build_grid():
    """
    4×4 base slab layer.  Corner slabs get a centred top notch,
    a floating slab above, and dashed connectors between them.

         ┌───┬───┬───┬───┐
         │ ○ │   │   │ ○ │   ○ = notch + float + dashes
         ├───┼───┼───┼───┤
         │   │   │   │   │
         ├───┼───┼───┼───┤
         │   │   │   │   │
         ├───┼───┼───┼───┤
         │ ○ │   │   │ ○ │
         └───┴───┴───┴───┘
    """
    step  = CUBE_SIZE * ARRAY_SPACING
    nx, ny = GRID_X - 1, GRID_Y - 1

    # (grid_x, grid_y) → notch_pos  — edit freely to target any slab
    notched_slabs = {
        (0,  0 ): (0, 0, 1),
        (nx, 0 ): (0, 0, 1),
        (0,  ny): (0, 0, 1),
        (nx, ny): (0, 0, 1),
    }

    for i in range(GRID_X):
        for j in range(GRID_Y):
            slab = make_slab((i * step, j * step, 0.0), f"Slab_{i}_{j}")
            if (i, j) in notched_slabs:
                npos = notched_slabs[(i, j)]
                cut_notch(slab, npos)
                place_floating_slab(slab, npos, f"Float_{i}_{j}")
                add_dashed_connectors(slab, npos, f"Dashes_{i}_{j}")

    # Three additional upper floats — fill the corners where Float_ may not survive
    notch_xy = CUBE_SIZE   * NOTCH_FRACTION
    notch_z  = CUBE_HEIGHT * NOTCH_FRACTION
    upper_oz = CUBE_HEIGHT / 2 + FLOAT_GAP / 2 + notch_z / 2
    hw       = notch_xy / 2
    for (i, j) in [(nx, 0), (0, ny), (nx, ny)]:
        cx = i * step
        cy = j * step
        _make_box((cx, cy, upper_oz), notch_xy, notch_xy, notch_z, f"FloatB_{i}_{j}")
        corners = [
            (cx - hw, cy - hw), (cx + hw, cy - hw),
            (cx - hw, cy + hw), (cx + hw, cy + hw),
        ]
        _make_dashes(corners, CUBE_HEIGHT / 2, CUBE_HEIGHT / 2 + FLOAT_GAP, f"DashesB_{i}_{j}")

    # Center float — inward-corner notch on each of the 4 surrounding slabs + 1 shared float
    grid_cx = (GRID_X - 1) * step / 2
    grid_cy = (GRID_Y - 1) * step / 2
    center_notches = {
        (nx // 2,     ny // 2    ): ( 1,  1, 1),   # Slab_1_1 → notch toward +x,+y
        (nx // 2 + 1, ny // 2    ): (-1,  1, 1),   # Slab_2_1 → notch toward -x,+y
        (nx // 2,     ny // 2 + 1): ( 1, -1, 1),   # Slab_1_2 → notch toward +x,-y
        (nx // 2 + 1, ny // 2 + 1): (-1, -1, 1),   # Slab_2_2 → notch toward -x,-y
    }
    for (i, j), npos in center_notches.items():
        slab = bpy.data.objects.get(f"Slab_{i}_{j}")
        if slab:
            cut_notch(slab, npos)
    create_lotus(grid_cx, grid_cy, upper_oz)


def create_dome():
    """
    Flattened transparent hemisphere spanning the SubSubLayer outer footprint,
    hovering DOME_GAP above the top of the floating corner slabs.
    """
    step    = CUBE_SIZE * ARRAY_SPACING
    grid_cx = (GRID_X - 1) * step / 2
    grid_cy = (GRID_Y - 1) * step / 2
    fp_w    = GRID_X * step
    fp_d    = GRID_Y * step

    dome_rx = (fp_w + 4 * SHELL_MARGIN) / 2 * DOME_OVERSIZE
    dome_ry = (fp_d + 4 * SHELL_MARGIN) / 2 * DOME_OVERSIZE

    notch_z     = CUBE_HEIGHT * NOTCH_FRACTION
    float_top_z = CUBE_HEIGHT / 2 + FLOAT_GAP + notch_z
    dome_base_z = float_top_z + DOME_GAP

    # ── Sphere scaled to ellipsoid ──────────────────────────────
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=1, segments=64, ring_count=32,
        location=(grid_cx, grid_cy, dome_base_z),
    )
    dome = bpy.context.active_object
    dome.name = "Dome"
    dome.scale = (dome_rx, dome_ry, DOME_HEIGHT)
    bpy.ops.object.transform_apply(scale=True)

    # ── Cut lower hemisphere ────────────────────────────────────
    big    = 2 * max(dome_rx, dome_ry, DOME_HEIGHT) + 2
    cutter = _make_box(
        (grid_cx, grid_cy, dome_base_z - big / 2),
        big * 2, big * 2, big,
        "_dome_cutter_tmp",
    )
    _boolean_cut(dome, cutter)

    # ── Smooth shading + material ───────────────────────────────
    for poly in dome.data.polygons:
        poly.use_smooth = True
    mat = _make_material("DomeMat", (*DOME_COLOR, 1.0),
                         roughness=0.0, alpha=DOME_ALPHA, transmission=0.0, blend=True)
    dome.data.materials.append(mat)
    return dome


def _scaled_dome(lower_dome, name, rx, ry, height, base_z, alpha, mat_name, color):
    """
    Copy lower_dome mesh, normalise vertices to local origin, rescale, place at base_z.
    Normalising first makes this correct regardless of whether primitive_uv_sphere_add
    baked its location into vertex coords or into obj.location.
    """
    step    = CUBE_SIZE * ARRAY_SPACING
    grid_cx = (GRID_X - 1) * step / 2
    grid_cy = (GRID_Y - 1) * step / 2
    fp_w    = GRID_X * step
    fp_d    = GRID_Y * step
    lower_rx = (fp_w + 4 * SHELL_MARGIN) / 2 * DOME_OVERSIZE
    lower_ry = (fp_d + 4 * SHELL_MARGIN) / 2 * DOME_OVERSIZE

    new_mesh = lower_dome.data.copy()

    # Find bounding box of copied vertices
    xs = [v.co.x for v in new_mesh.vertices]
    ys = [v.co.y for v in new_mesh.vertices]
    zs = [v.co.z for v in new_mesh.vertices]
    x_ctr  = (max(xs) + min(xs)) / 2
    y_ctr  = (max(ys) + min(ys)) / 2
    z_base = min(zs)   # equator = lowest z

    # Normalise to origin, then scale
    for v in new_mesh.vertices:
        v.co.x = (v.co.x - x_ctr)  * (rx / lower_rx)
        v.co.y = (v.co.y - y_ctr)  * (ry / lower_ry)
        v.co.z = (v.co.z - z_base) * (height / DOME_HEIGHT)

    # Place object: equator at base_z, XY centred on grid
    obj = bpy.data.objects.new(name, new_mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = (grid_cx, grid_cy, base_z)

    mat = _make_material(mat_name, (*color, 1.0),
                         roughness=0.0, alpha=alpha, transmission=0.0, blend=True)
    new_mesh.materials.clear()
    new_mesh.materials.append(mat)
    return obj


def _lower_dome_base_z():
    notch_z     = CUBE_HEIGHT * NOTCH_FRACTION
    float_top_z = CUBE_HEIGHT / 2 + FLOAT_GAP + notch_z
    return float_top_z + DOME_GAP


def create_upper_dome(lower_dome):
    """Sits above the lower dome with a DOME_SPACING gap."""
    step = CUBE_SIZE * ARRAY_SPACING
    fp_w = GRID_X * step
    fp_d = GRID_Y * step
    rx       = (fp_w + 4 * SHELL_MARGIN) / 2 * UPPER_DOME_OVERSIZE
    ry       = (fp_d + 4 * SHELL_MARGIN) / 2 * UPPER_DOME_OVERSIZE
    base_z   = _lower_dome_base_z() + DOME_HEIGHT + DOME_SPACING
    return _scaled_dome(lower_dome, "UpperDome", rx, ry,
                        UPPER_DOME_HEIGHT, base_z, UPPER_DOME_ALPHA, "UpperDomeMat",
                        UPPER_DOME_COLOR)


def create_outer_dome(lower_dome):
    """Sits above the upper dome with another DOME_SPACING gap."""
    step = CUBE_SIZE * ARRAY_SPACING
    fp_w = GRID_X * step
    fp_d = GRID_Y * step
    rx       = (fp_w + 4 * SHELL_MARGIN) / 2 * OUTER_DOME_OVERSIZE
    ry       = (fp_d + 4 * SHELL_MARGIN) / 2 * OUTER_DOME_OVERSIZE
    base_z   = _lower_dome_base_z() + DOME_HEIGHT + DOME_SPACING + UPPER_DOME_HEIGHT + DOME_SPACING
    return _scaled_dome(lower_dome, "OuterDome", rx, ry,
                        OUTER_DOME_HEIGHT, base_z, OUTER_DOME_ALPHA, "OuterDomeMat",
                        OUTER_DOME_COLOR)


def colorize_by_name():
    """Assign colours by matching object name against LAYER_COLORS patterns."""
    skip = {"Dome", "UpperDome", "OuterDome", "Lotus_center", "GoldStar_1", "GoldStar_2"}
    for obj in bpy.data.objects:
        if obj.type != 'MESH' or obj.name in skip:
            continue
        color = (0.5, 0.5, 0.5)          # fallback grey
        for pattern, c in LAYER_COLORS:
            if pattern in obj.name:
                color = c
                break
        mat = _make_material(f"C_{obj.name}", (*color, 1.0), roughness=0.35)
        if obj.data.materials:
            obj.data.materials[0] = mat
        else:
            obj.data.materials.append(mat)
    bpy.context.view_layer.update()


def setup_render():
    """Low-resolution, low-sample settings for fast preview renders."""
    scene = bpy.context.scene
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1920
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look            = 'None'
    # EEVEE sample reduction (attribute name differs across versions)
    for attr in ('eevee',):
        eevee = getattr(scene, attr, None)
        if eevee:
            for sample_attr in ('taa_render_samples', 'samples'):
                if hasattr(eevee, sample_attr):
                    setattr(eevee, sample_attr, 16)
                    break


def setup_isometric_camera():
    """Orthographic camera at standard isometric angles (X≈54.74°, Z=45°)."""
    cam_data      = bpy.data.cameras.new(name="IsometricCamera")
    cam_data.type = 'ORTHO'
    cam           = bpy.data.objects.new("IsometricCamera", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.rotation_euler = (math.radians(82.0), 0.0, math.radians(25.0))
    cam.location = CAM_POS

    cam_data.ortho_scale = CAM_ORTHO_SCALE
    bpy.context.scene.camera = cam


def fit_camera_to_scene(padding=1.12):
    """
    Adjust the orthographic camera so every visible object fits inside the
    render frame with a small padding border.

    Strategy:
      1. Project all bounding-box corners of every visible MESH / CURVE / FONT
         object onto the camera's local X (right) and Y (up) axes.
      2. Shift the camera sideways / up-down so the scene is centred in the frame.
      3. Set ortho_scale = max(x_span, y_span) * padding.
    """
    cam_obj = bpy.context.scene.camera
    if cam_obj is None or cam_obj.data.type != 'ORTHO':
        print("fit_camera_to_scene: no orthographic camera found.")
        return

    bpy.context.view_layer.update()          # ensure matrix_world is current

    cam_mat  = cam_obj.matrix_world
    cam_pos  = cam_mat.translation.copy()
    right    = cam_mat.col[0].xyz.normalized()   # camera local +X  (rightward)
    up       = cam_mat.col[1].xyz.normalized()   # camera local +Y  (upward)

    # Collect world-space corners from all visible, renderable objects
    corners = []
    for obj in bpy.context.scene.objects:
        if obj.hide_render or obj.type in ('CAMERA', 'LIGHT', 'SPEAKER',
                                           'ARMATURE', 'LATTICE', 'EMPTY'):
            continue
        if not obj.visible_get():
            continue
        mat = obj.matrix_world
        for co in obj.bound_box:          # 8 local-space corners
            corners.append(mat @ mathutils.Vector(co))

    if not corners:
        print("fit_camera_to_scene: no renderable objects found.")
        return

    # Project each corner onto camera right / up (camera-local X and Y)
    xs = [right.dot(c - cam_pos) for c in corners]
    ys = [up.dot(c - cam_pos)    for c in corners]

    x_min, x_max = min(xs), max(xs)
    y_min, y_max = min(ys), max(ys)
    x_ctr  = (x_min + x_max) / 2
    y_ctr  = (y_min + y_max) / 2
    x_span = x_max - x_min
    y_span = y_max - y_min

    # Re-centre: shift camera along its right / up so the scene lands in the middle
    cam_obj.location = cam_pos + right * x_ctr + up * y_ctr

    # Set ortho_scale to cover the larger of the two spans
    render = bpy.context.scene.render
    aspect = render.resolution_x / render.resolution_y   # 1.0 for square
    cam_obj.data.ortho_scale = max(x_span / aspect, y_span) * padding
    print(f"fit_camera_to_scene: ortho_scale={cam_obj.data.ortho_scale:.2f}  "
          f"(scene {x_span:.1f}w × {y_span:.1f}h in camera space)")


def _star_mesh(outer_r, inner_r, n_points=5):
    """Flat n-pointed star polygon in the XY plane, centred at origin."""
    mesh = bpy.data.meshes.new("_star_tmp")
    bm   = bmesh.new()
    verts = []
    for i in range(n_points * 2):
        angle = math.pi / n_points * i - math.pi / 2   # start at top point
        r     = outer_r if i % 2 == 0 else inner_r
        verts.append(bm.verts.new((r * math.cos(angle), r * math.sin(angle), 0.0)))
    bm.faces.new(verts)
    bm.to_mesh(mesh)
    bm.free()
    return mesh


def create_dome_stars():
    """Two solid gold 5-pointed stars lying flat near the top of the outer dome."""
    step    = CUBE_SIZE * ARRAY_SPACING
    grid_cx = (GRID_X - 1) * step / 2
    grid_cy = (GRID_Y - 1) * step / 2
    fp_w    = GRID_X * step
    fp_d    = GRID_Y * step

    dome_rx = (fp_w + 4 * SHELL_MARGIN) / 2 * OUTER_DOME_OVERSIZE
    dome_ry = (fp_d + 4 * SHELL_MARGIN) / 2 * OUTER_DOME_OVERSIZE
    dome_h  = OUTER_DOME_HEIGHT
    dome_base_z = (_lower_dome_base_z()
                   + DOME_HEIGHT + DOME_SPACING
                   + UPPER_DOME_HEIGHT + DOME_SPACING)

    gold_mat = _make_material("GoldStarMat", (1.0, 0.82, 0.0, 1.0), roughness=0.12)

    # Camera azimuth from dome centre ≈ -65°; place one star 55° left, one 55° right
    # right of camera view: -65° + 55° = -10°,  left: -65° - 55° = -120°
    positions = [(-10, 70), (-120, 70)]

    for k, (az_deg, el_deg) in enumerate(positions):
        theta = math.radians(az_deg)
        phi   = math.radians(el_deg)

        px = grid_cx + dome_rx * math.cos(phi) * math.cos(theta)
        py = grid_cy + dome_ry * math.cos(phi) * math.sin(theta)
        pz = dome_base_z + dome_h * math.sin(phi)

        mesh = _star_mesh(outer_r=0.7, inner_r=0.28)
        name = f"GoldStar_{k + 1}"
        obj  = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)

        obj.rotation_euler = (0.4, 0.0, 0.0)   # mostly flat / horizontal
        obj.location = (px, py, pz)
        obj.data.materials.append(gold_mat)


# ══════════════════════════════════════════════════════════════
#  ENGINEERING CALLOUT LABELS
# ══════════════════════════════════════════════════════════════

def _place_callout(tag, label, anchor, text_pos, cam_obj, font=None):
    """
    One engineering callout:
      • filled sphere (closed circle) at anchor  — component end
      • thin cylinder line
      • cone arrowhead, tip pointing toward the text box
      • text label facing the camera (font optionally overridden)

    anchor   : (x, y, z) on the component surface
    text_pos : (x, y, z) centre of the text label
    cam_obj  : camera object — text tracks it so it always faces the lens
    font     : bpy.data.fonts entry, or None for Blender default
    """
    DOT_R  = 0.08
    LINE_R = 0.020
    CONE_D = 0.28
    CONE_R = 0.09
    TXT_SZ = 0.40
    DARK   = (0.08, 0.08, 0.08)

    mat_dark = _make_material(f"CL_dark_{tag}", (*DARK, 1.0), roughness=0.8)

    va = mathutils.Vector(anchor)
    vt = mathutils.Vector(text_pos)
    vd = (vt - va).normalized()          # anchor → text

    # ── 1. Dot (closed circle) at component ─────────────────────
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=DOT_R, segments=14, ring_count=7, location=anchor)
    dot = bpy.context.active_object
    dot.name = f"CL_dot_{tag}"
    dot.visible_shadow = False
    dot.data.materials.append(mat_dark)
    for p in dot.data.polygons:
        p.use_smooth = True

    # ── 2. Line (dot surface → arrowhead base) ───────────────────
    cone_base  = vt - vd * (CONE_D + 0.04)  # small gap; cone tip lands just before text_pos
    line_start = va + vd * DOT_R
    line_vec   = cone_base - line_start
    line_len   = line_vec.length
    ln = None
    if line_len > 1e-6:
        line_mid = (line_start + cone_base) * 0.5
        bpy.ops.mesh.primitive_cylinder_add(
            radius=LINE_R, depth=line_len, location=line_mid.to_tuple())
        ln = bpy.context.active_object
        ln.name = f"CL_line_{tag}"
        ln.visible_shadow = False
        rot = mathutils.Vector((0, 0, 1)).rotation_difference(vd)
        ln.rotation_euler = rot.to_euler()
        bpy.ops.object.transform_apply(rotation=True)
        ln.data.materials.append(mat_dark)

    # ── 3. Arrowhead cone (tip at text end, base on line) ────────
    cone_ctr = cone_base + vd * (CONE_D * 0.5)
    bpy.ops.mesh.primitive_cone_add(
        radius1=CONE_R, radius2=0, depth=CONE_D, location=cone_ctr.to_tuple())
    cn = bpy.context.active_object
    cn.name = f"CL_cone_{tag}"
    cn.visible_shadow = False
    rot = mathutils.Vector((0, 0, 1)).rotation_difference(vd)
    cn.rotation_euler = rot.to_euler()
    bpy.ops.object.transform_apply(rotation=True)
    cn.data.materials.append(mat_dark)

    # ── 4. Text label — orient toward camera, then remove constraint ─
    bpy.ops.object.text_add(location=text_pos)
    txt = bpy.context.active_object
    txt.name        = f"CL_text_{tag}"
    txt.data.body   = label
    txt.data.size   = TXT_SZ
    txt.data.align_x = 'LEFT'
    txt.data.align_y = 'CENTER'
    if font is not None:
        txt.data.font = font
    txt.data.materials.append(mat_dark)
    con2 = txt.constraints.new(type='TRACK_TO')
    con2.target     = cam_obj
    con2.track_axis = 'TRACK_Z'   # text face (+Z) toward camera
    con2.up_axis    = 'UP_Y'
    # NOTE: if text appears flipped, change track_axis to 'TRACK_NEGATIVE_Z'
    # Bake the constrained rotation into the actual transform, then free the object
    depsgraph = bpy.context.evaluated_depsgraph_get()
    txt.matrix_world = txt.evaluated_get(depsgraph).matrix_world.copy()
    txt.constraints.clear()

    # ── 5. Group empty — parent dot + line + cone so they move together ─
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=anchor)
    grp = bpy.context.active_object
    grp.name = f"CL_group_{tag}"
    grp.empty_display_size = 0.3
    bpy.ops.object.select_all(action='DESELECT')
    for child in (obj for obj in (dot, ln, cn) if obj is not None):
        child.select_set(True)
    grp.select_set(True)
    bpy.context.view_layer.objects.active = grp
    bpy.ops.object.parent_set(type='OBJECT', keep_transform=True)


def create_callouts():
    """
    Add engineering callout labels for all major scene layers.
    Must be called after setup_isometric_camera() and colorize_by_name().
    """
    cam_obj = bpy.data.objects.get("IsometricCamera")
    if cam_obj is None:
        print("create_callouts: IsometricCamera not found — skipping labels.")
        return

    step    = CUBE_SIZE * ARRAY_SPACING
    grid_cx = (GRID_X - 1) * step / 2
    grid_cy = (GRID_Y - 1) * step / 2
    fp_w    = GRID_X * step
    fp_d    = GRID_Y * step

    notch_z      = CUBE_HEIGHT * NOTCH_FRACTION
    float_cz     = CUBE_HEIGHT / 2 + FLOAT_GAP / 2 + notch_z / 2
    dome_base_z  = CUBE_HEIGHT / 2 + FLOAT_GAP + notch_z + DOME_GAP

    sub_shell_cz    = -(CUBE_HEIGHT / 2 + BASE_FLOAT_GAP + SHELL_HEIGHT / 2)
    sub_bottom_z    = -(CUBE_HEIGHT / 2 + BASE_FLOAT_GAP + SHELL_HEIGHT)
    subsub_shell_cz = sub_bottom_z - BASE_FLOAT_GAP - SHELL_HEIGHT / 2

    # Z midpoint of the full SubLayer structure (shell tray + walls above it)
    sub_wall_top  = -(CUBE_HEIGHT / 2 + BASE_FLOAT_GAP) + (BASE_FLOAT_GAP + CUBE_HEIGHT) / 4
    sub_edge_cz   = (sub_bottom_z + sub_wall_top) / 2   # ≈ -1.79

    # Z midpoint of the full SubSubLayer structure
    subsub_bottom_z  = sub_bottom_z - BASE_FLOAT_GAP - SHELL_HEIGHT
    subsub_wall_top  = sub_bottom_z - BASE_FLOAT_GAP + (BASE_FLOAT_GAP + SHELL_HEIGHT) / 4
    subsub_edge_cz   = (subsub_bottom_z + subsub_wall_top) / 2   # ≈ -3.59

    sub_half    = fp_w / 2 + SHELL_MARGIN
    subsub_half = sub_half + SHELL_MARGIN

    dome_rx     = (fp_w + 4 * SHELL_MARGIN) / 2 * DOME_OVERSIZE
    upper_bz    = dome_base_z + DOME_HEIGHT + DOME_SPACING
    upper_rx    = (fp_w + 4 * SHELL_MARGIN) / 2 * UPPER_DOME_OVERSIZE
    outer_bz    = upper_bz + UPPER_DOME_HEIGHT + DOME_SPACING
    outer_rx    = (fp_w + 4 * SHELL_MARGIN) / 2 * OUTER_DOME_OVERSIZE

    # Back-right corner of the back-right floating slab (i=GRID_X-1, j=GRID_Y-1)
    notch_xy      = CUBE_SIZE * NOTCH_FRACTION
    float_edge_x  = (GRID_X - 1) * step + notch_xy / 2  # X_max of corner float
    float_edge_y  = (GRID_Y - 1) * step + notch_xy / 2  # Y_max of corner float

    # Text column: to the right of the widest layer's back-right corner
    TX = grid_cx + subsub_half + 1.5   # X just right of SubSubLayer outer edge (~9.5)
    TY = grid_cy + subsub_half         # Y aligned with back-right corners (~8.0)

    # Dome anchors: outer/upper use angled front face; lower dome uses back-right edge (horizontal line)
    AY = grid_cy - fp_d / 4

    # Lower dome: anchor on back-right dome surface at Y=TY so line is horizontal
    dome_anchor_x = grid_cx + dome_rx * math.sqrt(max(0.0, 1.0 - ((TY - grid_cy) / dome_rx) ** 2))

    # Right star (GoldStar_1): az=-10°, el=70° on outer dome surface
    star_az = math.radians(-10)
    star_el = math.radians(70)
    star_px = grid_cx + outer_rx * math.cos(star_el) * math.cos(star_az)
    star_py = grid_cy + outer_rx * math.cos(star_el) * math.sin(star_az)
    star_pz = outer_bz + OUTER_DOME_HEIGHT * math.sin(star_el)
    # Tip of star: i=4 in _star_mesh, angle = -π/2 + 4*π/5 = 54° (right-and-back, appears higher in camera)
    _tip_angle = math.pi / 5 * 4 - math.pi / 2
    star_tip_x = star_px + 0.7 * math.cos(_tip_angle)
    star_tip_y = star_py + 0.7 * math.sin(_tip_angle)

    # (tag, label, anchor_xyz, text_xyz)
    callouts = [
        ("outer_dome",  "Web Browsers",
         (float_edge_x, float_edge_y, outer_bz + OUTER_DOME_HEIGHT * 0.5),  # directly above Pana Modules ball
         (float_edge_x + 2.5, float_edge_y, outer_bz + OUTER_DOME_HEIGHT * 0.5 + 1.0)),  # same direction as Users (+2.5X, +1.0Z)

        ("upper_dome",  "Direct Site Access\n(APIs)",
         (grid_cx + upper_rx * 0.75, AY, upper_bz + UPPER_DOME_HEIGHT * 0.5),   # neutral dome-face position
         (grid_cx + upper_rx * 0.75 + 1.5, AY, upper_bz + UPPER_DOME_HEIGHT * 0.5 + 0.6)),  # short line, freestanding

        ("dome",        "Policy Enforcement",
         (float_edge_x, AY, dome_base_z),            # forward on dome equator toward camera
         (TX, TY, dome_base_z - 0.6)),

        ("float_slab",  "Pana Modules\n(Social Timeline, etc.)",
         (float_edge_x, float_edge_y, float_cz),                # back-right corner of back-right float
         (TX, TY, float_cz)),

        ("base_layer",  "Site Navigation\n(vinext)",
         (grid_cx + fp_w / 2, grid_cy + fp_d / 2, 0.0),        # back-right corner edge of grid
         (TX, TY, 0.0)),

        ("sublayer",    "Serverless Hosting\n(Cloudflare)",
         (grid_cx + sub_half, grid_cy + sub_half, sub_edge_cz),      # back-right corner, full-structure midpoint
         (TX, TY, sub_edge_cz)),                                      # same Z as anchor → horizontal line

        ("subsubLayer", "Persistent Data\n(Supabase)",
         (grid_cx + subsub_half, grid_cy + subsub_half, subsub_edge_cz),  # back-right corner, full-structure midpoint
         (TX, TY, subsub_edge_cz)),                                        # same Z → horizontal line

        ("gold_star",   "Users",
         (star_tip_x, star_tip_y, star_pz),                     # tip of star pointing toward +X
         (star_tip_x + 2.5, star_tip_y, star_pz + 1.0)),        # freestanding: offset right + up
    ]

    # Try to load a terminal/monospace font (matrix unix-shell style).
    # Candidates in preference order; first found wins.
    import os
    _font_candidates = [
        "/usr/share/fonts/truetype/terminus/TerminusTTF-4.49.1.ttf",
        "/usr/share/fonts/truetype/terminus/TerminusTTF-Bold-4.49.1.ttf",
        "/usr/share/fonts/truetype/freefont/FreeMono.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationMono-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        "/usr/share/fonts/truetype/ubuntu/UbuntuMono-R.ttf",
        "/usr/share/fonts/truetype/courier-prime/CourierPrime-Regular.ttf",
    ]
    callout_font = None
    for _p in _font_candidates:
        if os.path.exists(_p):
            try:
                callout_font = bpy.data.fonts.load(_p)
                print(f"Callout font: {_p}")
            except Exception as e:
                print(f"Font load failed ({_p}): {e}")
            break
    if callout_font is None:
        print("Callout font: using Blender default (no terminal font found)")

    for tag, label, anchor, text_pos in callouts:
        _place_callout(tag, label, anchor, text_pos, cam_obj, callout_font)

    # ── "Tech Stack" title — large text above outer dome, facing camera ──────
    title_z = outer_bz + OUTER_DOME_HEIGHT + 2.0
    bpy.ops.object.text_add(location=(grid_cx, grid_cy, title_z))
    ttl = bpy.context.active_object
    ttl.name        = "TitleText_TechStack"
    ttl.data.body   = "The Pana MIA Auric Field"
    ttl.data.size   = 1.1
    ttl.data.align_x = 'RIGHT'
    ttl.data.align_y = 'CENTER'
    if callout_font is not None:
        ttl.data.font = callout_font
    title_mat = _make_material("CL_title_mat", (0.08, 0.08, 0.08, 1.0), roughness=0.8)
    ttl.data.materials.append(title_mat)
    con_t = ttl.constraints.new(type='TRACK_TO')
    con_t.target     = cam_obj
    con_t.track_axis = 'TRACK_Z'
    con_t.up_axis    = 'UP_Y'
    depsgraph = bpy.context.evaluated_depsgraph_get()
    ttl.matrix_world = ttl.evaluated_get(depsgraph).matrix_world.copy()
    ttl.constraints.clear()

    # ── Subtitle — centred below SubSubLayer ─────────────────────────────────
    sub_title_z = subsub_bottom_z - 3.0
    bpy.ops.object.text_add(location=(grid_cx, grid_cy, sub_title_z))
    sttl = bpy.context.active_object
    sttl.name        = "SubtitleText"
    sttl.data.body   = ("The flower represents the Directory -- it ties together all modules.\n"
                        "Visit us at panamia.club")
    sttl.data.size   = 0.55
    sttl.data.align_x = 'CENTER'
    sttl.data.align_y = 'CENTER'
    if callout_font is not None:
        sttl.data.font = callout_font
    sttl.data.materials.append(title_mat)
    con_s = sttl.constraints.new(type='TRACK_TO')
    con_s.target     = cam_obj
    con_s.track_axis = 'TRACK_Z'
    con_s.up_axis    = 'UP_Y'
    depsgraph = bpy.context.evaluated_depsgraph_get()
    sttl.matrix_world = sttl.evaluated_get(depsgraph).matrix_world.copy()
    sttl.constraints.clear()


# ══════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════

clear_scene()
bpy.context.scene.render.engine = 'BLENDER_EEVEE_NEXT'
setup_render()
setup_lighting()
create_shell_layers()
build_grid()
dome = create_dome()
create_upper_dome(dome)
create_outer_dome(dome)
create_dome_stars()
colorize_by_name()
setup_isometric_camera()
create_callouts()    # must run after camera + colorize so materials aren't clobbered
fit_camera_to_scene()  # auto-scale ortho to fit everything

print("Done — sub-sub-layer → sub-layer → base layer → floating slabs → lower dome → upper dome → callout labels.  Render with F12.")

