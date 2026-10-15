"""What the configurator offers: housings, inserts and their parameters.

Every parameter maps to an OpenSCAD variable in src/. The page only passes parameters
listed here, and only values inside their range, so a bad value never reaches OpenSCAD.

The page reads a copy of this as JSON. After a change, write it again:
    python3 web/catalog.py > web/static/catalog.json
"""
import json


# simple=True: also shown in Simple mode. Everything else is only in Advanced mode.
def num(name, label, lo, hi, step, default, unit="mm", help="", simple=False):
    return {"name": name, "label": label, "type": "number", "min": lo, "max": hi,
            "step": step, "default": default, "unit": unit, "help": help, "simple": simple}


def choice(name, label, options, default, help="", simple=False):
    return {"name": name, "label": label, "type": "choice", "options": options,
            "default": default, "help": help, "simple": simple}


# The editor shows each housing or insert as cards: a title, an optional line under it, and the
# settings in it. "choice": the card also holds the one-tap choice (Shape, Fingers or Roller).
# A new setting goes in a card here; the page needs no change.
def card(title, params, sub="", choice=False, choice_after=""):
    return {"title": title, "sub": sub, "params": [p["name"] if isinstance(p, dict) else p for p in params], "choice": choice,
            "choice_after": choice_after}


EDGE_SHAPE = [
    num("slot_d", "Edge depth", 6, 25, 1, 20, help="From the lip to the back of the slot.", simple=True),
    num("grip_r", "Lip radius", 0.5, 12, 0.5, 3, help="Roundover on the lip. Small is sharp, big is friendly. Slopers have no lip."),
    num("edge_angle", "Edge angle", -45, 20, 1, 0, unit="°",
        help="Positive: incut, the grip tilts in for traction (Tension uses 10°). Negative: sloper, one round curve (20° to 45°)."),
    num("slot_h", "Slot height", 16, 30, 1, 22, help="Room for the fingers under the grip, where it is lowest. A steep or deep edge can leave less room, because the insert floor must stay."),
]

# Pockets share the edge shape, but their depth is a pocket depth.
POCKET_SHAPE = [num("slot_d", "Pocket depth", 6, 25, 1, 20, help="From the lip to the back of the pocket.", simple=True)] + EDGE_SHAPE[1:]

# Widest slot or pocket row: one skin (2.4 mm) of wall stays between its ends and the lip notches.
# 2 * (pk_w/2 - clear - lip_in - skin) = 90
MAX_W = 90

# Walls and infill for the parts that take the pull. "print" puts them into a 3MF for Bambu Studio
# and Orca, with their own setting names; the note on the page is made from the same values.
SOLID_PRINT = {"wall_loops": 3, "sparse_infill_density": "15%", "sparse_infill_pattern": "gyroid"}
SOLID = f"{SOLID_PRINT['wall_loops']} walls · {SOLID_PRINT['sparse_infill_density']} {SOLID_PRINT['sparse_infill_pattern']}"

# Grip texture: a pattern and a strength. Lines, Knurl and Dots are modeled on the ceiling of an
# edge (src/inserts/edge.scad sets their sizes); Resin, Rock and Marble are the slicer's fuzzy skin
# in a modifier band over the grip ("slicer": OpenSCAD never gets them, "noise": the fuzzy skin noise
# type in Bambu Studio and Orca). Resin and Rock are named after the board surface they feel closest
# to; the values stay fuzzy and cells, so old links and files keep working. "group": the heading the
# pattern sits under in the menu. "about": the line under the menu. The feel is from one print test.
BOARD, SHAPES = "Like a real board", "Printed shapes"
# "modeled": the page hides it on a two-sided insert with no edge.
MODELED = [{"value": "dots", "label": "Dots", "modeled": True, "group": SHAPES,
            "about": "small cones, part of the edge. The best of the printed shapes in the first test."},
           {"value": "lines", "label": "Lines", "modeled": True, "group": SHAPES,
            "about": "ridges along the lip, across the pull, part of the edge."},
           {"value": "knurl", "label": "Knurl", "modeled": True, "group": SHAPES,
            "about": "small pyramids, part of the edge. The most bite, and the hardest on skin."}]
