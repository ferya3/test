"""Deterministic DesignSpec -> code renderer.

Used by the Frontend agent in offline mode, and as the scaffold the LLM agents
can start from. Emits either a static site (index.html + styles.css + app.js)
or a Vite + React project from the same markup."""

from __future__ import annotations

import html
import json
import re

from app.schemas.spec import BehaviorSpec, DesignSpec, Element, PageSpec, SectionSpec
from app.video.imaging import contrast_text

GOOGLE_FONTS = {
    "inter",
    "roboto",
    "poppins",
    "montserrat",
    "open sans",
    "lato",
    "vazirmatn",
    "manrope",
    "dm sans",
    "playfair display",
    "space grotesk",
    "plus jakarta sans",
    "nunito",
    "raleway",
    "work sans",
    "rubik",
    "outfit",
    "sora",
    "ibm plex sans",
    "source sans 3",
    "merriweather",
    "lora",
    "noto sans",
}
SYSTEM_STACK = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"


def esc(text: str) -> str:
    return html.escape(text or "", quote=True)


def page_file(route: str) -> str:
    name = route.strip("/").replace("/", "-")
    return "index.html" if not name else f"{name}.html"


def _behavior(spec: DesignSpec, effect: str) -> BehaviorSpec | None:
    return next((b for b in spec.behaviors if b.effect == effect), None)


def _font_stack(name: str) -> str:
    return f"'{name}', {SYSTEM_STACK}" if name else SYSTEM_STACK


def google_fonts_href(spec: DesignSpec) -> str | None:
    families = {f for f in spec.tokens.fonts.values() if f and f.lower() in GOOGLE_FONTS}
    if not families:
        return None
    q = "&".join(f"family={f.replace(' ', '+')}:wght@400;500;600;700" for f in sorted(families))
    return f"https://fonts.googleapis.com/css2?{q}&display=swap"


# ----------------------------------------------------------------- markup


def element_class(section_id: str, index: int) -> str:
    return "e-" + re.sub(r"[^a-zA-Z0-9-]", "-", section_id) + f"-{index}"


def _element(e: Element, cls: str = "") -> str:
    text = esc(e.text)
    extra = f" {cls}" if cls else ""
    if e.kind == "heading":
        level = min(6, max(1, e.level or 2))
        return f'<h{level} class="h{min(level, 3)}{extra}">{text}</h{level}>'
    if e.kind == "button":
        return f'<a class="btn{extra}" href="{esc(e.href or "#")}">{text}</a>'
    if e.kind == "link":
        return f'<a class="link{extra}" href="{esc(e.href or "#")}">{text}</a>'
    if e.kind == "logo":
        return f'<a class="logo{extra}" href="./index.html">{text}</a>'
    if e.kind == "image" and e.src:
        return (
            f'<img class="picture{extra}" src="./{esc(e.src)}" alt="{text or "Image"}" '
            'loading="lazy" decoding="async" />'
        )
    if e.kind in ("image", "video"):
        return f'<div class="media{extra}" role="img" aria-label="{text or "Image"}"></div>'
    if e.kind == "icon":
        return f'<span class="icon{extra}" aria-hidden="true"></span>'
    if e.kind == "badge":
        return f'<span class="badge{extra}">{text}</span>'
    if e.kind == "input":
        return f'<input class="input{extra}" type="text" placeholder="{text}" aria-label="{text or "Input"}" />'
    if e.kind == "list":
        items = "".join(f"<li>{esc(i)}</li>" for i in e.items)
        return f'<ul class="list{extra}">{items}</ul>'
    return f'<p class="{cls}">{text}</p>' if cls else f"<p>{text}</p>"


def _canvas_order(s: SectionSpec) -> list[tuple[int, Element]]:
    """Elements in reading order (top to bottom, left to right): the mobile flow order."""
    indexed = list(enumerate(s.elements))
    return sorted(indexed, key=lambda ie: (round(ie[1].style.get("y", 0) / 24), ie[1].style.get("x", 0)))


