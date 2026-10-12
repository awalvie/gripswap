// Fuzzy grip: a slicer modifier over the grip surface of an insert, the lip and the roof of the slot
// that the finger pads press on. Load it with the insert as one object, make it a modifier, and turn
// on fuzzy skin in it. The slicer roughens only walls that stand upright in print; the inserts print
// on their backs, so the grip surface does.

fuzzy_t = 1.5;                               // the modifier reaches this far each side of the grip surface

// a band around the roof of a slot: the slot moved up, less the slot moved down. Its floor, ends and
// back wall do not move up into the band, so they stay smooth, and so does the front face.
// The lower copy is moved a hair each way, so no face of it lies on a face of the upper one. An edge
// moves front to back too; a pocket must not, or its mouth, two rings eps apart, leaves a sliver.
// It stops 1 mm inside the top and bottom faces of the insert, which slide in the housing.
module fuzzy_band(edge = true) intersection() {
    difference() {
        translate([0, 0, fuzzy_t]) children();
        for (d = concat([[0.013, 0], [-0.013, 0]], edge ? [[0, 0.013], [0, -0.013]] : []))
            translate([d[0], d[1], -fuzzy_t]) children();
    }
    translate([-pk_w, -2, ins_bot + 1]) cube([2*pk_w, pk_d + 2, ins_top - ins_bot - 2]);
}

module fuzzy_edge() fuzzy_band() slot_cut();
module fuzzy_pocket() let(span = row_span(pocket_n, pocket_w, pocket_gap))
    for (i = [0 : pocket_n - 1]) translate([-span/2 + pocket_w/2 + i * (pocket_w + pocket_gap), 0, 0])
        fuzzy_band(false) slot_cut(pocket_w, pocket_r);
// both grips: the top one, and the turned one under the web
module fuzzy_flip() {
    flip_vars(top_kind, top_d, top_r, top_ergo, top_angle) fuzzy_band(top_kind == "edge") flip_slot(top_kind, top_w, top_pn, top_pw, top_pgap, top_pr);
    turned() flip_vars(bot_kind, bot_d, bot_r, bot_ergo, bot_angle) fuzzy_band(bot_kind == "edge") flip_slot(bot_kind, bot_w, bot_pn, bot_pw, bot_pgap, bot_pr);
}