SLICED = [{"value": "fuzzy", "label": "Resin", "slicer": True, "noise": "classic", "group": BOARD,
           "about": "a fine random grit, like a resin hangboard. Bambu Studio, Orca or PrusaSlicer make it. Start here if you use PrusaSlicer."},
          {"value": "cells", "label": "Rock", "slicer": True, "noise": "voronoi", "group": BOARD,
           "about": "rough patches in a cell pattern, like sandstone. The favorite in the first test. Start here. Bambu Studio and Orca only."},
          {"value": "marble", "label": "Marble", "slicer": True, "noise": "ridgedmulti", "group": SHAPES,
           "about": "rough veins that wander. Bambu Studio and Orca only."}]
SMOOTH = {"value": "none", "label": "Smooth", "group": BOARD, "about": "plain plastic, no texture."}


def texture(modeled=True):
    board = [SMOOTH] + sorted((o for o in SLICED if o["group"] == BOARD), key=lambda o: o["value"] != "cells")   # Rock first
    shapes = (MODELED if modeled else []) + [o for o in SLICED if o["group"] == SHAPES]
    return choice("texture", "Pattern", board + shapes, "none",
                  help="Resin, Rock and Marble are made by your slicer: they add a 3MF for Bambu Studio and Orca to "
                  "the download, and Resin a modifier file for PrusaSlicer. " +
                  ("Dots, Lines and Knurl are part of the edge itself; pockets and steep slopers stay smooth. " if modeled else "") +
                  "The feel described here is from one test print so far. Print the texture test to feel them all.",
                  simple=True) | {"focus": "grip"}


# "focus": picking it turns the 3D view to the grip.
# "skin": fuzzy skin thickness and point distance in mm, for the slicer patterns. "scad_with": sent to
# OpenSCAD only together with the pattern, so a slicer pattern gives the same STL at every strength.
TEXTURE_SIZE = choice("texture_size", "Strength", [
    {"value": "fine", "label": "Fine (gentlest on skin)", "skin": [0.2, 0.3]},
    {"value": "medium", "label": "Medium (a good start)", "skin": [0.3, 0.5]},
    {"value": "coarse", "label": "Coarse (bites more, wears skin faster)", "skin": [0.4, 0.8]},
], "medium", simple=True)
TEXTURE_SIZE["scad_with"] = "texture"
TEXTURE_SIZE["focus"] = "grip"
TEXTURE_SHOW = {"texture_size": ["texture", [o["value"] for o in MODELED + SLICED]]}


def fuzzy_parts(insert, modifier):
    # in the download only with a slicer pattern ("when"). PrusaSlicer gets the modifier as an STL for
    # Fuzzy, and its note says what to set. Bambu Studio and Orca get a 3MF of the insert and the
    # modifier with the texture and the walls and infill already set ("threemf": the parts in it).
    return [{"part": modifier, "name": "Fuzzy modifier", "supports": "PrusaSlicer: load it with the insert as one object",
             "when": {"texture": ["fuzzy"]}, "modifier": True},
            {"part": modifier + "_3mf", "name": "Bambu Orca", "threemf": [insert, modifier], "print": SOLID_PRINT,
             "settings": "insert and texture in one file", "supports": "Bambu Studio and Orca Slicer",
             "when": {"texture": [o["value"] for o in SLICED]}}]


HOUSING = {
    "id": "housing",
    "name": "Housing",
    "parts": [{"part": "housing", "name": "Housing",
               "supports": "no supports", "settings": SOLID}],
    "params": [
        num("keel_hole", "Hole size", 13, 20, 0.5, 16, help="Carabiner hole diameter in the anchor plate, at its narrowest. It holds the carabiner right under the grip, so the edge should stay level. That is not measured yet.", simple=True),
        num("top_t", "Top wall", 8, 12, 0.5, 10, help="The insert presses up on it. Thicker is stiffer and heavier."),
        num("floor_t", "Floor", 8, 12, 0.5, 8, help="Ties the anchor plate to the walls."),
        num("corner", "Corner radius", 3, 12, 0.5, 6, help="Rounding of the housing corners, seen from the front."),
    ],
    "cards": [card("Hanging", ["keel_hole"], "how the housing holds the carabiner"),
              card("Walls", ["top_t", "floor_t", "corner"], "the box the inserts slide into")],
}

