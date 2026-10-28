#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Currículo de Stefanie Santos da Silva — A4, layout moderno
(sidebar escura + coluna de conteúdo, foto circular, Inter + Plus Jakarta Sans).

Uso:
    python3 build_curriculo.py [saida.pdf]

Dependências: reportlab, pillow.
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

BASE = Path(__file__).resolve().parent
FONTS = BASE / "assets" / "fonts"
PHOTO = BASE / "assets" / "foto-stefanie.jpg"
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else BASE / "Curriculo_Stefanie_Santos_2026.pdf"

# --------------------------------------------------------------------------- #
# Conteúdo
# --------------------------------------------------------------------------- #
DADOS = {
    "nome": "Stefanie Santos da Silva",
    "telefone": "+55 (47) 9980-2403",
    "email": "sther290415@gmail.com",
    "cidade": "Itajaí – SC",
    "endereco": "Rua Francisco José de Aviz, nº 551, ap. 404, bloco 3 · Itajaí – SC",
    "tags": ["Vendas", "Atendimento ao cliente", "Operações de loja"],
    "sobre": (
        "Profissional com experiência em atendimento ao cliente, telemarketing e vendas, "
        "construída ao longo de anos de atuação em empresas de diferentes segmentos. Na Havan, "
        "onde trabalhei por vários anos, passei por diversos setores e aprendi um pouco de cada "
        "área, desenvolvendo versatilidade, iniciativa e facilidade para lidar com diferentes "
        "demandas.<br/><br/>Sou organizada, pontual, gosto de trabalhar em equipe e procuro "
        "contribuir para um atendimento cordial e para o bom funcionamento da loja."
    ),
    "experiencias": [
        {
            "empresa": "Havan",
            "cargo": "Vendas de eletrodomésticos · Atuação em diferentes setores da loja",
            "periodo": "2019 – 2026",
            "descricao": (
                "Atendimento e orientação a clientes na área de eletrodomésticos, apoio às rotinas "
                "de loja e colaboração com diferentes setores conforme as necessidades da operação. "
                "Experiência diversificada, com adaptação a tarefas e equipes variadas."
            ),
        },
        {
            "empresa": "R Brasil Soluções",
            "cargo": "Telemarketing",
            "periodo": "2017 – 2019",
            "descricao": (
                "Atuação em telemarketing, com contato com clientes, comunicação clara e foco no "
                "atendimento conforme os procedimentos da empresa."
            ),
        },
        {
            "empresa": "TIVIT",
            "cargo": "Telemarketing",
            "periodo": "2014 – 2015",
            "descricao": (
                "Experiência em telemarketing, desenvolvendo habilidades de comunicação, escuta, "
                "organização e relacionamento com clientes."
            ),
        },
    ],
    "competencias": [
        "Atendimento ao cliente e vendas",
        "Organização e pontualidade",
        "Experiência em loja e diferentes setores",
        "Trabalho em equipe e colaboração",
        "Comunicação e relacionamento interpessoal",
        "Flexibilidade e facilidade de adaptação",
    ],
    "destaques": ["Versatilidade", "Iniciativa", "Trabalho em equipe", "Pontualidade", "Foco no cliente"],
}

# --------------------------------------------------------------------------- #
# Paleta e tipografia
# --------------------------------------------------------------------------- #
NAVY = HexColor("#0F2338")
NAVY_MID = HexColor("#16304A")
NAVY_2 = HexColor("#1B3B57")
INK = HexColor("#26333F")
GRAY = HexColor("#54646F")
GRAY_LT = HexColor("#8695A0")
GRAY_SOFT = HexColor("#98A6B0")
TEAL = HexColor("#11827C")
TEAL_LT = HexColor("#5FC9C1")
TEAL_SOFT = HexColor("#E9F4F2")
GOLD = HexColor("#D9A257")
HAIR = HexColor("#E1E7EC")
CHIP = HexColor("#F4F7F9")
WHITE = HexColor("#FFFFFF")
SIDE_TEXT = HexColor("#DCE6EE")

SANS, SANS_M, SANS_SB, SANS_B, SANS_I = (
    "Inter", "Inter-M", "Inter-SB", "Inter-B", "Inter-I",
)
DISPLAY_B, DISPLAY_XB = "PJS-B", "PJS-XB"
FA = "FA"

