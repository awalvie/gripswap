// Housing: a box around the pocket, with an anchor under it.

r_out = 2.5;               // round on every body edge but the front ones, which sit on the print bed
corner = 6;                // corner radius in the front view
bevel = 1.5;               // bevel around the back pocket opening, a lead-in for the insert
bevel_f = 0.5;             // bevel around the front opening: room for a flared first layer

// Keel: a full-width triangle plate under the front of the housing, with a hole through it. It
// carries the load straight out to the side walls. It runs from the front face back to twice the
// anchor plane, so it is centred under the grip and lies flat on the print bed.
keel_t = 2 * grip_y;                         // plate thickness (front to back)
keel_hole = 16;                              // hole diameter at the anchor plane
keel_wall = 7;                               // material around the hole
keel_hz = -(keel_hole/2 + 6);                // hole centre height
seat_r = 10;                                 // the hole widens toward both faces on this radius, tighter than
                                             // the inside of the carabiner bend (11), so the carabiner sits on
                                             // the crown under the anchor plane

keel_xe = W/2 - 3; keel_rb = keel_hole/2 + keel_wall;
module keel_profile() hull() {
    translate([-keel_xe, 0]) square([2*keel_xe, 3]);
    translate([0, keel_hz]) circle(r = keel_rb, $fn = 64);
}

// triangle windows, one each side, for less plastic
module keel_windows() {
    zs = keel_hz - keel_rb;
    for (m = [0, 1]) mirror([m, 0])
        offset(r = 2) offset(delta = -2)
            polygon([[keel_rb + 4, -3], [keel_xe - 18, -3], [keel_rb + 4, zs * (1 - (keel_rb + 4) / keel_xe) + 7]]);
}

// the hole: narrowest at the anchor plane, wider toward both faces
module keel_seat() translate([0, 0, keel_hz]) rotate([-90, 0, 0]) rotate_extrude($fn = 64)
    polygon(concat([[0, -1]], [for (i = [0 : 16]) let(y = -1 + i * (keel_t + 2) / 16)
        [keel_hole/2 + seat_r - sqrt(pow(seat_r, 2) - pow(y - grip_y, 2)), y]], [[0, keel_t + 1]]));

module anchor_keel() difference() {
    hull() {
        xz(0, keel_t - 1) keel_profile();
        xz(0, keel_t) offset(-1) keel_profile();
    }
    xz(-1, keel_t + 2) keel_windows();
    keel_seat();
}

// height of the carabiner rod centreline where it sits on the crown of the hole
function seat_z() = keel_hz - keel_hole/2 + 5;

// the body, rounded on every edge but the front ones, so the whole front face sits on the print bed
module housing_shell() intersection() {
    minkowski() {
        xz(-r_out, D) translate([0, H/2]) rrect(W - 2*r_out, H - 2*r_out, corner - r_out);
        sphere(r = r_out, $fn = 24);
    }
    xz(0, D + 1) translate([0, H/2]) square([W + 1, H + 1], center = true);
}

// the pocket profile from y0 back to y0 + t, grown by o on every side
module pocket_prof(y0, t, o = 0) xz(y0, t) translate([0, floor_t + pk_h/2]) rrect(pk_w + 2*o, pk_h + 2*o, r_in + o);

// a bevel of size b on the pocket opening at y0, that widens toward dir (-1: the front, 1: the back)
module bevel_cut(y0, dir, b) hull() {
    pocket_prof(dir > 0 ? y0 - eps : y0 - 1, 1 + eps, b);
    pocket_prof(y0 - dir * b - (dir > 0 ? 0 : eps), eps);
}

// the pocket, through from the front to the back, around the lips
module pocket_cut() difference() {
    union() {
        pocket_prof(-1, D + 2);
        bevel_cut(0, -1, bevel_f);
        bevel_cut(D, 1, bevel);
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
stop_len = 25; stop_t = 2;                   // tongue: length (across), thickness
stop_drop = 1.5;                             // room under the tongue to bend down
stop_gap = 1;                                // slot around the tongue
stop_h = 1;                                  // bump height above the floor
stop_bump = 6;                               // bump length, at the free end

// The housing prints on its front, so the tongue grows upward from its front edge. That edge and the
// slot in front of it run at 45 degrees. Only the first layers of that edge hang over the 1 mm slot,
// held at the fixed end.
stop_y = pk_d - 2;                           // front of the tongue, at its top face

module stop_cut() translate([-stop_len/2, 0, 0]) rotate([90, 0, 90]) linear_extrude(stop_len + stop_gap)
    polygon([[stop_y - stop_gap - 1, floor_t + 1], [stop_y - stop_gap + stop_t + stop_drop, floor_t - stop_t - stop_drop],
             [D + 1, floor_t - stop_t - stop_drop], [D + 1, floor_t + 1]]);

module stop_tongue() {
    translate([-stop_len/2 - eps, 0, 0]) rotate([90, 0, 90]) linear_extrude(stop_len + eps)
        polygon([[stop_y, floor_t], [stop_y + stop_t, floor_t - stop_t], [D, floor_t - stop_t], [D, floor_t]]);
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
            anchor_keel();
        }
        pocket_cut();
        stop_cut();
        name_cut();
    }
    stop_tongue();
}
