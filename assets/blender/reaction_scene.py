"""Original reaction choreography, built entirely from meshes and curves. No emote likenesses."""
import math
import random
import common
from common import empty, ico, cone, tube, material, key, ease


def build(name):
    scene, options = common.setup(name, 6, center=2.0, width=13.4)
    colors = {c: material(c, c) for c in common.PALETTE}
    root = empty(name + " entrance and exit")
    people = []

    def citizen(x, color, size=1):
        body = empty("rounded citizen", root)
        ico("body", (0, 0, .9), (.7, .55, .85), colors[color], body)
        ico("cream muzzle", (0, -.45, 1), (.49, .2, .4), colors["cream"], body)
        for side in [-1, 1]:
            cone("ear", (side*.4, 0, 1.77), .19, .48, colors[color], body)
            ico("eye", (side*.19, -.635, 1.11), (.065, .035, .085), colors["ink"], body)
            ico("foot", (side*.39, -.12, .16), (.29, .32, .18), colors["cream"], body)
            ico("mitten", (side*.72, -.04, .85), (.21, .23, .26), colors[color], body)
        people.append((body, x, size))
        return body

    def beam(a, b, thickness, mat, parent):
        # A rectangular beam, never a font glyph or a text object.
        from mathutils import Vector
        v = Vector(b)-Vector(a)
        import bpy
        bpy.ops.mesh.primitive_cube_add(size=1)
        obj = bpy.context.object
        obj.name, obj.parent = "letter beam", parent
        obj.location, obj.scale = (Vector(a)+Vector(b))/2, (thickness, thickness, v.length)
        obj.rotation_euler = v.to_track_quat("Z", "Y").to_euler()
        obj.data.materials.append(mat)

    letters = []
    paths = {
        "w": [[(-1, 1), (-.5, -1), (0, .2), (.5, -1), (1, 1)]],
        "l": [[(-.6, 1), (-.6, -1), (.8, -1)]],
        "f": [[(-.6, -1), (-.6, 1), (.8, 1)], [(-.6, .1), (.5, .1)]],
        "g": [[(.75, .8), (.2, 1), (-.65, .7), (-.85, 0), (-.6, -.8), (.3, -1), (.8, -.5), (.8, 0), (.15, 0)]],
    }
    if name in ["w", "l", "gg", "f"]:
        citizen(-2.25, "mint" if name=="w" else "lavender")
        if name=="gg": citizen(2.25, "rose")
        for i, glyph in enumerate("gg" if name=="gg" else name):
            letter = empty("sculpted " + glyph, root)
            letter.location = ((i-.5)*2.6 if name=="gg" else 0, .4, 2.5)
            for path in paths[glyph]:
                for a,b in zip(path,path[1:]):
                    beam((a[0],0,a[1]), (b[0],0,b[1]), .28, colors["amber"], letter)
            letters.append((letter, letter.location.copy()))
    elif name in ["love", "dance"]:
        citizen(-1.55, "rose" if name=="love" else "mint")
        citizen(1.55, "lavender" if name=="love" else "rose")
    else:
        citizen(0, {"laugh":"amber","nervous":"mint","sleepy":"lavender","rage":"rose","sarcasm":"lavender"}[name], 1.4)

    props = []
    rng = random.Random(93)
    for i in range(14):
        p = empty("orbiting reaction sculpture", root)
        if name=="love":
            # Heart from two lobes and a tapered point, no image or texture.
            ico("heart lobe", (-.13,0,.1), (.2,.12,.22), colors["rose"], p)
            ico("heart lobe", (.13,0,.1), (.2,.12,.22), colors["rose"], p)
            point=cone("heart point", (0,0,-.16), .27, .42, colors["rose"], p)
            point.rotation_euler.y=math.pi
        elif name in ["sleepy", "sarcasm", "w", "gg"]:
            # Five spikes around an amber core, entirely geometry.
            ico("star core", (0,0,0), (.16,.1,.16), colors["amber"], p)
            for j in range(5):
                a=j*math.tau/5
                spike=cone("star point", (math.sin(a)*.18,0,math.cos(a)*.18), .095,.25,colors["amber"],p)
                spike.rotation_euler.y=a
        else:
            ico("droplet" if name=="nervous" else "warm puff", (0,0,0), (.17,.15,.3) if name=="nervous" else (.23,.18,.23), colors[["mint","cream","amber","rose"][i%4]],p)
        props.append((p,rng.random()*math.tau,rng.uniform(1.6,3.8),rng.uniform(.5,1.1)))
    if name=="sleepy":
        tube("crescent cradle", [(-2,0,1.1),(-1.5,0,.25),(0,0,-.1),(1.5,0,.25),(2,0,1.1)], .27, colors["amber"],root)
    if name=="sarcasm":
        tube("off balance seesaw", [(-3,0,2.8),(3,0,3.5)], .14, colors["mint"],root)

    for f in range(1,scene.frame_end+1):
        t=(f-1)/common.FPS
        entrance=ease((t-.25)/.5)
        departure=ease((t-4.7)/.7)
        scale=entrance*(1-departure)
        # Zero scale for several first/last frames, checked on saved pixels.
        root.scale=(scale,scale,scale)
        root.location.z=departure*3
        key(root,f)
        for i,(body,x,size) in enumerate(people):
            bounce=abs(math.sin(t*6+i))*.32
            body.location=(x, -.2, bounce if name not in ["sleepy","nervous"] else math.sin(t*2)*.08)
            body.scale=(size,size,size)
            body.rotation_euler.y=math.sin(t*(13 if name=="nervous" else 5)+i)*(.05 if name=="nervous" else .16)
            if name=="laugh": body.rotation_euler.y=math.sin(t*4)*.65
            if name=="rage": body.location.z=abs(math.sin(t*9))*.45
            if name=="sleepy": body.rotation_euler.y=-.65
            if name=="sarcasm": body.rotation_euler.y=.3+math.sin(t*3)*.1
            key(body,f)
        for p,phase,radius,speed in props:
            a=phase+t*speed
            p.location=(math.cos(a)*radius,.8,2.1+math.sin(a)*1.5)
            if name=="rage": p.location=(math.cos(phase)*(1+t%1)*1.1,.7,2+(t*1.6+phase)%2)
            p.rotation_euler.y=a
            key(p,f)
        for letter,base in letters:
            letter.location=base
            letter.location.z+=math.sin(t*3)*.15
            letter.rotation_euler.y=math.sin(t*2)*.08
            key(letter,f)
    common.finish(scene,options,name)
