"""A seven-second gentle giant: arrival, takeover, wiggle and departure."""
import math
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import common
from common import setup, finish, material, empty, ico, tube, key, ease

scene, options = setup("worm-takeover", 7, center=1.75, width=13.8)
mint, jade = material("mint body", "mint"), material("jade segments", "jade")
cream, ink, rose = material("belly", "cream"), material("eyes", "ink"), material("cheeks", "rose")
gold, white = material("antenna tips", "amber"), material("glints", "FFFFFF")
worm = empty("friendly takeover worm")
segments = []
for i in range(10):
    segment = empty("wiggling segment", worm)
    ico("rounded segment", (0, 0, 0), (.32, .37, .36), mint if i % 3 else jade, segment)
    ico("cream underside", (0, -.19, -.15), (.25, .24, .18), cream, segment)
    segments.append(segment)
head = empty("worm face", worm)
ico("round head", (0, 0, 0), (.65, .49, .59), mint, head)
for x in [-.24, .24]:
    ico("eye", (x, -.445, .19), (.087, .07, .13), ink, head)
    ico("glint", (x - .015, -.501, .23), (.024, .016, .032), white, head)
    ico("cheek", (x * 1.45, -.429, -.06), (.12, .035, .07), rose, head)
    tube("antenna", [(x, 0, .44), (x * 1.4, 0, .72), (x * 1.55, -.03, .81)], .035, jade, head)
    ico("antenna tip", (x * 1.55, -.03, .81), (.09, .09, .09), gold, head)
tube("smile", [(-.14, -.48, -.12), (0, -.505, -.19), (.14, -.48, -.12)], .022, ink, head)
for f in range(1, scene.frame_end + 1):
    t = (f - 1) / common.FPS
    if t < 1.4:
        size = .25 + .65 * ease(t / 1.4)
        x = -7 + 5.3 * ease(t / 1.4)
    elif t < 3.0:
        size = .9 + 2.15 * ease((t - 1.4) / 1.6)
        x = -1.7 + 1.25 * ease((t - 1.4) / 1.6)
    elif t < 4.7:
        size, x = 3.05 + math.sin(t * 5) * .07, -.45
    else:
        size = 3.05 - 2.80 * ease((t - 4.7) / 1.3)
        x = -.45 + 8.3 * ease((t - 5.6) / 1.4)
    # Preserve the existing animation after .2s; the first pose starts fully outside.
    x -= 1 - ease(t / .2)
    worm.scale = (size, size, size)
    worm.location = (x, 0, .05)
    for i, segment in enumerate(segments):
        segment.location = (-1.65 + i * .29, math.sin(t * 5 - i * .55) * .12, .46 + math.sin(t * 5 - i * .6) * .08)
        key(segment, f)
    head.location = (1.30, -.02, .67 + math.sin(t * 5 - 6) * .09)
    head.rotation_euler.y = math.sin(t * 4) * .08
    key(head, f)
    key(worm, f)
finish(scene, options, "worm-takeover")
