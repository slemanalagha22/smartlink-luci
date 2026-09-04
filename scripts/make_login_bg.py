"""
Generate the login backdrop.

The artwork is a real lattice: legs that taper, horizontal ties at decreasing
spacing, and X-bracing between them - drawn from geometry rather than by hand,
because a mast made of two straight lines reads as scaffolding, not as a
telecom tower.

    python scripts/make_login_bg.py

Writes luci-theme-smartlink/htdocs/luci-static/smartlink/login-bg.svg
"""

import math
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "luci-theme-smartlink/htdocs/luci-static/smartlink/login-bg.svg"

W, H = 1600, 900

STROKE = "#8ecbff"


def mast(cx, base_y, tip_y, half_base, half_top, bays=9):
    """One lattice mast, returned as (legs, ties, braces) path data.

    Bays get shorter towards the top, which is what gives a real tower its
    sense of height; evenly spaced ties look like a ladder.
    """
    height = base_y - tip_y

    # cumulative fractions, tighter as they climb
    steps = [(i / bays) ** 1.35 for i in range(bays + 1)]

    nodes = []
    for f in steps:
        y = base_y - height * f
        half = half_base + (half_top - half_base) * f
        nodes.append((y, cx - half, cx + half))

    legs = "M%.1f %.1f L%.1f %.1f M%.1f %.1f L%.1f %.1f" % (
        nodes[0][1], nodes[0][0], nodes[-1][1], nodes[-1][0],
        nodes[0][2], nodes[0][0], nodes[-1][2], nodes[-1][0],
    )

    ties = " ".join(
        "M%.1f %.1f H%.1f" % (l, y, r) for (y, l, r) in nodes[1:]
    )

    braces = []
    for i in range(len(nodes) - 1):
        y0, l0, r0 = nodes[i]
        y1, l1, r1 = nodes[i + 1]
        if i % 2 == 0:
            braces.append("M%.1f %.1f L%.1f %.1f" % (l0, y0, r1, y1))
        else:
            braces.append("M%.1f %.1f L%.1f %.1f" % (r0, y0, l1, y1))

    return legs, ties, " ".join(braces)


def arcs(cx, cy, radii, spread=58):
    """Concentric signal arcs opening upward from a mast tip."""
    out = []
    a0 = math.radians(180 + spread)
    a1 = math.radians(360 - spread)

    for r in radii:
        x0, y0 = cx + r * math.cos(a0), cy + r * math.sin(a0)
        x1, y1 = cx + r * math.cos(a1), cy + r * math.sin(a1)
        out.append(
            "M%.1f %.1f A%.0f %.0f 0 0 1 %.1f %.1f" % (x0, y0, r, r, x1, y1)
        )

    return out


def build():
    towers = [
        dict(cx=300, base=H + 40, tip=330, hb=78, ht=9, bays=10, arcs=(46, 78, 112)),
        dict(cx=1310, base=H + 40, tip=300, hb=84, ht=10, bays=11, arcs=(50, 86, 124)),
        dict(cx=800, base=H + 40, tip=560, hb=52, ht=7, bays=6, arcs=(34, 58)),
    ]

    parts = []

    # --- horizon wash -------------------------------------------------
    # Built by concatenation rather than %-formatting: the gradient stops are
    # full of literal per-cent signs, and escaping every one of them is a
    # reliable way to introduce a typo nobody notices until it renders.
    parts.append(
        '<defs>'
        '<radialGradient id="glow" cx="50%" cy="100%" r="72%">'
        '<stop offset="0%" stop-color="#2ea8e4" stop-opacity=".30"/>'
        '<stop offset="55%" stop-color="#1d5f8f" stop-opacity=".10"/>'
        '<stop offset="100%" stop-color="#04101d" stop-opacity="0"/>'
        '</radialGradient>'
        '<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">'
        '<stop offset="0%" stop-color="' + STROKE + '" stop-opacity=".05"/>'
        '<stop offset="45%" stop-color="' + STROKE + '" stop-opacity=".34"/>'
        '<stop offset="100%" stop-color="' + STROKE + '" stop-opacity=".12"/>'
        '</linearGradient>'
        '</defs>'
    )

    parts.append('<rect width="%d" height="%d" fill="url(#glow)"/>' % (W, H))

    # --- mesh between the towers --------------------------------------
    nodes = [(300, 330), (800, 560), (1310, 300), (560, 690), (1060, 720)]
    links = [(0, 3), (3, 1), (1, 4), (4, 2), (0, 1), (1, 2), (3, 4)]

    mesh = " ".join(
        "M%d %d L%d %d" % (nodes[a][0], nodes[a][1], nodes[b][0], nodes[b][1])
        for a, b in links
    )

    parts.append(
        '<path d="%s" fill="none" stroke="%s" stroke-opacity=".13" stroke-width="1.1"/>'
        % (mesh, STROKE)
    )

    for x, y in nodes:
        parts.append(
            '<circle cx="%d" cy="%d" r="4.5" fill="%s" fill-opacity=".45"/>' % (x, y, STROKE)
        )

    # --- towers -------------------------------------------------------
    for t in towers:
        legs, ties, braces = mast(t["cx"], t["base"], t["tip"], t["hb"], t["ht"], t["bays"])

        parts.append(
            '<g fill="none" stroke="url(#fade)" stroke-linecap="round">'
            '<path d="%s" stroke-width="2.4"/>'
            '<path d="%s" stroke-width="1.3"/>'
            '<path d="%s" stroke-width="1"/>'
            '</g>' % (legs, ties, braces)
        )

        # mast head and its signal
        parts.append(
            '<circle cx="%d" cy="%d" r="5" fill="%s" fill-opacity=".7"/>'
            % (t["cx"], t["tip"], STROKE)
        )

        for i, d in enumerate(arcs(t["cx"], t["tip"], t["arcs"])):
            parts.append(
                '<path d="%s" fill="none" stroke="#2ea8e4" stroke-opacity="%.2f" '
                'stroke-width="2.2" stroke-linecap="round"/>' % (d, 0.42 - i * 0.11)
            )

    # --- far stars ----------------------------------------------------
    stars = [(140, 150), (420, 96), (980, 120), (1500, 205), (1180, 60),
             (640, 180), (1420, 380), (210, 300), (900, 250), (1120, 320)]

    for i, (x, y) in enumerate(stars):
        parts.append(
            '<circle cx="%d" cy="%d" r="%.1f" fill="#ffffff" fill-opacity="%.2f"/>'
            % (x, y, 1.4 + (i % 3) * 0.5, 0.10 + (i % 4) * 0.03)
        )

    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" '
        'preserveAspectRatio="xMidYMax slice">%s</svg>' % (W, H, "".join(parts))
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(svg, encoding="utf-8")

    print("wrote %s (%d bytes)" % (OUT.relative_to(ROOT), len(svg)))


if __name__ == "__main__":
    build()
