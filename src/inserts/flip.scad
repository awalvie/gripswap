// Flip insert: two grips in one insert, each an edge or a row of pockets. The top grip is in use;
// the bottom one hangs upside down under it. Turn the insert over, front still to the front, to
// swap them. The housing lips hold it the same way either way up.
// Each grip has its floor on the web in the middle. An edge is the edge-insert sweep, flat or
// ergo; pockets are the pocket insert's pockets. No angle: any angle takes finger room away.

// top grip: "edge" or "pocket"; depth, lip roundover; edge: ergo curve, width; pockets: count, width, wall, corner radius
top_kind = "edge"; top_d = 20; top_r = 3; top_ergo = 0; top_w = 90; top_pn = 1; top_pw = 58; top_pgap = 10; top_pr = 8;
bot_kind = "edge"; bot_d = 10; bot_r = 2; bot_ergo = 0; bot_w = 90; bot_pn = 1; bot_pw = 58; bot_pgap = 10; bot_pr = 8;
flip_web = 3.2;                              // wall between the two slot floors; it carries no load
flip_zc = floor_t + pk_h/2;                  // middle of the insert height
lbl_t = 0.6;                                 // label depth in the back wall of the slot
lbl_room = 11;                               // room a two-digit label takes beside the pockets

// the edge settings of one grip, for everything inside it. The slot takes all the room down to the web.
// Pockets have the ceiling of an edge with the same lip; their mouth round runs up the face like a lip.
module flip_vars(kind, d, r, e)
    let($e_d = d, $e_r = r, $e_angle = 0, $e_ergo = kind == "edge" ? e : 0, $e_h = pk_h, $e_floor_min = flip_zc + flip_web/2)
    let($p_floor = e_floor(), $p_ceil = e_ceil(), $p_mouth = r) children();

// the slot of one grip in the top half: an edge, or a row of pockets
module flip_slot(kind, w, pn, pw, pgap, pr) {
    if (kind == "edge") edge_slot(w);
    else let(span = row_span(pn, pw, pgap))
        for (i = [0 : pn - 1]) translate([-span/2 + pw/2 + i * (pw + pgap), 0, 0]) slot_shape(pw, pr);
}

// one grip in the top half, with its label
module flip_grip(kind, d, r, e, w, pn, pw, pgap, pr) flip_vars(kind, d, r, e) {
    flip_slot(kind, w, pn, pw, pgap, pr);
    if (kind == "edge")
        // label on the flat band of the back wall, under the round corner at its top. Cut by the slot
        // moved lbl_t back, so it keeps its depth on the curved back wall of an ergo edge.
        intersection() {
            translate([0, lbl_t, 0]) e_sweep(w);
            translate([0, pk_d, (e_floor() + e_ceil() - e_br(e_dmin())) / 2]) rotate([90, 0, 0])
                linear_extrude(pk_d) text(str(d, " mm"), size = 7, font = "Liberation Sans:style=Bold", halign = "center", valign = "center");
        }
    else let(span = row_span(pn, pw, pgap), x0 = span/2 + r + 2, x1 = pk_w/2 - lip_in - clear - 2)
        // label on the front face beside the pockets (their backs are round), inside the nose;
        // a row too wide for it gets none
        if (x1 - x0 >= lbl_room)
            translate([(x0 + x1) / 2, -eps, (e_floor() + e_ceil()) / 2]) rotate([90, 0, 0]) mirror([0, 0, 1])
                linear_extrude(1) text(str(d), size = 7, font = "Liberation Sans:style=Bold", halign = "center", valign = "center");
}

// turned over: 180 degrees about the front-back axis, through the middle of the insert
module turned() translate([0, 0, flip_zc]) rotate([0, 180, 0]) translate([0, 0, -flip_zc]) children();

module insert_flip() {
    difference() {
        insert_blank(both = true);
        flip_grip(top_kind, top_d, top_r, top_ergo, top_w, top_pn, top_pw, top_pgap, top_pr);
        turned() flip_grip(bot_kind, bot_d, bot_r, bot_ergo, bot_w, bot_pn, bot_pw, bot_pgap, bot_pr);
    }
}
