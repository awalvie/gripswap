// Insert interface: every housing has this pocket, every insert fits it.
// The pocket runs through the housing. Inserts slide in from the back, and two lips at the front,
// left and right, stop them: the fingers pull the insert forward, onto the lips. The lips cover the
// lower half of the pocket only, so the roller axle passes over them.

pk_w = 101.4; pk_h = 60; pk_d = 35.5; r_in = 4;  // pocket envelope: a 90 mm slot with walls, the lips and the gap; 22 mm finger room on each grip of a two-sided insert;
                                                 // a 25 mm edge with a 5 mm ergo curve (32.5 mm back in the middle), a wall behind it
clear = 0.3;                                 // gap between insert and pocket, per side
lip_d = 4; lip_in = 3;                       // front lips: depth front to back, reach over the insert side

// Anchor plane: the anchor sits under it, so the edge stays flat under load.
// Lip + 8 mm, near where the finger pads load (a guess, to be tested). The roller axle sits on it.
grip_y = 8;

// Housing walls around the pocket. Every housing shares these, so every housing takes every insert.
floor_t = 8; side_t = 4; top_t = 10; stop_l = 3;   // stop_l: room behind the insert for the back stop
W = pk_w + 2*side_t; H = floor_t + pk_h + top_t; D = pk_d + stop_l;
ins_bot = floor_t + clear; ins_top = floor_t + pk_h - clear;   // bottom and top of every insert
lip_top = floor_t + pk_h/2;                  // top of the lips: the middle of the pocket
