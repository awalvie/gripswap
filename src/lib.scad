// Shared 2D/3D helpers. Axes: X = width, Y = depth (front at y=0, +Y to the back), Z = up.

eps = 0.01;   // a small overlap or gap, so no two faces meet exactly: exact contact leaves slivers in the STL

// rounded rectangle, centred
module rrect(w, h, r) { offset(r) offset(-r) square([w, h], center = true); }

// extrude a 2D shape drawn in the XZ plane from y0 back to y0 + t
module xz(y0, t) { translate([0, y0 + t, 0]) rotate([90, 0, 0]) linear_extrude(t) children(); }

// width of a row of n pockets, w wide, with gap between them
function row_span(n, w, gap) = n * w + (n - 1) * gap;

// round rod from a to b
module seg(a, b, d) { hull() { translate(a) sphere(d = d); translate(b) sphere(d = d); } }
