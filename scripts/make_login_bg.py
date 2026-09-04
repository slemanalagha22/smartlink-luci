"""
Generate the login backdrop, in both colour schemes.

The artwork is a real lattice: legs that taper, ties whose spacing tightens
towards the top, and X-bracing between the bays - drawn from geometry rather
than by hand, because a mast made of two straight lines reads as scaffolding
rather than as a telecom tower.

Two files are written, one per scheme. The login page follows the interface's
colour scheme: a dark login screen in front of a light interface reads as two
different products.

    python scripts/make_login_bg.py
"""

import math
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
STATIC = ROOT / "luci-theme-smartlink/htdocs/luci-static/smartlink"

# The frame is deliberately wide - 2.1:1, close to the aspect of the screens
# this runs on. preserveAspectRatio=slice crops whichever axis is surplus, and
# a squarer frame meant the browser cropped the top off the masts. Tips are
# also kept well below the upper edge so a taller crop still spares them.
W, H = 1600, 760
GROUND = 648   # masts stand on this line rather than running off the frame
SKY = 205      # nothing structural sits above this

PALETTES = {
    "login-bg.svg": {
        "stroke":    "#8ecbff",
        "glow":      ("#2ea8e4", ".30", "#1d5f8f", ".10", "#04101d"),
        "leg":       (".05", ".34", ".12"),
        "mesh":      ".13",
        "node":      ".45",
        "head":      ".70",
        "arc":       "#2ea8e4",
        "arc_top":   0.42,
        "star":      "#ffffff",
        "star_base": 0.10,
        "haze":      "#04101d",
    },
    "login-bg-light.svg": {
        "stroke":    "#4a7fa8",
        "glow":      ("#2ea8e4", ".20", "#8fbedd", ".12", "#eef4fb"),
        "leg":       (".08", ".30", ".10"),
        "mesh":      ".16",
        "node":      ".34",
        "head":      ".48",
        "arc":       "#2ea8e4",
        "arc_top":   0.36,
        "star":      "#3d6f96",
        "star_base": 0.07,
        "haze":      "#dbe8f5",
    },
}

# Two masts frame the card, two smaller ones sit further back for depth.
# None of them cross the band the card occupies.
TOWERS = [
    dict(cx=268,  tip=SKY + 25, hb=66, ht=8, bays=10, arcs=(40, 68, 96), depth=1.0),
    dict(cx=1338, tip=SKY,      hb=72, ht=9, bays=11, arcs=(44, 74, 104), depth=1.0),
    dict(cx=112,  tip=402,      hb=36, ht=6, bays=7,  arcs=(28, 48),     depth=0.5),
    dict(cx=1494, tip=430,      hb=32, ht=5, bays=6,  arcs=(26, 44),     depth=0.5),
]

# The link mesh threads between the mast heads and a few ground relays,
# staying out of the middle where the card sits.
MESH_NODES = [(268, SKY + 25), (1338, SKY), (112, 402), (1494, 430),
              (398, 520), (1206, 548)]
MESH_LINKS = [(0, 2), (0, 4), (2, 4), (1, 3), (1, 5), (3, 5), (4, 5)]

STARS = [(150, 96), (410, 70), (980, 86), (1500, 130), (1180, 46),
         (640, 118), (1430, 250), (232, 180), (900, 156), (1090, 220),
         (760, 62), (1290, 96)]


def mast(cx, base_y, tip_y, half_base, half_top, bays):
    """One lattice mast as (legs, ties, braces) path data."""
    height = base_y - tip_y

    # cumulative fractions, tighter as they climb
    nodes = []
    for i in range(bays + 1):
        f = (i / bays) ** 1.35
        y = base_y - height * f
        half = half_base + (half_top - half_base) * f
        nodes.append((y, cx - half, cx + half))

    legs = "M{:.1f} {:.1f} L{:.1f} {:.1f} M{:.1f} {:.1f} L{:.1f} {:.1f}".format(
        nodes[0][1], nodes[0][0], nodes[-1][1], nodes[-1][0],
        nodes[0][2], nodes[0][0], nodes[-1][2], nodes[-1][0])

    ties = " ".join("M{:.1f} {:.1f} H{:.1f}".format(l, y, r) for (y, l, r) in nodes[1:])

    braces = []
    for i in range(len(nodes) - 1):
        y0, l0, r0 = nodes[i]
        y1, l1, r1 = nodes[i + 1]
        a, b = ((l0, r1) if i % 2 == 0 else (r0, l1))
        braces.append("M{:.1f} {:.1f} L{:.1f} {:.1f}".format(a, y0, b, y1))

    return legs, ties, " ".join(braces)


def arcs(cx, cy, radii, spread=58):
    """Concentric signal arcs opening upward from a mast tip."""
    a0 = math.radians(180 + spread)
    a1 = math.radians(360 - spread)

    return [
        "M{:.1f} {:.1f} A{:.0f} {:.0f} 0 0 1 {:.1f} {:.1f}".format(
            cx + r * math.cos(a0), cy + r * math.sin(a0), r, r,
            cx + r * math.cos(a1), cy + r * math.sin(a1))
        for r in radii
    ]