W, H = A4
SB = 202.0            # largura da sidebar
SBP = 25.0            # padding lateral da sidebar
MX = 232.0            # início da coluna principal
MR = W - 42.0         # fim da coluna principal
MW = MR - MX          # largura útil da coluna principal
FOOT_Y = 40.0         # base do rodapé


# --------------------------------------------------------------------------- #
# Utilidades de desenho
# --------------------------------------------------------------------------- #
def register_fonts() -> None:
    pairs = [
        (SANS, "Inter-Regular.ttf"),
        (SANS_M, "Inter-Medium.ttf"),
        (SANS_SB, "Inter-SemiBold.ttf"),
        (SANS_B, "Inter-Bold.ttf"),
        (SANS_I, "Inter-Italic.ttf"),
        (DISPLAY_B, "PlusJakartaSans-Bold.ttf"),
        (DISPLAY_XB, "PlusJakartaSans-ExtraBold.ttf"),
        (FA, "FontAwesome-Solid.ttf"),
    ]
    for name, filename in pairs:
        pdfmetrics.registerFont(TTFont(name, str(FONTS / filename)))
    pdfmetrics.registerFontFamily(SANS, normal=SANS, bold=SANS_B, italic=SANS_I, boldItalic=SANS_B)


def tw(txt: str, font: str, size: float, spacing: float = 0.0) -> float:
    return pdfmetrics.stringWidth(txt, font, size) + spacing * max(len(txt) - 1, 0)


def draw_text(c, x, y, txt, font, size, color, spacing=0.0, align="left"):
    """Texto com tracking opcional, isolado por q/Q (o Tc vaza entre textos no PDF)."""
    c.saveState()
    if align != "left":
        width = tw(txt, font, size, spacing)
        x = x - width if align == "right" else x - width / 2.0
    t = c.beginText()
    t.setTextOrigin(x, y)
    t.setFont(font, size)
    t.setFillColor(color)
    t.setCharSpace(spacing)
    t.textOut(txt)
    c.drawText(t)
    c.restoreState()


def fit_size(txt, font, max_width, start, spacing=0.0, minimum=10.0):
    size = start
    while size > minimum and tw(txt, font, size, spacing) > max_width:
        size -= 0.25
    return size


def paragraph(txt, font, size, leading, color, width, align=0, spacing=0.0):
    style = ParagraphStyle(
        "p", fontName=font, fontSize=size, leading=leading, textColor=color,
        alignment=align, spaceBefore=0, spaceAfter=0, charSpace=spacing,
    )
    p = Paragraph(txt, style)
    p.wrap(width, 6000)
    return p


def draw_flowable(c, flowable, x, y_top):
    c.saveState()
    flowable.drawOn(c, x, y_top - flowable.height)
    c.restoreState()


def draw_para(c, txt, x, y_top, width, font, size, leading, color, spacing=0.0):
    p = paragraph(txt, font, size, leading, color, width, spacing=spacing)
    draw_flowable(c, p, x, y_top)
    return y_top - p.height


def pill(c, x, y, w, h, radius, fill, stroke=None, line=0.6):
    c.saveState()
    if fill is not None:
        c.setFillColor(fill)
    if stroke is not None:
        c.setStrokeColor(stroke)
        c.setLineWidth(line)
    c.roundRect(x, y, w, h, radius, stroke=1 if stroke is not None else 0,
                fill=1 if fill is not None else 0)
    c.restoreState()


def icon(c, x, y, glyph, size, color):
    c.saveState()
    c.setFont(FA, size)
    c.setFillColor(color)
    c.drawString(x, y, glyph)
    c.restoreState()


def hline(c, x1, x2, y, color, width=0.8, alpha=1.0):
    c.saveState()
    c.setStrokeColor(color)
    c.setStrokeAlpha(alpha)
    c.setLineWidth(width)
    c.line(x1, y, x2, y)
    c.restoreState()