def _header(spec: DesignSpec, s: SectionSpec) -> str:
    logos = [e for e in s.elements if e.kind == "logo"] or [Element(kind="logo", text=spec.project_name)]
    links = [e for e in s.elements if e.kind == "link"]
    buttons = [e for e in s.elements if e.kind == "button"]
    menu = _behavior(spec, "menu-toggle") or _behavior(spec, "dropdown") or _behavior(spec, "drawer")
    nav_links = "".join(f'<a class="nav-link" href="{esc(link.href or "#")}">{esc(link.text)}</a>' for link in links)
    actions = "".join(_element(b) for b in buttons)
    toggle = ""
    panel = ""
    if menu:
        toggle = (
            '<button class="menu-toggle" type="button" aria-label="Menu" aria-expanded="false" '
            f'aria-controls="{s.id}-menu" data-menu-toggle="true"><span></span><span></span><span></span></button>'
        )
        panel_links = "".join(
            f'<a class="menu-link" href="{esc(link.href or "#")}">{esc(link.text)}</a>' for link in links
        )
        panel = f'<div class="menu-panel" id="{s.id}-menu" data-menu-panel="true">{panel_links}</div>'
    shrink = ' data-shrink="true"' if _behavior(spec, "header-shrink") else ""
    nav_class = "nav nav--collapsible" if menu else "nav"
    return (
        f'<header id="{s.id}" class="site-header" data-section="{s.id}" data-component="{s.component}"{shrink}>'
        f'<div class="container header-row">{_element(logos[0])}'
        f'<nav class="{nav_class}" aria-label="Main">{nav_links}</nav>'
        f'<div class="header-actions">{actions}{toggle}</div></div>{panel}</header>'
    )


def _items(s: SectionSpec, animate: bool) -> str:
    items = s.items or [{"title": f"Item {i + 1}", "text": "", "image": True} for i in range(max(1, s.columns))]
    cards = []
    for item in items:
        anim = ' data-animate="true"' if animate else ""
        parts = []
        if item.get("image"):
            parts.append('<div class="card-media" aria-hidden="true"></div>')
        if item.get("title"):
            parts.append(f'<h3 class="h3">{esc(str(item["title"]))}</h3>')
        if item.get("text"):
            parts.append(f"<p>{esc(str(item['text']))}</p>")
        if item.get("button"):
            parts.append(f'<a class="btn btn--small" href="#">{esc(str(item["button"]))}</a>')
        cards.append(f'<article class="card"{anim}>{"".join(parts)}</article>')
    return f'<div class="grid">{"".join(cards)}</div>'


def section_markup(spec: DesignSpec, s: SectionSpec) -> str:
    if s.kind in ("header", "nav"):
        return _header(spec, s)
    animate = _behavior(spec, "fade-in") is not None or _behavior(spec, "slide-up") is not None
    anim = ' data-animate="true"' if animate else ""
    tag = "footer" if s.kind == "footer" else "section"
    if s.layout == "canvas":
        body = "".join(_element(e, element_class(s.id, i)) for i, e in _canvas_order(s))
        return (
            f'<{tag} id="{s.id}" class="section section--{s.kind} section--canvas" data-section="{s.id}" '
            f'data-component="{s.component}"><div class="canvas">{body}</div></{tag}>'
        )
    body = "".join(_element(e, element_class(s.id, i) if e.style else "") for i, e in enumerate(s.elements))
    row = " section-content--row" if s.layout == "row" else ""
    inner = f'<div class="section-content{row}"{anim}>{body}</div>' if body else ""
    if s.layout == "grid" or (s.items and s.layout != "row"):
        inner += _items(s, animate)
    if s.kind == "hero" and not any(e.kind in ("image", "video") for e in s.elements) and s.layout == "split":
        inner = f'<div class="split"><div>{inner}</div><div class="media media--hero" aria-hidden="true"></div></div>'
    return (
        f'<{tag} id="{s.id}" class="section section--{s.kind}" data-section="{s.id}" '
        f'data-component="{s.component}"><div class="container">{inner}</div></{tag}>'
    )


def page_body(spec: DesignSpec, page: PageSpec) -> str:
    return "\n".join(section_markup(spec, s) for s in page.sections)


# --------------------------------------------------------------------- css


