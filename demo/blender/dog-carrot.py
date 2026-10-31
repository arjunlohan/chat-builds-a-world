"""A seven-second carrot chase. All geometry, materials and motion are original."""
import math
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import setup, finish, material, empty, ico, cone, tube, shadow, key, ease

scene, options = setup("dog-carrot", 7, center=1.1, width=13.2)
oat, cream, ink = material("oat fur", "amber"), material("cream muzzle", "cream"), material("eyes", "ink")
rose, white = material("blush", "rose"), material("eye glints", "FFFFFF")
dog = empty("small rounded dog")
dog.scale = (2, 2, 2)
body = ico("round body", (0, 0, .73), (.78, .40, .43), oat, dog)
ico("cream bib", (.48, -.12, .70), (.34, .32, .32), cream, dog)
head = empty("curious head", dog)
head.location = (.58, 0, 1.12)
ico("head", (0, 0, 0), (.46, .41, .43), oat, head)
ico("muzzle", (.33, -.08, -.13), (.30, .30, .22), cream, head)
ico("button nose", (.58, -.12, -.07), (.12, .13, .10), ink, head)
for y in [-.32, .27]:
    ico("bright eye", (.16, y, .13), (.085, .055, .10), ink, head)
    ico("eye glint", (.18, y - .035, .17), (.023, .023, .025), white, head)
ears = [ico("floppy ear", (-.18, y, -.15), (.17, .16, .34), oat, head) for y in [-.36, .36]]
ico("blushing cheek", (.13, -.365, -.09), (.13, .035, .07), rose, head)
feet = []
for x in [-.45, .42]:
    for y in [-.27, .27]:
        leg = empty("short leg", dog)
        leg.location = (x, y, .44)
        ico("leg", (0, 0, -.10), (.13, .13, .26), oat, leg)
        ico("soft paw", (.07, 0, -.30), (.20, .15, .105), cream, leg)
        feet.append(leg)
tail = empty("wagging tail", dog)
tail.location = (-.68, 0, .85)
tube("curled tail", [(0, 0, 0), (-.23, 0, .25), (-.24, 0, .52), (-.10, 0, .58)], .10, oat, tail)
carrot = empty("bouncing carrot")
carrot.scale = (1.6, 1.6, 1.6)
orange, green = material("carrot orange", "orange"), material("carrot leaves", "jade")
root = cone("tapered carrot", (0, 0, 0), .25, .86, orange, carrot, tip=.045)
root.rotation_euler.y = math.pi
for i, angle in enumerate([-.5, .0, .5]):
    leaf = ico("carrot top", (math.sin(angle) * .16, i * .035, .58), (.11, .065, .32), green, carrot)
    leaf.rotation_euler.y = angle
shade = shadow("running shadow", 0, 1.1, .44)
shade.scale = (2, 2, 1)
for f in range(1, scene.frame_end + 1):
    t = (f - 1) / 30
    # Carrot leads the dog into view; both clear the right edge with a quiet tail.
    x = -12 + 8 * ease(t / .95) + 7 * ease((t - .8) / 5) + 9 * ease((t - 5.2) / 1.35)
    stride = t * math.tau * 2.7
    dog.location = (x, -.10, abs(math.sin(stride)) * .28)
    dog.rotation_euler.z = math.sin(t * 2) * .035
    head.rotation_euler = (0, -.08 + math.sin(stride) * .045, -.18)
    for i, leg in enumerate(feet):
        leg.rotation_euler.y = math.sin(stride + (i % 3) * math.pi) * .5
        key(leg, f, "rotation_euler")
    for i, ear in enumerate(ears):
        ear.rotation_euler.x = math.sin(stride + i) * .18
        key(ear, f, "rotation_euler")
    tail.rotation_euler.x = math.sin(t * 15) * .6
    carrot.location = (x + 3.4 + math.sin(t * 2) * .14, .06, 1.6 + abs(math.sin(t * 5.2)) * 1.0)
    carrot.rotation_euler = (.12, .55 + math.sin(t * 5.2) * .32, -.18)
    shade.location.x = x
    for obj in [dog, head, tail, carrot, shade]:
        key(obj, f)
finish(scene, options, "dog-carrot", require_empty_ends=True)