# Flip insert: two grips, one on top and one turned over under it. Each is a flat, ergo or incut
# edge, or a row of pockets. Each slot has 22 mm of room down to the web, so no slot height. An
# incut takes room at the lip, so it stops at 10 and there are no slopers. The lip radius stops
# at 3.5. No roller: it does not fit in half the insert.
FLIP_SPAN = 82   # widest pocket row: its mouth round (up to 3.5) keeps one skin to the lip notches


def flip_grip(key, which, depth, radius):
    return [
        choice(f"{key}_kind", "Type", [
            {"value": "edge", "label": "Edge"},
            {"value": "pocket", "label": "Pockets"},
        ], "edge", simple=True),
        num(f"{key}_d", f"{which} depth", 6, 25, 1, depth, help="From the lip to the back of the slot or pocket.", simple=True),
        num(f"{key}_r", f"{which} lip radius", 0.5, 3.5, 0.5, radius, help="Roundover on the lip. Small is sharp, big is friendly."),
        num(f"{key}_ergo", f"{which} ergo curve", 0, 5, 0.5, 0, help="The lip curves this far back in the middle for the longer middle fingers."),
        num(f"{key}_angle", f"{which} incut", 0, 10, 1, 0, unit="°",
            help="The grip tilts in for traction. It starts lower at the lip, so 10° takes about 3.5 mm of finger room there on a 20 mm edge."),
        num(f"{key}_w", f"{which} edge width", 40, MAX_W, 1, 90),
        num(f"{key}_pn", f"{which} pockets", 1, 3, 1, 1, unit=""),
        num(f"{key}_pw", f"{which} pocket width", 18, FLIP_SPAN, 1, 58, help="Mono about 22, two fingers about 40, three fingers about 58."),
        num(f"{key}_pgap", f"{which} wall between", 6, 20, 1, 10),
        num(f"{key}_pr", f"{which} opening corner radius", 2, 11, 0.5, 8, help="Rounding of the pocket opening, seen from the front."),
    ]


def flip_show_if(key):
    return {f"{key}_{n}": [f"{key}_kind", "edge"] for n in ("ergo", "angle", "w")} | \
           {f"{key}_{n}": [f"{key}_kind", "pocket"] for n in ("pn", "pw", "pgap", "pr")}


FLIP = {
    "id": "flip",
    "name": "Two-sided",
    "blurb": "two grips, turn it over",
    # the page shows no Flip type: an edge or pocket insert set to two sides becomes this one
    "two_sided_of": ["edge", "pocket"],
    "parts": [{"part": "insert_flip", "name": "Two-sided insert", "supports": "no supports", "settings": SOLID},
              *fuzzy_parts("insert_flip", "fuzzy_flip")],
    "params": flip_grip("top", "Top", 20, 3) + flip_grip("bot", "Bottom", 10, 2) + [texture(), TEXTURE_SIZE],
    "show_if": flip_show_if("top") | flip_show_if("bot") | TEXTURE_SHOW,
    "spans": [{"names": [f"{k}_pn", f"{k}_pw", f"{k}_pgap"], "max": FLIP_SPAN} for k in ("top", "bot")],
    "cards": [card("Top grip", flip_grip("top", "", 0, 0), "faces up", choice=True),
              card("Bottom grip", flip_grip("bot", "", 0, 0), "on the underside: turn the insert over to use it", choice=True,
                   choice_after="bot_kind"),
              card("Texture", ["texture", "texture_size"])],
    # each grip's one-tap choice, by its kind; the values are the grip's own, without its top_ or bot_
    "side_choices": {
        "edge": {"label": "Shape", "help": "An incut takes finger room at the lip, so it stops at 10°. No slopers.", "options": [
            {"label": "Flat", "icon": "flat", "blurb": "classic edge", "values": {"ergo": 0, "angle": 0, "r": 3}},
            {"label": "Ergo", "icon": "ergo", "blurb": "curved for longer middle fingers", "values": {"ergo": 5, "angle": 0, "r": 3.5}},
            {"label": "Incut", "icon": "incut", "blurb": "tilts in 10°, better traction", "values": {"ergo": 0, "angle": 10, "r": 2.5}},
        ]},
        "pocket": {"label": "Fingers", "options": [
            {"label": "Mono", "icon": "mono", "blurb": "one finger", "values": {"pn": 1, "pw": 22}},
            {"label": "Two", "icon": "two", "blurb": "two fingers", "values": {"pn": 1, "pw": 40}},
            {"label": "Three", "icon": "three", "blurb": "three fingers", "values": {"pn": 1, "pw": 58}},
        ]},
    },
}

