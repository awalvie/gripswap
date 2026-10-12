// Housing: a box around the pocket, with an anchor under it.

anchor = "pyramid";        // "pyramid" or "keel". Every anchor holds the carabiner on the anchor plane.

r_out = 2.5;               // round on every body edge
corner = 6;                // corner radius in the front view
bevel = 1.5;               // bevel around both pocket openings; at the back, a lead-in for the insert

// Pyramid anchor (Lanta style): four flat bars from the bottom corners meet in one
// point under the anchor plane. Bars rise at 25 degrees.
leg_x = W/2 - 6; leg_z = 3;                  // bar roots, inside the floor
leg_yf = 5; leg_yb = D - 4.5;                // front and back bar centrelines at the root
bar_tf = 7; bar_wf = 10;                     // front bars: thickness (front view) x depth
bar_tb = 6; bar_wb = 7;                      // back bars
bar_angle = 25;
bar_r = 1.5;                                 // edge round on bars and apex node
node_len = 8;                                // apex node: hull of the last node_len mm of every bar
tri_apex = leg_z - leg_x * tan(bar_angle);   // the point
tri_rod_z = tri_apex + 12.35;                // carabiner seat: highest with the bend hooked over the node and no overlap (found by a fit search at 25 degrees)

function pyramid_legs() = [for (sx = [-1, 1], l = [[leg_yf, bar_tf, bar_wf], [leg_yb, bar_tb, bar_wb]])
    [[sx*leg_x, l[0], leg_z], l[1], l[2]]];

module anchor_pyramid() {
    p = [0, grip_y, tri_apex];
    for (l = pyramid_legs()) bar(l[0], p, l[1], l[2], bar_r);
    // the node is 2*eps fatter than the bars, so their faces never meet exactly
    hull() for (l = pyramid_legs())
        bar(p + (l[0] - p) * node_len / norm(l[0] - p), p, l[1] + 2*eps, l[2] + 2*eps, bar_r);
}

// Keel: a full-width triangle plate under the housing, with a hole through it. It carries the
// load straight out to the side walls, like the pyramid. The carabiner rests on the bottom of
// the hole, right under the anchor plane.
keel_t = 10;                                 // plate thickness (front to back)
keel_hole = 16;                              // hole diameter
keel_wall = 7;                               // material around the hole
keel_hz = -(keel_hole/2 + 6);                // hole centre height

keel_xe = W/2 - 3; keel_rb = keel_hole/2 + keel_wall;
module keel_profile() hull() {
    translate([-keel_xe, 0]) square([2*keel_xe, 3]);
    translate([0, keel_hz]) circle(r = keel_rb, $fn = 64);
}

// triangle windows, one each side, for less plastic and the look of the pyramid
module keel_windows() {
    zs = keel_hz - keel_rb;
    for (m = [0, 1]) mirror([m, 0])
        offset(r = 2) offset(delta = -2)
            polygon([[keel_rb + 4, -3], [keel_xe - 18, -3], [keel_rb + 4, zs * (1 - (keel_rb + 4) / keel_xe) + 7]]);
}

module anchor_keel() difference() {
    hull() {
        xz(grip_y - keel_t/2 + 1, keel_t - 2) keel_profile();
        xz(grip_y - keel_t/2, keel_t) offset(-1) keel_profile();
    }
    xz(grip_y - keel_t/2 - 1, keel_t + 2) keel_windows();
    translate([0, grip_y, keel_hz]) rotate([90, 0, 0]) cylinder(d = keel_hole, h = keel_t + 2, center = true, $fn = 64);
}

module anchor_any() {
    if (anchor == "pyramid") anchor_pyramid();
    if (anchor == "keel") anchor_keel();
}

// height of the carabiner rod centreline at the top of its bend
function seat_z() = anchor == "keel" ? keel_hz - keel_hole/2 + 5.5 + (16 - sqrt(16*16 - keel_t*keel_t/4))   // bend drops at the fin faces
                  : tri_rod_z;

module housing_shell() {
    minkowski() {
        xz(r_out, D - 2*r_out) translate([0, H/2]) rrect(W - 2*r_out, H - 2*r_out, corner - r_out);
        sphere(r = r_out, $fn = 24);
    }
}

// the pocket profile from y0 back to y0 + t, grown by o on every side
module pocket_prof(y0, t, o = 0) xz(y0, t) translate([0, floor_t + pk_h/2]) rrect(pk_w + 2*o, pk_h + 2*o, r_in + o);

// a bevel on the pocket opening at y0, that widens toward dir (-1: the front, 1: the back)
module bevel_cut(y0, dir) hull() {
    pocket_prof(dir > 0 ? y0 - eps : y0 - 1, 1 + eps, bevel);
    pocket_prof(y0 - dir * bevel - (dir > 0 ? 0 : eps), eps);
}

// the pocket, through from the front to the back, around the lips
module pocket_cut() difference() {
    union() {
        pocket_prof(-1, D + 2);
        bevel_cut(0, -1);
        bevel_cut(D, 1);
    }
    lips();
}

// Front lips: one on each side wall, from above the round pocket corner to lip_top, lip_in over
// the insert side. Their inner edges, which the fingers can touch, are rounded.
module lips() for (m = [0, 1]) mirror([m, 0, 0])
    translate([0, 0, floor_t + r_in]) linear_extrude(lip_top - floor_t - r_in)
        translate([pk_w/2 - lip_in, -1]) offset(r = 1, $fn = 16) offset(delta = -1)
            square([lip_in + side_t/2, lip_d + 1]);

// Back stop: a tongue across the back of the floor, fixed at its left end, with a bump on its free
// right end. The insert rides over the ramp at the back of the bump, pressing the tongue down, and the
// square front of the bump stops it behind the insert. To take the insert out, press the free end down
// and push the insert out the back. The tongue runs across, so it bends along the print layers.
stop_len = 25; stop_wy = 5; stop_t = 2;      // tongue: length (across), width (front to back), thickness
stop_drop = 1.5;                             // room under the tongue to bend down
stop_gap = 1;                                // slot around the tongue
stop_h = 1;                                  // bump height above the floor
stop_bump = 6;                               // bump length, at the free end

module stop_cut() translate([-stop_len/2, pk_d - 2 - stop_gap, floor_t - stop_t - stop_drop])
    cube([stop_len + stop_gap, D - pk_d + 3 + stop_gap, stop_t + stop_drop + 1]);

module stop_tongue() {
    translate([-stop_len/2 - eps, pk_d - 2, floor_t - stop_t]) cube([stop_len + eps, D - pk_d + 2, stop_t]);
    // the bump: a square face at the back of the insert, a 45 degree ramp toward the back
    translate([stop_len/2 - stop_bump, 0, floor_t - eps]) rotate([90, 0, 90]) linear_extrude(stop_bump)
        polygon([[pk_d, 0], [pk_d, stop_h], [pk_d + 0.5, stop_h], [pk_d + 0.5 + stop_h + eps, 0]]);
}

// the name on top
module name_cut()
    translate([0, D/2, H - 0.6]) linear_extrude(1)
        text("opengrips", size = 8, spacing = 1.15, font = "Liberation Sans:style=Bold", halign = "center", valign = "center");

module housing() {
    difference() {
        union() {
            housing_shell();
            anchor_any();
        }
        pocket_cut();
        stop_cut();
        name_cut();
    }
    stop_tongue();
}