def _type_rules(st: dict, css_w: int, fluid: bool) -> list[str]:
    rules = []
    if st.get("font_size"):
        size = int(st["font_size"])
        if fluid:  # canvas sections scale with the page width
            rules.append(f"font-size: clamp(11px, {size / css_w * 100:.3f}vw, {round(size * 1.5)}px);")
        else:
            rules.append(f"font-size: {size}px;")
    if st.get("color"):
        rules.append(f"color: {st['color']};")
    if st.get("weight"):
        rules.append(f"font-weight: {int(st['weight'])};")
    if st.get("uppercase"):
        rules.append("text-transform: uppercase;")
    if st.get("letter_spacing"):
        rules.append(f"letter-spacing: {st['letter_spacing']};")
    if st.get("background"):
        rules.append(f"background: {st['background']};")
    return rules


def _element_rules(spec: DesignSpec, s: SectionSpec) -> str:
    """Measured typography per element, and positions inside canvas sections."""
    css_w = spec.viewport.get("width", 1280)
    out = ""
    if s.layout == "canvas":
        ref_w = float(s.source.get("page_width") or css_w)
        ref_h = float(s.source.get("h") or (s.height_px or 1) * ref_w / css_w)
        out += f"#{s.id} .canvas {{ position: relative; width: 100%; aspect-ratio: {ref_w:.0f} / {ref_h:.0f}; }}\n"
        for i, e in enumerate(s.elements):
            st = e.style
            if "x" not in st:
                continue
            x, y, w, h = (float(st.get(k, 0)) for k in ("x", "y", "w", "h"))
            rules = ["position: absolute;", "margin: 0;"]
            if e.kind == "image":
                rules += [
                    f"left: {x / ref_w * 100:.3f}%;",
                    f"top: {y / ref_h * 100:.3f}%;",
                    f"width: {w / ref_w * 100:.3f}%;",
                    f"height: {h / ref_h * 100:.3f}%;",
                    "object-fit: contain;",
                ]
                if st.get("cutout"):  # fade the bottom into the page so no crop edge shows
                    fade = "linear-gradient(to bottom, #000 90%, transparent)"
                    rules += [f"-webkit-mask-image: {fade};", f"mask-image: {fade};"]
            else:  # text: anchored on its measured centre, a little wider so line breaks match
                align = st.get("align", "left")
                anchor_x = x + w / 2 if align == "center" else x
                rules += [
                    f"left: {anchor_x / ref_w * 100:.3f}%;",
                    f"top: {(y + h / 2) / ref_h * 100:.3f}%;",
                    "transform: translate(-50%, -50%);" if align == "center" else "transform: translateY(-50%);",
                    # one measured line stays one line (fonts differ in width); paragraphs wrap
                    "white-space: nowrap;"
                    if st.get("lines", 1) == 1
                    else f"width: {min(100.0, w / ref_w * 100 * 1.15):.3f}%; white-space: normal;",
                    f"text-align: {align};",
                    "line-height: 1.25;",
                ]
                rules += _type_rules(st, css_w, fluid=True)
            out += f"#{s.id} .{element_class(s.id, i)} {{ {' '.join(r for r in rules if r)} }}\n"
        return out
    for i, e in enumerate(s.elements):
        if not e.style:
            continue
        rules = _type_rules(e.style, css_w, fluid=False)
        align = e.style.get("align")
        if align in ("center", "right"):
            rules.append(f"text-align: {align}; align-self: {'center' if align == 'center' else 'flex-end'};")
        if rules:
            out += f"#{s.id} .{element_class(s.id, i)} {{ {' '.join(rules)} }}\n"
    return out


