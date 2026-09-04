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

W, H = 1600, 900

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
    },
}

TOWERS = [
    dict(cx=300,  tip=330, hb=78, ht=9,  bays=10, arcs=(46, 78, 112)),
    dict(cx=1310, tip=300, hb=84, ht=10, bays=11, arcs=(50, 86, 124)),
    dict(cx=800,  tip=560, hb=52, ht=7,  bays=6,  arcs=(34, 58)),
]

MESH_NODES = [(300, 330), (800, 560), (1310, 300), (560, 690), (1060, 720)]
MESH_LINKS = [(0, 3), (3, 1), (1, 4), (4, 2), (0, 1), (1, 2), (3, 4)]

STARS = [(140, 150), (420, 96), (980, 120), (1500, 205), (1180, 60),
         (640, 180), (1420, 380), (210, 300), (900, 250), (1120, 320)]


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
        '</defs>'.format(g[0], g[1], g[2], g[3], g[4],
                         stroke, leg[0], stroke, leg[1], stroke, leg[2])
    )

    parts.append('<rect width="{}" height="{}" fill="url(#glow)"/>'.format(W, H))

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
        legs, ties, braces = mast(t["cx"], H + 40, t["tip"], t["hb"], t["ht"], t["bays"])

        parts.append(
            '<g fill="none" stroke="url(#fade)" stroke-linecap="round">'
            '<path d="{}" stroke-width="2.4"/>'
            '<path d="{}" stroke-width="1.3"/>'
            '<path d="{}" stroke-width="1"/>'
            '</g>'.format(legs, ties, braces)
        )

        parts.append('<circle cx="{}" cy="{}" r="5" fill="{}" '
                     'fill-opacity="{}"/>'.format(t["cx"], t["tip"], stroke, pal["head"]))

        for i, d in enumerate(arcs(t["cx"], t["tip"], t["arcs"])):
            parts.append(
                '<path d="{}" fill="none" stroke="{}" stroke-opacity="{:.2f}" '
                'stroke-width="2.2" stroke-linecap="round"/>'.format(
                    d, pal["arc"], pal["arc_top"] - i * 0.11)
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