# --------------------------------------------------------------------------- #
# Sidebar
# --------------------------------------------------------------------------- #
def sidebar(c) -> None:
    # fundo com gradiente vertical
    c.saveState()
    clip = c.beginPath()
    clip.rect(0, 0, SB, H)
    c.clipPath(clip, stroke=0, fill=0)
    c.linearGradient(0, H, SB * 0.35, 0, (NAVY, NAVY_MID, NAVY_2), (0, 0.52, 1))

    # detalhes geométricos discretos
    c.setStrokeColor(TEAL_LT)
    for radius, alpha in ((158, 0.09), (124, 0.12), (92, 0.15)):
        c.setStrokeAlpha(alpha)
        c.setLineWidth(0.9)
        c.circle(SB + 10, H - 268, radius, stroke=1, fill=0)
    c.setStrokeAlpha(1)
    c.setFillColor(TEAL_LT)
    c.setFillAlpha(0.055)
    c.circle(-46, -34, 140, stroke=0, fill=1)
    c.setFillAlpha(1)
    c.restoreState()

    # ---------------- foto (recorte circular) ----------------
    cx, cy, r = SB / 2, H - 96, 55
    c.saveState()
    c.setFillColor(TEAL)
    c.circle(cx, cy, r + 8, stroke=0, fill=1)
    c.setStrokeColor(WHITE)
    c.setLineWidth(2.2)
    c.circle(cx, cy, r + 2.8, stroke=1, fill=0)
    c.saveState()
    clip = c.beginPath()
    clip.circle(cx, cy, r + 1.0)
    c.clipPath(clip, stroke=0, fill=0)
    iw, ih = Image.open(PHOTO).size
    crop_side, crop_cx, crop_cy = 700.0, 476.0, 606.0
    scale = (2 * (r + 1.2)) / crop_side
    dw, dh = iw * scale, ih * scale
    c.drawImage(
        ImageReader(str(PHOTO)),
        cx - crop_cx * scale,
        cy - dh + crop_cy * scale,
        dw, dh, mask="auto",
    )
    c.restoreState()
    c.restoreState()

    x0 = SBP
    cw = SB - 2 * SBP
    y = cy - r - 40

    # ---------------- contato ----------------
    y = sb_heading(c, x0, y, cw, "Contato")
    itens = [
        ("\uf095", DADOS["telefone"]),
        ("\uf0e0", DADOS["email"]),
        ("\uf3c5", DADOS["cidade"]),
        ("\uf1ea", "Disponibilidade imediata"),
    ]
    for glyph, txt in itens:
        c.saveState()
        c.setFillColor(TEAL_LT)
        c.setFillAlpha(0.16)
        c.roundRect(x0, y - 12.5, 16.5, 16.5, 4.5, stroke=0, fill=1)
        c.setFillAlpha(1)
        c.restoreState()
        icon(c, x0 + 4.6, y - 8.0, glyph, 6.8, TEAL_LT)
        p = paragraph(txt, SANS_M, 8.0, 10.0, WHITE, cw - 23)
        draw_flowable(c, p, x0 + 23, y - 0.6)
        y -= max(p.height + 8.0, 21)

    y -= 10
    hline(c, x0, x0 + cw, y, WHITE, 0.6, 0.14)
    y -= 20

    # ---------------- competências ----------------
    y = sb_heading(c, x0, y, cw, "Competências")
    for item in DADOS["competencias"]:
        icon(c, x0 + 0.5, y - 6.6, "\uf00c", 5.6, TEAL_LT)
        p = paragraph(item, SANS, 8.0, 10.4, SIDE_TEXT, cw - 14)
        draw_flowable(c, p, x0 + 13, y)
        y -= p.height + 6.6

    y -= 12
    hline(c, x0, x0 + cw, y, WHITE, 0.6, 0.14)
    y -= 20

    # ---------------- destaques (perfil) ----------------
    y = sb_heading(c, x0, y, cw, "Perfil")
    ph, gap = 16.5, 5.0
    col_w = (cw - gap) / 2
    for idx, tag in enumerate(DADOS["destaques"]):
        if idx and idx % 2 == 0:
            y -= ph + gap
        px = x0 if idx % 2 == 0 else x0 + col_w + gap
        w = col_w
        c.saveState()
        c.setFillColor(WHITE)
        c.setFillAlpha(0.07)
        c.roundRect(px, y - ph + 2.0, w, ph, ph / 2, stroke=0, fill=1)
        c.setStrokeColor(TEAL_LT)
        c.setStrokeAlpha(0.35)
        c.setLineWidth(0.6)
        c.roundRect(px, y - ph + 2.0, w, ph, ph / 2, stroke=1, fill=0)
        c.setStrokeAlpha(1)
        c.setFillAlpha(1)
        c.restoreState()
        tsize = fit_size(tag, SANS_M, col_w - 18, 7.2, minimum=5.8)
        draw_text(c, px + 9, y - ph + 7.8, tag, SANS_M, tsize, HexColor("#C9D8E3"))

    # ---------------- bloco ancorado no rodapé ----------------
    by = 74.0
    c.saveState()
    c.setFillColor(WHITE)
    c.setFillAlpha(0.05)
    c.roundRect(x0 - 4, by - 4, cw + 8, 86, 8, stroke=0, fill=1)
    c.setStrokeColor(TEAL_LT)
    c.setStrokeAlpha(0.28)
    c.setLineWidth(0.7)
    c.roundRect(x0 - 4, by - 4, cw + 8, 86, 8, stroke=1, fill=0)
    c.setStrokeAlpha(1)
    c.setFillAlpha(1)
    c.restoreState()

    icon(c, x0 + 2, by + 58, "\uf3c5", 7.2, TEAL_LT)
    draw_text(c, x0 + 15, by + 59.5, "ENDEREÇO", SANS_SB, 6.6, TEAL_LT, spacing=1.5)
    p = paragraph(DADOS["endereco"], SANS, 7.4, 9.8, SIDE_TEXT, cw - 4)
    draw_flowable(c, p, x0, by + 44)

    hline(c, x0, x0 + cw, by + 28, WHITE, 0.6, 0.14)

    icon(c, x0 + 2, by + 10, "\uf058", 7.2, TEAL_LT)
    p = paragraph("Referências disponíveis<br/>mediante solicitação", SANS, 7.4, 9.8, SIDE_TEXT, cw - 20)
    draw_flowable(c, p, x0 + 15, by + 16)