def stylesheet(spec: DesignSpec) -> str:
    t = spec.tokens
    lines = [":root {"]
    for name, value in t.colors.items():
        lines.append(f"  --color-{name}: {value};")
    lines.append(f"  --font-heading: {_font_stack(t.fonts.get('heading', ''))};")
    lines.append(f"  --font-body: {_font_stack(t.fonts.get('body', ''))};")
    for name, st in t.type_scale.items():
        lines.append(f"  --text-{name}: {st.size}px;")
        lines.append(f"  --leading-{name}: {st.line_height};")
        lines.append(f"  --weight-{name}: {st.weight};")
    for name, v in t.spacing.items():
        lines.append(f"  --space-{name}: {v}px;")
    for name, v in t.radii.items():
        lines.append(f"  --radius-{name}: {v}px;")
    for name, v in t.shadows.items():
        lines.append(f"  --shadow-{name}: {v};")
    lines.append(f"  --container: {t.container_width}px;")
    lines.append("  --gutter: clamp(16px, 4vw, 48px);")
    lines.append("}")

    menu = _behavior(spec, "menu-toggle") or _behavior(spec, "dropdown") or _behavior(spec, "drawer")
    animate = _behavior(spec, "fade-in") or _behavior(spec, "slide-up")
    shrink = _behavior(spec, "header-shrink")
    hover = _behavior(spec, "hover-lift")
    sticky = any(s.sticky for p in spec.pages for s in p.sections) or _behavior(spec, "sticky-header")

    css = (
        "\n".join(lines)
        + """

*, *::before, *::after { box-sizing: border-box; }
html { scroll-behavior: smooth; -webkit-text-size-adjust: 100%; }
body { margin: 0; font-family: var(--font-body); font-size: var(--text-body); line-height: var(--leading-body);
  color: var(--color-text); background: var(--color-background); }
img, svg, video { max-width: 100%; display: block; }
a { color: inherit; }
:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 3px; }
h1, h2, h3, h4, h5, h6 { font-family: var(--font-heading); margin: 0 0 var(--space-md); }
.h1 { font-size: var(--text-h1); line-height: var(--leading-h1); font-weight: var(--weight-h1); }
.h2 { font-size: var(--text-h2); line-height: var(--leading-h2); font-weight: var(--weight-h2); }
.h3 { font-size: var(--text-h3); line-height: var(--leading-h3); font-weight: var(--weight-h3); }
p { margin: 0 0 var(--space-md); max-width: 70ch; }
.container { width: min(100% - 2 * var(--gutter), var(--container)); margin-inline: auto; }
.section { position: relative; display: flex; flex-direction: column; justify-content: center; }
.section-content { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-sm); }
.section--hero .section-content, .section--cta .section-content { gap: var(--space-md); }
.section-content--row { flex-direction: row; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-md); }
.section-content--row > p { margin: 0; }
.picture { display: block; max-width: 100%; }
.section--canvas .canvas .btn { white-space: nowrap; }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: .5rem; padding: .8rem 1.6rem;
  border-radius: var(--radius-md); background: var(--color-primary); color: var(--color-on-primary);
  font-weight: 600; text-decoration: none; border: 0; cursor: pointer; transition: transform .2s ease, box-shadow .2s ease; }
.btn--small { padding: .5rem 1rem; font-size: var(--text-small); }
.link { text-decoration: none; }
.badge { display: inline-block; padding: .25rem .75rem; border-radius: var(--radius-full); background: var(--color-surface); font-size: var(--text-small); }
.list { margin: 0; padding-inline-start: 1.25rem; }
.input { padding: .75rem 1rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); font: inherit; min-width: 260px; }
.media { width: 100%; aspect-ratio: 16 / 9; border-radius: var(--radius-lg);
  background: linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 35%, transparent), var(--color-surface)); }
.grid { --cols: 3; display: grid; grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); gap: var(--space-lg); width: 100%; margin-top: var(--space-lg); }
.card { background: var(--color-surface); color: var(--color-text); border-radius: var(--radius-lg); padding: var(--space-lg); box-shadow: var(--shadow-card); }
.card-media { width: 56px; height: 56px; border-radius: var(--radius-md); background: var(--color-primary); margin-bottom: var(--space-md); }
.site-header { position: relative; z-index: 50; display: flex; align-items: center; }
.header-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-lg); height: 100%; }
.logo { font-family: var(--font-heading); font-weight: 700; font-size: 1.25rem; text-decoration: none; }
.nav { display: flex; align-items: center; gap: clamp(16px, 2.5vw, 40px); margin-inline-start: auto; }
.nav-link { text-decoration: none; font-weight: 500; opacity: .9; }
.nav-link:hover { opacity: 1; text-decoration: underline; text-underline-offset: 4px; }
.header-actions { display: flex; align-items: center; gap: var(--space-md); }
.menu-toggle { display: none; width: 44px; height: 44px; padding: 10px; border: 0; background: transparent; color: inherit; cursor: pointer;
  flex-direction: column; justify-content: center; gap: 5px; }
.menu-toggle span { display: block; height: 2px; background: currentColor; border-radius: 2px; }
.menu-panel { display: none; }
"""
    )
    if sticky:
        css += ".site-header { position: sticky; top: 0; }\n"
    if menu:
        d = max(80, menu.duration_ms)
        bbox = menu.params.get("bbox") or [0.72, 0.1, 0.26, 0.4]
        css += f"""
/* menu-toggle: measured from the recording ({d} ms, {menu.easing}) */
.menu-toggle {{ display: inline-flex; }}
.menu-panel {{ display: flex; flex-direction: column; gap: var(--space-sm); position: absolute; top: 100%;
  inset-inline-end: {round((1 - bbox[0] - bbox[2]) * 100, 2)}%; width: max(220px, {round(bbox[2] * 100, 2)}%);
  padding: var(--space-md); background: var(--color-background); color: var(--color-text);
  border-radius: 0 0 var(--radius-md) var(--radius-md); box-shadow: var(--shadow-card);
  transform-origin: top; transform: scaleY(0); opacity: 0; visibility: hidden;
  transition: transform {d}ms {menu.easing}, opacity {d}ms {menu.easing}, visibility 0s linear {d}ms; }}
.menu-panel.is-open {{ transform: scaleY(1); opacity: 1; visibility: visible; transition-delay: 0s; }}
.menu-link {{ padding: .5rem .75rem; border-radius: var(--radius-sm); text-decoration: none; }}
.menu-link:hover {{ background: var(--color-surface); }}
"""
    if animate:
        d = max(150, animate.duration_ms)
        offset = "24px" if animate.effect == "slide-up" else "0"
        css += f"""
[data-animate] {{ opacity: 0; transform: translateY({offset}); transition: opacity {d}ms {animate.easing}, transform {d}ms {animate.easing}; }}
[data-animate].is-visible {{ opacity: 1; transform: none; }}
"""
    if shrink:
        css += """
.site-header { transition: height .25s ease, box-shadow .25s ease; }
.site-header.is-scrolled { box-shadow: 0 2px 12px rgba(0,0,0,.12); }
"""
    if hover:
        css += """
.card { transition: transform .2s ease, box-shadow .2s ease; }
.card:hover { transform: translateY(-4px); box-shadow: 0 12px 28px rgba(0,0,0,.14); }
.btn:hover { transform: translateY(-1px); }
"""

    # per-section measurements
    css += "\n/* sections: sizes and colours measured from the reference */\n"
    for page in spec.pages:
        for s in page.sections:
            rules = []
            if s.background_image:
                rules.append(f"background: {s.background_image};")
            elif s.background:
                rules.append(f"background: {s.background};")
            color = s.text_color or (contrast_text(s.background) if s.background else None)
            if color:
                rules.append(f"color: {color};")
            if s.kind in ("header", "nav"):
                if s.height_px:
                    rules.append(f"height: {s.height_px}px;")
            else:
                if s.height_px:
                    rules.append(f"min-height: {s.height_px}px;")
                rules.append(f"padding-block: {s.padding_y}px;")
            if s.layout == "canvas":
                rules = [r for r in rules if not r.startswith(("min-height", "padding-block"))]
                rules.append("padding-block: 0;")
            css += f"#{s.id} {{ {' '.join(rules)} }}\n"
            if s.columns > 1:
                css += f"#{s.id} .grid {{ --cols: {s.columns}; }}\n"
            css += _element_rules(spec, s)

    css += """
@media (max-width: 1024px) {
  .grid { grid-template-columns: repeat(min(var(--cols), 2), minmax(0, 1fr)); }
}
@media (max-width: 768px) {
  :root { --text-h1: clamp(32px, 9vw, 44px); --text-h2: clamp(26px, 7vw, 32px); }
  .section:not(.site-header) { min-height: 0 !important; padding-block: 56px !important; }
  .grid { grid-template-columns: 1fr; }
  /* canvas sections become a readable flow on small screens */
  .section--canvas .canvas { aspect-ratio: auto !important; display: flex; flex-wrap: wrap; justify-content: center;
    align-items: flex-end; gap: 16px; padding: 40px var(--gutter); }
  .section--canvas .canvas > * { position: static !important; transform: none !important; width: auto !important;
    height: auto !important; max-width: 100%; }
  .section--canvas .canvas > :not(img) { flex-basis: 100%; text-align: center !important; }
  .section--canvas .canvas > img { width: calc(33.333% - 11px) !important; max-height: 240px !important;
    object-fit: contain; }
  .section--canvas .canvas > :not(img) { white-space: normal !important; }
  .section--canvas .canvas > h1, .section--canvas .canvas > h2 { font-size: clamp(24px, 7vw, 34px) !important; }
  .nav { display: none; }
  .menu-toggle { display: inline-flex; }
  .menu-panel { display: flex; flex-direction: column; position: absolute; top: 100%; inset-inline: 0; width: auto;
    padding: var(--space-md) var(--gutter); background: var(--color-background); color: var(--color-text);
    box-shadow: var(--shadow-card); transform-origin: top; transform: scaleY(0); opacity: 0; visibility: hidden;
    transition: transform .25s ease, opacity .25s ease, visibility 0s linear .25s; }
  .menu-panel.is-open { transform: scaleY(1); opacity: 1; visibility: visible; transition-delay: 0s; }
  .menu-link { padding: .75rem 0; text-decoration: none; }
  .input { min-width: 0; width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition: none !important; animation: none !important; scroll-behavior: auto !important; }
  [data-animate] { opacity: 1 !important; transform: none !important; }
}
"""
    return css


