// Texture test: small upright tabs on thin strips, one grip pattern and strength on each, so a
// printer shows how each one prints and feels before a full insert. The tabs stand upright like the
// grip of an insert that prints on its back: the pattern faces the front (-y), and the top of the tab
// is where the lip is. The label in front of each tab names the pattern and the strength.
// texture_test: Smooth, then Lines, Knurl and Dots at Fine, Medium and Coarse, modeled.
// texture_test_smooth: the same plate with smooth tabs, for the slicer patterns. The page puts it in
// a 3MF with one texture_test_mod per tab, each with its own fuzzy skin settings.

tt_w = 25; tt_h = 15; tt_t = 3;              // tab width, height above the strip, thickness
tt_gap = 4;                                  // between the tabs in a row
tt_room = 16;                                // from the back of one row to the front of the next tab
tt_base = 1.2; tt_strip = 9;                 // strip under a row: thickness, and depth (the label, then the tab)
tt_rail = 4;                                 // rails that join the strips
tt_sizes = ["fine", "medium", "coarse"];
tt_modeled = ["lines", "knurl", "dots"];
tex_i = 0;                                   // texture_test_mod: which slicer tab, 0 to 8, row by row

function tt_x(col) = (col - 1) * (tt_w + tt_gap);
function tt_y(row) = row * (tt_room + tt_t) + tt_room;   // front of the tab
tt_rows = 4;
tt_wide = 3 * tt_w + 2 * tt_gap;

// one tab, its front at y = 0, standing on z = 0. Slices across the width like e_sweep, each the
// side profile with the pattern on the front (tex_h and $e_tex from edge.scad); t runs from the top.
module tt_tab(kind, size) let($e_tex = tex_spec(kind, size)) {
    z0 = -0.5;                               // reaches into the strip
    k = $e_tex[0] == "none" ? 1 : ceil(tt_h / tex_step());
    n = $e_tex[0] == "knurl" || $e_tex[0] == "dots" ? ceil(tt_w / tex_step()) : 1;
    xs = [for (i = [0 : n]) -tt_w/2 + tt_w * i / n];
    prof = function(x) concat([[tt_t, z0], [tt_t, tt_h]],
        [for (i = [0 : k]) let(t = tt_h * i / k) [-tex_h(x, t, tt_h), tt_h - t]], [[0, z0]]);
    profs = [for (x = xs) prof(x)];
    m = len(profs[0]);
    pts = [for (i = [0 : n]) for (p = profs[i]) [xs[i], p[0], p[1]]];
    sides = [for (i = [0 : n - 1]) for (j = [0 : m - 1]) let(a = i*m + j, b = i*m + (j + 1) % m)
                each [[a, a + m, b + m], [a, b + m, b]]];
    polyhedron(pts, concat([[for (j = [0 : m - 1]) j]], [[for (j = [m - 1 : -1 : 0]) n*m + j]], sides));
}

// the plate: a smooth tab on its own in front, then one row per pattern, Fine to Coarse from the left.
// Each row stands on a strip; a rail in the middle holds the smooth tab, and one at each side joins the rows.
// The space in front of a tab stays open, so little plastic goes into the base.
// kinds: the patterns modeled on the tabs, labels: the pattern names on the strips.
module tt_plate(kinds, labels) {
    difference() {
        union() {
            for (row = [0 : tt_rows - 1]) let(w = row == 0 ? tt_w : tt_wide)
                translate([-w/2, tt_y(row) + tt_t - tt_strip, 0]) cube([w, tt_strip, tt_base]);
            for (m = [0, 1]) mirror([m, 0, 0])
                translate([tt_wide/2 - tt_rail, tt_y(1) + tt_t - tt_strip, 0]) cube([tt_rail, tt_y(tt_rows - 1) - tt_y(1) + 0.01, tt_base]);
            translate([-tt_rail/2, tt_y(0), 0]) cube([tt_rail, tt_y(1) - tt_y(0), tt_base]);
        }
        for (row = [0 : tt_rows - 1], col = row == 0 ? [1] : [0 : 2])
            translate([tt_x(col), tt_y(row) - (tt_strip - tt_t)/2, tt_base - 0.6]) linear_extrude(1)
                text(row == 0 ? "SMOOTH" : str(labels[row - 1], " ", ["F", "M", "C"][col]), size = 3,
                     font = "Liberation Sans:style=Bold", halign = "center", valign = "center");
    }
    for (row = [0 : tt_rows - 1], col = row == 0 ? [1] : [0 : 2])
        translate([tt_x(col), tt_y(row), tt_base]) tt_tab(row == 0 ? "none" : kinds[row - 1], tt_sizes[col]);
}

module texture_test() tt_plate(tt_modeled, ["LINES", "KNURL", "DOTS"]);
// the rows in the order of SLICED in web/catalog.py: the page sets each tab's skin in that order
module texture_test_smooth() tt_plate(["none", "none", "none"], ["FUZZY", "CELLS", "MARBLE"]);
// the modifier for slicer tab tex_i: a box around the tab above the strip, so only the tab walls get the skin
module texture_test_mod() let(row = 1 + floor(tex_i / 3), col = tex_i % 3)
    translate([tt_x(col) - tt_w/2 - 1, tt_y(row) - 1.5, tt_base + 0.2]) cube([tt_w + 2, tt_t + 3, tt_h + 1]);