INSERTS = [
    {
        "id": "edge",
        "name": "Edge",
        "blurb": "flat, ergo, incut or sloper",
        # Simple mode: one short choice that sets several values at once. An icon is a name in app.js ICON.
        "simple_choice": {"label": "Shape", "options": [
            {"label": "Flat", "icon": "flat", "blurb": "classic edge", "values": {"edge_angle": 0, "ergo": 0, "grip_r": 3}},
            {"label": "Ergo", "icon": "ergo", "blurb": "curved for longer middle fingers", "values": {"edge_angle": 0, "ergo": 5, "grip_r": 4}},
            {"label": "Incut", "icon": "incut", "blurb": "tilts in 10°, better traction", "values": {"edge_angle": 10, "ergo": 0, "grip_r": 2.5}},
            {"label": "Sloper", "icon": "sloper", "blurb": "round 35° curve, open hand", "values": {"edge_angle": -35, "ergo": 0, "slot_d": 25}},
        ]},
        "parts": [{"part": "insert_edge", "name": "Edge insert",
                   "supports": "no supports", "settings": SOLID}, *fuzzy_parts("insert_edge", "fuzzy_edge")],
        "params": EDGE_SHAPE + [
            num("slot_w", "Edge width", 40, MAX_W, 1, 90),
            num("ergo", "Ergo curve", 0, 5, 0.5, 0, help="The lip curves this far back in the middle for the longer middle fingers. The middle gets deeper, the ends shallower and rounder."),
            texture(), TEXTURE_SIZE,
        ],
        "show_if": TEXTURE_SHOW,
        "cards": [card("Edge", ["slot_d", "grip_r", "edge_angle", "slot_h", "slot_w", "ergo"], choice=True),
                  card("Texture", ["texture", "texture_size"])],
    },
    FLIP,
    {
        "id": "pocket",
        "name": "Pockets",
        "blurb": "mono to three fingers",
        "simple_choice": {"label": "Fingers", "options": [
            {"label": "Mono", "icon": "mono", "blurb": "one finger", "values": {"pocket_n": 1, "pocket_w": 22}},
            {"label": "Two", "icon": "two", "blurb": "two fingers", "values": {"pocket_n": 1, "pocket_w": 40}},
            {"label": "Three", "icon": "three", "blurb": "three fingers", "values": {"pocket_n": 1, "pocket_w": 58}},
        ]},
        "parts": [{"part": "insert_pocket", "name": "Pocket insert",
                   "supports": "no supports", "settings": SOLID}, *fuzzy_parts("insert_pocket", "fuzzy_pocket")],
        "params": [
            num("pocket_n", "Pockets", 1, 3, 1, 1, unit=""),
            num("pocket_w", "Pocket width", 18, MAX_W, 1, 58, help="Mono about 22, two fingers about 40, three fingers about 58."),
            num("pocket_gap", "Wall between", 6, 20, 1, 10),
            num("pocket_r", "Opening corner radius", 2, 11, 0.5, 8, help="Rounding of the pocket opening, seen from the front."),
        ] + POCKET_SHAPE + [texture(modeled=False), TEXTURE_SIZE],
        "show_if": TEXTURE_SHOW,
        # a pocket row must fit: count * width + (count - 1) * wall <= max
        "spans": [{"names": ["pocket_n", "pocket_w", "pocket_gap"], "max": MAX_W}],
        "cards": [card("Pockets", ["slot_d", "pocket_n", "pocket_w", "pocket_gap", "pocket_r", "grip_r", "edge_angle", "slot_h"], choice=True),
                  card("Texture", ["texture", "texture_size"])],
    },
    {
        "id": "roller",
        "name": "Roller",
        "blurb": "unlevel or straight",
        "simple_choice": {"label": "Roller", "options": [
            {"label": "Unlevel", "blurb": "necks near the ends", "values": {"roll_type": "unlevel"}},
            {"label": "Straight", "blurb": "plain cylinder", "values": {"roll_type": "straight"}},
        ]},
        "parts": [
            {"part": "insert_roller", "name": "Roller frame", "supports": "no supports", "settings": SOLID},
            {"part": "roller", "name": "Roller", "supports": "no supports", "settings": "3 walls · 20% infill"},
            {"part": "axle", "name": "Axle", "supports": "no supports, or use a 12 mm steel rod", "settings": "4 walls · 100% infill"},
        ],
        "params": [
            choice("roll_type", "Roller", [
                {"value": "unlevel", "label": "Unlevel (necks near the ends)"},
                {"value": "straight", "label": "Straight"},
            ], "unlevel"),
            num("roll_d", "Diameter", 24, 32, 1, 28),
        ],
        "cards": [card("Roller", ["roll_type", "roll_d"], choice=True)],
    },
]