# ---------------------------------------------------------------------- js

BEHAVIORS_JS = """
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // menu-toggle / dropdown / drawer
  const toggles = document.querySelectorAll('[data-menu-toggle]');
  const closeAll = () => document.querySelectorAll('[data-menu-toggle]').forEach((btn) => {
    btn.setAttribute('aria-expanded', 'false');
    document.getElementById(btn.getAttribute('aria-controls'))?.classList.remove('is-open');
  });
  toggles.forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = 'true';
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      const open = btn.getAttribute('aria-expanded') !== 'true';
      closeAll();
      btn.setAttribute('aria-expanded', String(open));
      document.getElementById(btn.getAttribute('aria-controls'))?.classList.toggle('is-open', open);
    });
  });
  if (!window.__recodeMenuBound) {
    window.__recodeMenuBound = true;
    document.addEventListener('click', (event) => {
      if (!event.target.closest('[data-menu-panel]')) closeAll();
    });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeAll(); });
  }

  // viewport-enter animations
  const animated = document.querySelectorAll('[data-animate]');
  if (reduce || !('IntersectionObserver' in window)) {
    animated.forEach((el) => el.classList.add('is-visible'));
  } else {
    const io = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); io.unobserve(entry.target); }
    }), { threshold: 0.15 });
    animated.forEach((el) => io.observe(el));
  }

  // header-shrink
  const header = document.querySelector('[data-shrink]');
  if (header && !header.dataset.bound) {
    header.dataset.bound = 'true';
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
"""