def sb_heading(c, x, y, width, title) -> float:
    draw_text(c, x, y - 7.4, title.upper(), SANS_SB, 7.2, TEAL_LT, spacing=1.8)
    hline(c, x, x + width, y - 15.0, WHITE, 0.6, 0.16)
    return y - 27


# --------------------------------------------------------------------------- #
# Coluna principal
# --------------------------------------------------------------------------- #
def header(c) -> float:
    y = H - 50
    draw_text(c, MX, y, "CURRÍCULO PROFISSIONAL", SANS_SB, 7.0, TEAL, spacing=2.4)

    city_w = tw(DADOS["cidade"], SANS_M, 7.4)
    icon(c, MR - city_w - 11, y - 0.4, "\uf3c5", 6.6, GRAY_SOFT)
    draw_text(c, MR, y, DADOS["cidade"], SANS_M, 7.4, GRAY_LT, align="right")

    y -= 30
    size = fit_size(DADOS["nome"], DISPLAY_XB, MW, 28.5, spacing=0.2)
    draw_text(c, MX, y, DADOS["nome"], DISPLAY_XB, size, NAVY, spacing=0.2)

    # pílulas com áreas de atuação (tamanho ajustado para caber em uma linha)
    y -= 20
    ph = 17.0
    size, track, gap = 6.8, 1.2, 6.0
    labels = [t.upper() for t in DADOS["tags"]]
    while size > 5.4:
        widths = [tw(lb, SANS_SB, size, track) + 22 for lb in labels]
        if sum(widths) + gap * (len(labels) - 1) <= MW:
            break
        size -= 0.2
    px = MX
    for label, w in zip(labels, widths):
        pill(c, px, y - 4.0, w, ph, ph / 2, TEAL_SOFT)
        draw_text(c, px + 11, y + 1.4, label, SANS_SB, size, TEAL, spacing=track)
        px += w + gap

    # régua de destaque (três segmentos)
    y -= 26
    c.saveState()
    c.setLineWidth(2.4)
    c.setStrokeColor(TEAL)
    c.line(MX, y, MX + 48, y)
    c.setStrokeColor(GOLD)
    c.line(MX + 54, y, MX + 70, y)
    c.setStrokeColor(HexColor("#D5DDE3"))
    c.setLineWidth(0.8)
    c.line(MX + 76, y, MR, y)
    c.restoreState()
    return y - 26