def build(filename, pal):
    stroke = pal["stroke"]
    g = pal["glow"]
    leg = pal["leg"]
    parts = []

    parts.append(
        '<defs>'
        '<radialGradient id="glow" cx="50%" cy="100%" r="72%">'
        '<stop offset="0%" stop-color="{}" stop-opacity="{}"/>'
        '<stop offset="55%" stop-color="{}" stop-opacity="{}"/>'
        '<stop offset="100%" stop-color="{}" stop-opacity="0"/>'
        '</radialGradient>'
        '<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">'
        '<stop offset="0%" stop-color="{}" stop-opacity="{}"/>'
        '<stop offset="45%" stop-color="{}" stop-opacity="{}"/>'
        '<stop offset="100%" stop-color="{}" stop-opacity="{}"/>'
        '</linearGradient>'
        '<linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">'
        '<stop offset="0%" stop-color="{}" stop-opacity="0"/>'
        '<stop offset="62%" stop-color="{}" stop-opacity="{}"/>'
        '<stop offset="100%" stop-color="{}" stop-opacity="{}"/>'
        '</linearGradient>'
        '</defs>'.format(g[0], g[1], g[2], g[3], g[4],
                         stroke, leg[0], stroke, leg[1], stroke, leg[2],
                         pal["haze"], pal["haze"], ".55", pal["haze"], ".92")
    )

    parts.append('<rect width="{}" height="{}" fill="url(#glow)"/>'.format(W, H))

    # A horizon for the masts to stand on, and haze that settles over their
    # feet so nothing looks sawn off at the bottom of the frame.
    parts.append(
        '<path d="M0 {} H{}" stroke="{}" stroke-opacity="{}" stroke-width="1.2"/>'
        .format(GROUND, W, stroke, pal["mesh"])
    )
    parts.append(
        '<rect x="0" y="{}" width="{}" height="{}" fill="url(#haze)"/>'
        .format(GROUND - 120, W, H - GROUND + 120)
    )

    # --- mesh ---------------------------------------------------------
    mesh = " ".join(
        "M{} {} L{} {}".format(MESH_NODES[a][0], MESH_NODES[a][1],
                               MESH_NODES[b][0], MESH_NODES[b][1])
        for a, b in MESH_LINKS
    )

    parts.append(
        '<path d="{}" fill="none" stroke="{}" stroke-opacity="{}" '
        'stroke-width="1.1"/>'.format(mesh, stroke, pal["mesh"])
    )

    for x, y in MESH_NODES:
        parts.append('<circle cx="{}" cy="{}" r="4.5" fill="{}" '
                     'fill-opacity="{}"/>'.format(x, y, stroke, pal["node"]))

    # --- towers -------------------------------------------------------
    for t in TOWERS:
        legs, ties, braces = mast(t["cx"], GROUND, t["tip"], t["hb"], t["ht"], t["bays"])

        # Masts further back are drawn fainter; that is the whole of the
        # depth cue, and it is cheaper than a second palette.
        depth = t.get("depth", 1.0)

        parts.append(
            '<g fill="none" stroke="url(#fade)" stroke-linecap="round" opacity="{:.2f}">'
            '<path d="{}" stroke-width="2.4"/>'
            '<path d="{}" stroke-width="1.3"/>'
            '<path d="{}" stroke-width="1"/>'
            '</g>'.format(depth, legs, ties, braces)
        )

        parts.append('<circle cx="{}" cy="{}" r="{:.1f}" fill="{}" '
                     'fill-opacity="{:.2f}"/>'.format(
                         t["cx"], t["tip"], 5 * depth, stroke,
                         float(pal["head"]) * depth))

        for i, d in enumerate(arcs(t["cx"], t["tip"], t["arcs"])):
            parts.append(
                '<path d="{}" fill="none" stroke="{}" stroke-opacity="{:.2f}" '
                'stroke-width="2.2" stroke-linecap="round"/>'.format(
                    d, pal["arc"], (pal["arc_top"] - i * 0.11) * depth)
            )

    # --- far stars ----------------------------------------------------
    for i, (x, y) in enumerate(STARS):
        parts.append(
            '<circle cx="{}" cy="{}" r="{:.1f}" fill="{}" '
            'fill-opacity="{:.2f}"/>'.format(
                x, y, 1.4 + (i % 3) * 0.5, pal["star"], pal["star_base"] + (i % 4) * 0.03)
        )

    svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {} {}" '
           'preserveAspectRatio="xMidYMax slice">{}</svg>'.format(W, H, "".join(parts)))

    out = STATIC / filename
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(svg, encoding="utf-8")

    print("wrote {} ({} bytes)".format(out.relative_to(ROOT), len(svg)))


if __name__ == "__main__":
    for name, palette in PALETTES.items():
        build(name, palette)