def script() -> str:
    return "(() => {\n  'use strict';" + BEHAVIORS_JS + "})();\n"


# ------------------------------------------------------------------ output


def _html_doc(
    spec: DesignSpec, page: PageSpec, styles: str = "./styles.css", js: str | None = "./app.js", body: str | None = None
) -> str:
    fonts = google_fonts_href(spec)
    font_links = ""
    if fonts:
        font_links = (
            '<link rel="preconnect" href="https://fonts.googleapis.com" />\n'
            '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n'
            f'<link rel="stylesheet" href="{esc(fonts)}" />\n'
        )
    script_tag = f'<script src="{js}" defer></script>\n' if js else ""
    return (
        f'<!doctype html>\n<html lang="{esc(spec.language)}" dir="{spec.direction}">\n<head>\n'
        '<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n'
        f"<title>{esc(page.title or spec.project_name)}</title>\n{font_links}"
        f'<link rel="stylesheet" href="{styles}" />\n{script_tag}</head>\n<body>\n'
        f"{body if body is not None else page_body(spec, page)}\n</body>\n</html>\n"
    )


def render_static_site(spec: DesignSpec) -> dict[str, str]:
    files = {"styles.css": stylesheet(spec), "app.js": script()}
    for page in spec.pages:
        files[page_file(page.route)] = _html_doc(spec, page)
    files["README.md"] = (
        f"# {spec.project_name}\n\nGenerated by Recode AI from a screen recording.\n\n"
        "Open `index.html` in a browser, or serve the folder:\n\n```bash\npython3 -m http.server 8080\n```\n"
    )
    return files