def section_title(c, x, y, width, title) -> float:
    """Cabeçalho de seção: losango + título em caixa alta + régua."""
    c.saveState()
    c.setFillColor(TEAL)
    c.translate(x + 3.2, y + 3.0)
    c.rotate(45)
    c.rect(-2.7, -2.7, 5.4, 5.4, stroke=0, fill=1)
    c.restoreState()

    tx = x + 12
    draw_text(c, tx, y, title.upper(), SANS_SB, 8.8, NAVY, spacing=1.5)
    end = tx + tw(title.upper(), SANS_SB, 8.8, 1.5)
    hline(c, end + 10, x + width, y + 2.6, HAIR, 0.8)
    return y - 23


def sobre(c, y) -> float:
    y = section_title(c, MX, y, MW, "Sobre mim")
    y = draw_para(c, DADOS["sobre"], MX, y - 3, MW, SANS, 9.9, 16.2, GRAY)
    return y - 38


def experiencia(c, y) -> float:
    y = section_title(c, MX, y, MW, "Experiência profissional")
    spine = MX + 3.2
    body_x = MX + 19
    body_w = MR - body_x

    top = y
    for i, job in enumerate(DADOS["experiencias"]):
        c.saveState()
        c.setFillColor(WHITE)
        c.setStrokeColor(TEAL)
        c.setLineWidth(1.5)
        c.circle(spine, y - 3.8, 3.5, stroke=1, fill=1)
        c.setFillColor(TEAL)
        c.circle(spine, y - 3.8, 1.5, stroke=0, fill=1)
        c.restoreState()

        draw_text(c, body_x, y - 7.0, job["empresa"], SANS_B, 11.8, NAVY)

        per = job["periodo"]
        pw = tw(per, SANS_SB, 7.2, 0.9) + 16
        pill(c, MR - pw, y - 9.0, pw, 14.0, 7.0, TEAL_SOFT)
        draw_text(c, MR - pw / 2, y - 4.5, per, SANS_SB, 7.2, TEAL, spacing=0.9, align="center")

        yy = y - 24
        draw_text(c, body_x, yy, job["cargo"], SANS_M, 8.7, HexColor("#788795"))
        yy = draw_para(c, job["descricao"], body_x, yy - 10, body_w, SANS, 9.7, 15.2, GRAY)
        y = yy - (37 if i < len(DADOS["experiencias"]) - 1 else 0)

    c.saveState()
    c.setStrokeColor(HAIR)
    c.setLineWidth(0.9)
    c.line(spine, top - 9, spine, y + 6)
    c.restoreState()
    return y - 6


def footer(c) -> None:
    hline(c, MX, MR, FOOT_Y + 12, HAIR, 0.8)
    c.saveState()
    c.setStrokeColor(TEAL)
    c.setLineWidth(2)
    c.line(MX, FOOT_Y + 12, MX + 36, FOOT_Y + 12)
    c.restoreState()
    draw_text(c, MX, FOOT_Y, f"{DADOS['cidade']}  ·  {DADOS['telefone']}", SANS_M, 7.0, GRAY_LT)
    draw_text(c, MR, FOOT_Y, "Currículo profissional · 2026", SANS_M, 7.0, GRAY_LT, align="right")


# --------------------------------------------------------------------------- #
# Montagem
# --------------------------------------------------------------------------- #
def build(path: Path) -> None:
    register_fonts()
    c = canvas.Canvas(str(path), pagesize=A4)
    c.setTitle("Currículo — Stefanie Santos da Silva")
    c.setAuthor("Stefanie Santos da Silva")
    c.setSubject("Currículo profissional — vendas, atendimento ao cliente e operações de loja")
    c.setKeywords("currículo, vendas, atendimento ao cliente, telemarketing, Itajaí, SC")

    c.setFillColor(WHITE)
    c.rect(0, 0, W, H, stroke=0, fill=1)

    sidebar(c)
    y = header(c)
    y = sobre(c, y)
    y = experiencia(c, y)
    footer(c)

    print(f"PDF gerado: {path}  |  fim do conteúdo em y={y:.1f} pt (rodapé em {FOOT_Y:.0f})")

    c.showPage()
    c.save()


if __name__ == "__main__":
    build(OUT)
