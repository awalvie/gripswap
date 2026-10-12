// Fit test: a thin ring of the housing pocket and a thin insert outline, full size, so a
// printer that prints wide or flares the first layer shows it before the full kit.

fit_d = 8;                                   // depth of both parts
fit_t = 3;                                   // ring top and floor; the sides keep side_t
fit_wall = 2.4;                              // frame wall

// the front of the pocket with its bevel and the lips, in a ring
module fit_ring() difference() {
    xz(0, fit_d) translate([0, floor_t + pk_h/2]) rrect(W, pk_h + 2*fit_t, corner);
    pocket_cut();
}

// the front of the insert outline with its notches, open in the middle
module fit_frame() difference() {
    intersection() {
        insert_blank();
        translate([-W, -1, 0]) cube([2*W, fit_d + 1, H]);
    }
    xz(-1, fit_d + 2) translate([0, floor_t + pk_h/2]) rrect(pk_w - 2*clear - 2*fit_wall - 2*lip_in, pk_h - 2*clear - 2*fit_wall, 1);
}