# --------------------------------------------------------------- react-vite

_VOID = re.compile(r"<(img|input|br|hr|meta|link)\b([^>]*?)\s*/?>")


def to_jsx(markup: str) -> str:
    out = markup.replace(' class="', ' className="').replace(' for="', ' htmlFor="')
    out = out.replace("{", "&#123;").replace("}", "&#125;")
    return _VOID.sub(lambda m: f"<{m.group(1)}{m.group(2)} />", out)


def _component_name(s: SectionSpec) -> str:
    base = re.sub(r"[^A-Za-z0-9]", " ", s.id).title().replace(" ", "")
    return base if base and base[0].isalpha() else f"Section{base}"


def render_react_site(spec: DesignSpec) -> dict[str, str]:
    files: dict[str, str] = {}
    files["package.json"] = (
        json.dumps(
            {
                "name": re.sub(r"[^a-z0-9-]", "-", spec.project_name.lower()).strip("-") or "recode-site",
                "private": True,
                "version": "0.1.0",
                "type": "module",
                "scripts": {"dev": "vite", "build": "vite build", "preview": "vite preview"},
                "dependencies": {"react": "^19.2.0", "react-dom": "^19.2.0"},
                "devDependencies": {"vite": "^7.1.0", "@vitejs/plugin-react": "^5.0.0"},
            },
            indent=2,
        )
        + "\n"
    )
    files["vite.config.js"] = (
        "import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\n"
        "export default defineConfig({ plugins: [react()], base: './' });\n"
    )
    first = spec.pages[0] if spec.pages else PageSpec(id="page-1")
    files["index.html"] = _html_doc(
        spec,
        first,
        styles="./src/styles.css",
        js=None,
        body='<div id="root"></div>\n<script type="module" src="/src/main.jsx"></script>',
    )
    files["index.html"] = files["index.html"].replace('<link rel="stylesheet" href="./src/styles.css" />\n', "")
    files["src/styles.css"] = stylesheet(spec)
    files["src/behaviors.js"] = "export function initBehaviors() {" + BEHAVIORS_JS + "}\n"
    files["src/main.jsx"] = (
        "import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App.jsx';\n"
        "import './styles.css';\n\ncreateRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);\n"
    )
    imports, pages_js = [], []
    for page in spec.pages:
        names = []
        for s in page.sections:
            name = _component_name(s)
            names.append(name)
            files[f"src/components/{name}.jsx"] = (
                f"export default function {name}() {{\n  return (\n    {to_jsx(section_markup(spec, s))}\n  );\n}}\n"
            )
            imports.append(f"import {name} from './components/{name}.jsx';")
        route = page.route if page.route.startswith("/") else "/" + page.route
        pages_js.append(f"  '{route}': () => (<>{''.join(f'<{n} />' for n in names)}</>),")
    files["src/App.jsx"] = (
        "import { useEffect, useState } from 'react';\nimport { initBehaviors } from './behaviors.js';\n"
        + "\n".join(sorted(set(imports)))
        + "\n\nconst pages = {\n"
        + "\n".join(pages_js)
        + "\n};\n\n"
        "function currentRoute() {\n  const hash = window.location.hash.replace(/^#/, '');\n  return pages[hash] ? hash : '/';\n}\n\n"
        "export default function App() {\n  const [route, setRoute] = useState(currentRoute);\n"
        "  useEffect(() => {\n    const onHash = () => setRoute(currentRoute());\n"
        "    window.addEventListener('hashchange', onHash);\n    return () => window.removeEventListener('hashchange', onHash);\n  }, []);\n"
        "  useEffect(() => { initBehaviors(); }, [route]);\n  const Page = pages[route];\n  return <Page />;\n}\n"
    )
    files["README.md"] = (
        f"# {spec.project_name}\n\nGenerated by Recode AI (Vite + React).\n\n```bash\nnpm install\nnpm run dev\n```\n"
    )
    return files


def render_site(spec: DesignSpec) -> dict[str, str]:
    return render_react_site(spec) if spec.framework == "react-vite" else render_static_site(spec)
