"""Six-second chat-reaction concept: citizens, balloons and procedural confetti."""
import math
import random
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import setup, finish, material, empty, ico, cone, tube, shadow, key, ease

scene, options = setup("cheer-burst", 6, center=2.1, width=13.4)
colors = [material("mint", "mint"), material("coral", "rose"), material("lilac", "lavender"), material("gold", "amber")]
cream, ink, white = material("cream", "cream"), material("ink", "ink"), material("glints", "FFFFFF")
citizens = []
for i, x in enumerate([-2.1, 0, 2.1]):
    citizen = empty("cheering citizen")
    ico("round body", (0, 0, .66), (.44, .37, .55), colors[i], citizen)
    ico("cream face", (0, -.29, .68), (.32, .16, .28), cream, citizen)
    for side in [-1, 1]:
        cone("pointed ear", (side * .24, 0, 1.18), .13, .42, colors[i], citizen)
        ico("eye", (side * .12, -.433, .76), (.05, .035, .065), ink, citizen)
        ico("glint", (side * .12 - .01, -.459, .78), (.013, .01, .019), white, citizen)
        ico("paw", (side * .25, -.03, .14), (.19, .23, .14), cream, citizen)
        ico("waving mitten", (side * .47, -.04, .68), (.14, .15, .18), colors[i], citizen)
    shadow("citizen shadow", x, .7, .32)
    citizens.append((citizen, x))
balloons = []
for i in range(12):
    root = empty("balloon and string")
    ico("faceted balloon", (0, 0, 0), (.36, .31, .46), colors[i % 4], root)
    cone("knot", (0, 0, -.43), .055, .13, colors[i % 4], root)
    tube("curly string", [(0, 0, -.48), (.10, 0, -.9), (-.05, 0, -1.2), (.05, 0, -1.55)], .014, cream, root)
    balloons.append(root)
rng = random.Random(44)
confetti = []
for i in range(44):
    obj = cone("paper confetti", (0, 0, 0), .09, .018, colors[i % 4], tip=.09)
    confetti.append((obj, rng.uniform(-3.8, 3.8), rng.uniform(-.4, 1.4), rng.uniform(3.0, 5.8), rng.random() * 5))
for f in range(1, scene.frame_end + 1):
    t = (f - 1) / 30
    for i, (citizen, x) in enumerate(citizens):
        pulse = max(0, math.sin((t - .5) * math.tau * 1.55 + i * .5)) if t > .5 else 0
        citizen.location = (x, -.2, pulse * .48)
        citizen.scale = (1 + pulse * .05, 1 + pulse * .05, 1 - pulse * .05)
        citizen.rotation_euler.y = math.sin(t * 8 + i) * .12
        key(citizen, f)
    for i, root in enumerate(balloons):
        age = max(0, t - .65 - i * .08)
        visible = ease(age * 5)
        root.scale = (visible, visible, visible)
        root.location = ((i % 6 - 2.5) * 1.30 + math.sin(age * 1.4 + i) * .22, .8 + (i // 6) * .3, 1.1 + age * 1.12)
        root.rotation_euler.y = math.sin(age * 2 + i) * .12
        key(root, f)
    for obj, vx, vy, vz, phase in confetti:
        age = t - 1.0
        alive = 0 < age < 4.5
        size = .001 if not alive else min(1, age * 5) * max(.001, 1 - max(0, age - 3.6))
        obj.scale = (size, size, size)
        obj.location = (vx * age * .55, vy, max(.02, .8 + vz * age - 1.3 * age * age))
        obj.rotation_euler = (age * 3 + phase, age * 2, age * 4 + phase)
        key(obj, f)
finish(scene, options, "cheer-burst")