# Common commercial edges (Tension Pro Edge: 8, 10, 15, 20, 25 mm, ergo, pocket, mono). tools/check_parts.py renders
# each of them; the page does not show them.
PRESETS = [
    {"name": "8 mm edge", "insert": "edge", "values": {"slot_d": 8, "grip_r": 1.5}},
    {"name": "10 mm edge", "insert": "edge", "values": {"slot_d": 10, "grip_r": 2}},
    {"name": "15 mm edge", "insert": "edge", "values": {"slot_d": 15, "grip_r": 3}},
    {"name": "20 mm edge", "insert": "edge", "values": {"slot_d": 20, "grip_r": 3}},
    {"name": "25 mm edge", "insert": "edge", "values": {"slot_d": 25, "grip_r": 4}},
    {"name": "20 mm ergo", "insert": "edge", "values": {"slot_d": 20, "grip_r": 4, "ergo": 5}},
    {"name": "25 mm ergo", "insert": "edge", "values": {"slot_d": 25, "grip_r": 5, "ergo": 5}},
    {"name": "15 mm incut 10°", "insert": "edge", "values": {"slot_d": 15, "grip_r": 2, "edge_angle": 10}},
    {"name": "20 mm incut 10°", "insert": "edge", "values": {"slot_d": 20, "grip_r": 3, "edge_angle": 10}},
    {"name": "20° sloper", "insert": "edge", "values": {"slot_d": 25, "edge_angle": -20}},
    {"name": "35° sloper", "insert": "edge", "values": {"slot_d": 25, "edge_angle": -35}},
    {"name": "45° sloper", "insert": "edge", "values": {"slot_d": 20, "edge_angle": -45, "slot_h": 18}},
    {"name": "25 mm three-finger pocket", "insert": "pocket", "values": {"slot_d": 25, "pocket_n": 1, "pocket_w": 58}},
    {"name": "25 mm two-finger pocket", "insert": "pocket", "values": {"slot_d": 25, "pocket_n": 1, "pocket_w": 40}},
    {"name": "25 mm mono", "insert": "pocket", "values": {"slot_d": 25, "pocket_n": 1, "pocket_w": 22, "pocket_r": 8}},
    {"name": "Two 2-finger pockets", "insert": "pocket", "values": {"slot_d": 20, "pocket_n": 2, "pocket_w": 40}},
    {"name": "Unlevel roller", "insert": "roller", "values": {"roll_type": "unlevel", "roll_d": 28}},
    {"name": "Straight roller", "insert": "roller", "values": {"roll_type": "straight", "roll_d": 28}},
]

# Print before the kit: the pocket gap and the lips, on your printer. Downloaded as one zip.
FIT_TEST = [{"part": "fit_ring", "name": "Ring"}, {"part": "fit_frame", "name": "Frame"}]

# Print to choose a grip texture: tabs with every pattern at every strength (src/texture_test.scad).
# "modeled": one STL for any slicer. "smooth" and "modifier": the slicer patterns, put in one 3MF by the
# page, one modifier per tab (tex_i 0 to 8: SLICED by row, TEXTURE_SIZE by column).
TEXTURE_TEST = {"modeled": "texture_test", "smooth": "texture_test_smooth", "modifier": "texture_test_mod", "print": SOLID_PRINT,
                "sliced": [o["value"] for o in SLICED]}   # the slicer rows in order; the menu order may differ


def catalog():
    return {"housing": HOUSING, "inserts": INSERTS, "fit_test": FIT_TEST, "texture_test": TEXTURE_TEST}


def all_params():
    out = {p["name"]: p for p in HOUSING["params"]}
    for ins in INSERTS:
        out.update({p["name"]: p for p in ins["params"]})
    return out


if __name__ == "__main__":
    print(json.dumps(catalog(), indent=1, ensure_ascii=False))
