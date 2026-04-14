#!/usr/bin/env python3
"""
Generate the Overview Page executive brief PDF.
Run: python3 overview-documentation.py
Output: overview-page-documentation.pdf (same directory)
"""

import os
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch, mm
from reportlab.lib.colors import HexColor, white, black, Color
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether, Frame, PageTemplate,
    BaseDocTemplate, NextPageTemplate, ListFlowable, ListItem,
    Image
)
from reportlab.platypus.flowables import Flowable
from reportlab.pdfgen import canvas
from reportlab.lib import utils

# ───────────── Colors ─────────────
PRIMARY = HexColor("#007AFF")
PRIMARY_DARK = HexColor("#005EC4")
ACCENT = HexColor("#FF3B30")
TEXT = HexColor("#1D1D1F")
TEXT_MUTED = HexColor("#636366")
TEXT_SOFT = HexColor("#86868B")
SURFACE = HexColor("#F5F5F7")
BORDER = HexColor("#E5E5EA")
WHITE = white
SUCCESS = HexColor("#10B981")
WARNING = HexColor("#F59E0B")
INFO = HexColor("#3B82F6")
DARK_BG = HexColor("#1C1C1E")

# ───────────── Styles ─────────────
FONT = "Helvetica"
FONT_BOLD = "Helvetica-Bold"

def make_styles():
    s = {}
    s["cover_title"] = ParagraphStyle(
        "CoverTitle", fontName=FONT_BOLD, fontSize=36, leading=42,
        textColor=TEXT, alignment=TA_LEFT, spaceAfter=8
    )
    s["cover_sub"] = ParagraphStyle(
        "CoverSub", fontName=FONT, fontSize=14, leading=20,
        textColor=TEXT_MUTED, alignment=TA_LEFT, spaceAfter=4
    )
    s["cover_meta"] = ParagraphStyle(
        "CoverMeta", fontName=FONT, fontSize=11, leading=16,
        textColor=TEXT_SOFT, alignment=TA_LEFT
    )
    s["h1"] = ParagraphStyle(
        "H1", fontName=FONT_BOLD, fontSize=24, leading=30,
        textColor=TEXT, spaceBefore=0, spaceAfter=14
    )
    s["h2"] = ParagraphStyle(
        "H2", fontName=FONT_BOLD, fontSize=16, leading=22,
        textColor=TEXT, spaceBefore=24, spaceAfter=10
    )
    s["h3"] = ParagraphStyle(
        "H3", fontName=FONT_BOLD, fontSize=13, leading=18,
        textColor=TEXT, spaceBefore=16, spaceAfter=6
    )
    s["body"] = ParagraphStyle(
        "Body", fontName=FONT, fontSize=10.5, leading=16,
        textColor=TEXT, alignment=TA_LEFT, spaceAfter=8
    )
    s["body_indent"] = ParagraphStyle(
        "BodyIndent", fontName=FONT, fontSize=10.5, leading=16,
        textColor=TEXT, alignment=TA_LEFT, spaceAfter=6,
        leftIndent=16
    )
    s["bullet"] = ParagraphStyle(
        "Bullet", fontName=FONT, fontSize=10.5, leading=16,
        textColor=TEXT, alignment=TA_LEFT, spaceAfter=4,
        leftIndent=24, bulletIndent=12
    )
    s["caption"] = ParagraphStyle(
        "Caption", fontName=FONT, fontSize=9, leading=13,
        textColor=TEXT_SOFT, alignment=TA_LEFT, spaceAfter=4
    )
    s["toc_item"] = ParagraphStyle(
        "TOC", fontName=FONT, fontSize=11, leading=18,
        textColor=TEXT, leftIndent=8, spaceAfter=2
    )
    s["toc_h1"] = ParagraphStyle(
        "TOCH1", fontName=FONT_BOLD, fontSize=11, leading=18,
        textColor=TEXT, spaceAfter=2
    )
    s["footer"] = ParagraphStyle(
        "Footer", fontName=FONT, fontSize=8, leading=10,
        textColor=TEXT_SOFT, alignment=TA_CENTER
    )
    s["callout"] = ParagraphStyle(
        "Callout", fontName=FONT, fontSize=10.5, leading=16,
        textColor=PRIMARY_DARK, alignment=TA_LEFT, spaceAfter=8,
        leftIndent=12, borderPadding=8
    )
    s["token_name"] = ParagraphStyle(
        "TokenName", fontName="Courier", fontSize=9.5, leading=14,
        textColor=TEXT
    )
    s["token_val"] = ParagraphStyle(
        "TokenVal", fontName=FONT, fontSize=9.5, leading=14,
        textColor=TEXT_MUTED
    )
    s["table_header"] = ParagraphStyle(
        "TableHeader", fontName=FONT_BOLD, fontSize=9.5, leading=13,
        textColor=TEXT, alignment=TA_LEFT
    )
    s["table_cell"] = ParagraphStyle(
        "TableCell", fontName=FONT, fontSize=9.5, leading=13,
        textColor=TEXT, alignment=TA_LEFT
    )
    s["table_cell_code"] = ParagraphStyle(
        "TableCellCode", fontName="Courier", fontSize=9, leading=13,
        textColor=TEXT_MUTED, alignment=TA_LEFT
    )
    return s


# ───────────── Custom Flowables ─────────────

class ColorSwatch(Flowable):
    """Draws a small color swatch rectangle."""
    def __init__(self, color, w=14, h=14, radius=3):
        Flowable.__init__(self)
        self.color = color
        self.w = w
        self.h = h
        self.radius = radius
        self.width = w
        self.height = h

    def draw(self):
        self.canv.setFillColor(self.color)
        self.canv.roundRect(0, 0, self.w, self.h, self.radius, fill=1, stroke=0)


class HLine(Flowable):
    """Thin horizontal line."""
    def __init__(self, width, color=BORDER, thickness=0.5):
        Flowable.__init__(self)
        self.line_width = width
        self.color = color
        self.thickness = thickness
        self.height = 1
        self.width = width

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.thickness)
        self.canv.line(0, 0, self.line_width, 0)


class SectionDivider(Flowable):
    """A colored top-border divider for section starts."""
    def __init__(self, width, color=PRIMARY, thickness=2):
        Flowable.__init__(self)
        self.line_width = width
        self.color = color
        self.thickness = thickness
        self.height = 8
        self.width = width

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.thickness)
        self.canv.line(0, self.height, self.line_width, self.height)


# ───────────── Page Templates ─────────────

def draw_header_footer(canvas_obj, doc):
    canvas_obj.saveState()
    # Footer line
    canvas_obj.setStrokeColor(BORDER)
    canvas_obj.setLineWidth(0.5)
    canvas_obj.line(doc.leftMargin, 36, doc.width + doc.leftMargin, 36)
    # Footer text
    canvas_obj.setFont(FONT, 8)
    canvas_obj.setFillColor(TEXT_SOFT)
    canvas_obj.drawString(doc.leftMargin, 24, "Overview Page Documentation")
    canvas_obj.drawRightString(doc.width + doc.leftMargin, 24, f"Page {doc.page}")
    canvas_obj.restoreState()


def draw_cover_footer(canvas_obj, doc):
    """Minimal footer for cover page."""
    pass


# ───────────── Document Build ─────────────

def build_pdf():
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "overview-page-documentation.pdf")

    doc = BaseDocTemplate(
        output_path,
        pagesize=letter,
        leftMargin=60,
        rightMargin=60,
        topMargin=56,
        bottomMargin=56,
        title="Overview Page Documentation",
        author="Product Team",
        subject="Executive Brief"
    )

    frame_cover = Frame(
        doc.leftMargin, doc.bottomMargin,
        doc.width, doc.height,
        id="cover"
    )
    frame_body = Frame(
        doc.leftMargin, doc.bottomMargin,
        doc.width, doc.height,
        id="body"
    )

    doc.addPageTemplates([
        PageTemplate(id="cover", frames=frame_cover, onPage=draw_cover_footer),
        PageTemplate(id="body", frames=frame_body, onPage=draw_header_footer),
    ])

    ST = make_styles()
    content_width = doc.width
    story = []

    # ════════════════════════════════
    # COVER PAGE
    # ════════════════════════════════
    story.append(Spacer(1, 1.8 * inch))
    story.append(Paragraph("Overview Page", ST["cover_title"]))
    story.append(Spacer(1, 4))
    story.append(Paragraph("Design Documentation and Developer Handoff", ST["cover_sub"]))
    story.append(Spacer(1, 24))
    story.append(HLine(content_width * 0.2, PRIMARY, 2))
    story.append(Spacer(1, 24))
    story.append(Paragraph("Audience: Leadership, Developers, Designers, SEO Team", ST["cover_meta"]))
    story.append(Paragraph("Type: Executive Brief", ST["cover_meta"]))
    story.append(Paragraph("Version: 1.0  |  April 2026", ST["cover_meta"]))
    story.append(Spacer(1, 2 * inch))
    story.append(Paragraph(
        "This document covers the layout, interactions, design system, "
        "accessibility approach, and developer notes for the overview page. "
        "It was written so that anyone on the team (from leadership reviewing "
        "progress to a developer picking up the build) can understand what "
        "this page does and how it should behave in production.",
        ST["body"]
    ))

    story.append(NextPageTemplate("body"))
    story.append(PageBreak())

    # ════════════════════════════════
    # TABLE OF CONTENTS
    # ════════════════════════════════
    story.append(Paragraph("Table of Contents", ST["h1"]))
    story.append(Spacer(1, 8))

    toc_items = [
        ("1", "Page Purpose and Audience", True),
        ("2", "Page Anatomy (Section Breakdown)", True),
        ("", "2.1  Portfolio Health Strip", False),
        ("", "2.2  Needs Your Attention", False),
        ("", "2.3  Schedule (Week Board)", False),
        ("", "2.4  Team Workload", False),
        ("3", "Interaction Patterns", True),
        ("", "3.1  Delegate Popover", False),
        ("", "3.2  Calendar Picker", False),
        ("", "3.3  Task Carry-Over Logic", False),
        ("", "3.4  Tooltips and Feedback", False),
        ("", "3.5  Block Drag-and-Drop Reorder", False),
        ("4", "Design System", True),
        ("", "4.1  Color Tokens", False),
        ("", "4.2  Typography Scale", False),
        ("", "4.3  Component Patterns", False),
        ("", "4.4  Dark Mode", False),
        ("5", "Accessibility", True),
        ("6", "Responsive Strategy", True),
        ("7", "Developer Handoff Notes", True),
        ("8", "What Is Not Built Yet (Stubs)", True),
    ]
    for num, label, is_h1 in toc_items:
        prefix = f"<b>{num}</b>&nbsp;&nbsp;&nbsp;" if num else "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"
        style = ST["toc_h1"] if is_h1 else ST["toc_item"]
        story.append(Paragraph(f"{prefix}{label}", style))

    story.append(PageBreak())

    # ════════════════════════════════
    # 1. PAGE PURPOSE AND AUDIENCE
    # ════════════════════════════════
    story.append(SectionDivider(content_width))
    story.append(Paragraph("1. Page Purpose and Audience", ST["h1"]))
    story.append(Paragraph(
        "The overview page is the first screen a user sees after logging in. "
        "Its job is to answer one question in under five seconds: <b>what needs my attention right now?</b>",
        ST["body"]
    ))
    story.append(Paragraph(
        "The primary user is a project manager or team lead who oversees multiple "
        "client accounts and a small production team. They do not need to dig into "
        "individual tasks here. They need to scan, prioritize, and decide where to "
        "focus their time.",
        ST["body"]
    ))
    story.append(Paragraph(
        "The page is split into four sections, ordered by urgency:",
        ST["body"]
    ))

    purpose_data = [
        ["Section", "What it answers"],
        ["Portfolio Health", "How are my clients doing overall?"],
        ["Needs Your Attention", "What is overdue, at risk, or waiting on me?"],
        ["Schedule", "What is happening this week and next week?"],
        ["Team Workload", "Who is overloaded and who has capacity?"],
    ]
    purpose_table = Table(purpose_data, colWidths=[content_width * 0.3, content_width * 0.7])
    purpose_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("LEADING", (0, 0), (-1, -1), 15),
        ("TEXTCOLOR", (0, 0), (-1, 0), TEXT),
        ("TEXTCOLOR", (0, 1), (-1, -1), TEXT),
        ("BACKGROUND", (0, 0), (-1, 0), SURFACE),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
    ]))
    story.append(purpose_table)
    story.append(Spacer(1, 8))
    story.append(Paragraph(
        "The user can drag sections to reorder them (saved to local storage), "
        "and the section order persists between sessions. The page greeting "
        "adapts to time of day and, when permission is granted, includes a "
        "weather-aware note (rain, extreme heat, snow).",
        ST["body"]
    ))

    story.append(PageBreak())

    # ════════════════════════════════
    # 2. PAGE ANATOMY
    # ════════════════════════════════
    story.append(SectionDivider(content_width))
    story.append(Paragraph("2. Page Anatomy", ST["h1"]))
    story.append(Paragraph(
        "The page runs inside a max-width container (1200px) centered on the screen. "
        "A sticky header sits at the top with frosted-glass blur, holding the logo, "
        "navigation, search bar, notifications, theme toggle, and user avatar.",
        ST["body"]
    ))

    # Header details
    story.append(Paragraph("Header bar", ST["h3"]))
    story.append(Paragraph(
        "Height: 56px. Background: semi-transparent with a backdrop blur (20px, saturate 180%). "
        "Navigation links: Overview (active), Clients, Board, Analytics. "
        "Right side: search trigger (keyboard shortcut hint visible), notification bell "
        "with red dot indicator, dark mode toggle, and user avatar.",
        ST["body"]
    ))

    story.append(Paragraph("Page header (greeting area)", ST["h3"]))
    story.append(Paragraph(
        "Three lines: the current day/date in uppercase small text, a greeting that "
        "changes based on time of day ('Good morning/afternoon/evening, Nikko.'), and a "
        "rotating tagline pulled from a set of 14 phrases, cycling daily. If the browser "
        "shares location and notable weather is detected, the greeting appends a short "
        "weather note (for example, 'It's rainy out. Good day to stay focused.').",
        ST["body"]
    ))

    # ── 2.1 PORTFOLIO HEALTH STRIP ──
    story.append(Paragraph("2.1  Portfolio Health Strip", ST["h2"]))
    story.append(Paragraph(
        "A horizontal strip with four cells separated by vertical dividers. Each cell shows "
        "an icon, a label, a large number, and a subtitle. This gives the user a fast read "
        "on the state of their client portfolio without clicking into anything.",
        ST["body"]
    ))

    health_data = [
        [Paragraph("<b>Cell</b>", ST["table_header"]),
         Paragraph("<b>Icon</b>", ST["table_header"]),
         Paragraph("<b>Sample Value</b>", ST["table_header"]),
         Paragraph("<b>What It Means</b>", ST["table_header"])],
        [Paragraph("On Fire", ST["table_cell"]),
         Paragraph("Flame", ST["table_cell"]),
         Paragraph("1 (red)", ST["table_cell"]),
         Paragraph("Overdue or blocked. Needs immediate action.", ST["table_cell"])],
        [Paragraph("At Risk", ST["table_cell"]),
         Paragraph("Warning triangle", ST["table_cell"]),
         Paragraph("2", ST["table_cell"]),
         Paragraph("Behind schedule or approaching a deadline.", ST["table_cell"])],
        [Paragraph("On Track", ST["table_cell"]),
         Paragraph("Checkmark", ST["table_cell"]),
         Paragraph("5", ST["table_cell"]),
         Paragraph("Delivering on time, no blockers.", ST["table_cell"])],
        [Paragraph("Avg Delivery", ST["table_cell"]),
         Paragraph("Clock", ST["table_cell"]),
         Paragraph("94%", ST["table_cell"]),
         Paragraph("Percentage of tasks delivered by due date.", ST["table_cell"])],
    ]
    ht = Table(health_data, colWidths=[content_width * 0.17, content_width * 0.18, content_width * 0.2, content_width * 0.45])
    ht.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), SURFACE),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(ht)
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "The 'On Fire' cell uses the red accent color for both icon background and value text, "
        "making it visually distinct from the rest. All other cells use neutral icon backgrounds. "
        "Each icon has a tooltip that explains what the metric means on hover.",
        ST["body"]
    ))
    story.append(Paragraph(
        "Layout: CSS Grid with columns <font face='Courier' size='9'>1.2fr 1px 1fr 1px 1fr 1px 1fr</font>. "
        "At 960px breakpoint, switches to a 2x2 grid with dividers hidden.",
        ST["caption"]
    ))

    # ── 2.2 NEEDS YOUR ATTENTION ──
    story.append(Paragraph("2.2  Needs Your Attention", ST["h2"]))
    story.append(Paragraph(
        "A vertical list of cards, each representing a task or decision that the user "
        "needs to act on. Cards are sorted by severity: 'On Fire' first, then 'At Risk', "
        "then 'Decision' and 'Onboarding' items.",
        ST["body"]
    ))
    story.append(Paragraph(
        "Each card has:",
        ST["body"]
    ))

    attn_bullets = [
        "A colored left border (red for critical, gray for warning, muted for info)",
        "A severity badge with a colored dot and label (On Fire, At Risk, Decision, Onboarding)",
        "The client name and age indicator ('3 days overdue', '5 hours left', 'Waiting 2 days')",
        "A title (bold, 16px) and a one-line description (13px, max 62 characters per line)",
        "Two action buttons on the right: 'Delegate' (secondary) and 'Review' (primary blue)",
    ]
    for b in attn_bullets:
        story.append(Paragraph(f"\u2022  {b}", ST["bullet"]))

    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "Only three cards are shown by default. A '3 more items' link at the bottom expands "
        "the list with a smooth animation (opacity, max-height, padding). A 'View all 6' link "
        "in the section header does the same. Once expanded, the link reads 'Show less'.",
        ST["body"]
    ))
    story.append(Paragraph(
        "Hover behavior: cards lift slightly (translateY -1px) with an elevated shadow. "
        "Button tooltips appear after a 0.6-second delay explaining what each action does.",
        ST["body"]
    ))

    # ── 2.3 SCHEDULE ──
    story.append(Paragraph("2.3  Schedule (Week Board)", ST["h2"]))
    story.append(Paragraph(
        "A five-column board where each column represents one weekday (Monday through Friday). "
        "Two tabs at the top switch between 'This week' and 'Next week'. The tab labels include "
        "the date range (for example, 'Apr 13 - 17').",
        ST["body"]
    ))
    story.append(Paragraph("Column states", ST["h3"]))

    col_state_data = [
        [Paragraph("<b>State</b>", ST["table_header"]),
         Paragraph("<b>Visual Treatment</b>", ST["table_header"])],
        [Paragraph("Today", ST["table_cell"]),
         Paragraph("Blue border, blue header background, white day/date text, "
                    "3px blue top accent line.", ST["table_cell"])],
        [Paragraph("Past", ST["table_cell"]),
         Paragraph("45% opacity. Hover restores to 70% for scanning.", ST["table_cell"])],
        [Paragraph("Future", ST["table_cell"]),
         Paragraph("Default styling. No special treatment.", ST["table_cell"])],
    ]
    cst = Table(col_state_data, colWidths=[content_width * 0.2, content_width * 0.8])
    cst.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), SURFACE),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(cst)
    story.append(Spacer(1, 8))

    story.append(Paragraph("Task cards inside columns", ST["h3"]))
    story.append(Paragraph(
        "Each task card shows a title, a meta line (assignee, time, or context), and a tag. "
        "Tags are color-coded pill badges:",
        ST["body"]
    ))
    tag_bullets = [
        "<b>Deadline</b> (red accent background) with a clock icon",
        "<b>Meeting</b> (neutral) with a people icon",
        "<b>Milestone</b> (neutral) with a flag icon",
    ]
    for b in tag_bullets:
        story.append(Paragraph(f"\u2022  {b}", ST["bullet"]))

    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "When a column has more tasks than the visible area (420px fixed height), "
        "a CSS mask-image fade appears at the bottom to signal there is more content "
        "below. The column body scrolls with a thin 4px custom scrollbar.",
        ST["body"]
    ))

    story.append(PageBreak())

    # ── 2.4 TEAM WORKLOAD ──
    story.append(Paragraph("2.4  Team Workload", ST["h2"]))
    story.append(Paragraph(
        "A horizontal row of five cards, one per team member. Each card shows:",
        ST["body"]
    ))
    wl_bullets = [
        "A ring chart showing their workload as a fraction of weekly capacity (4 Full Day Equivalents)",
        "Their avatar (initials with a unique background color) and name",
        "Their role",
    ]
    for b in wl_bullets:
        story.append(Paragraph(f"\u2022  {b}", ST["bullet"]))

    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "The ring chart color changes based on load:",
        ST["body"]
    ))

    ring_data = [
        [Paragraph("<b>Status</b>", ST["table_header"]),
         Paragraph("<b>Color</b>", ST["table_header"]),
         Paragraph("<b>FDE Range</b>", ST["table_header"])],
        [Paragraph("Light", ST["table_cell"]),
         Paragraph("Green (#10B981)", ST["table_cell"]),
         Paragraph("0 - 1.9", ST["table_cell"])],
        [Paragraph("Steady", ST["table_cell"]),
         Paragraph("Blue (#3B82F6)", ST["table_cell"]),
         Paragraph("2 - 3.9", ST["table_cell"])],
        [Paragraph("Heavy", ST["table_cell"]),
         Paragraph("Amber (#F59E0B)", ST["table_cell"]),
         Paragraph("4 - 4.9", ST["table_cell"])],
        [Paragraph("Over", ST["table_cell"]),
         Paragraph("Red (accent)", ST["table_cell"]),
         Paragraph("5+", ST["table_cell"])],
    ]
    rt = Table(ring_data, colWidths=[content_width * 0.2, content_width * 0.4, content_width * 0.4])
    rt.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), SURFACE),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(rt)
    story.append(Spacer(1, 8))

    story.append(Paragraph(
        "Clicking a team member card opens a slide-out panel from the right side of the screen. "
        "The panel shows their full task list with urgency dots, time estimates (Full Day, "
        "Half Day, Quarter Day, Quick Task), and a summary row at the top with FDE count "
        "and status. The panel closes on Escape, clicking the backdrop, or clicking the X button.",
        ST["body"]
    ))
    story.append(Paragraph(
        "Hover behavior: cards lift slightly, gain a blue border highlight, and "
        "switch to a soft blue background.",
        ST["body"]
    ))

    story.append(Paragraph("Block-level time estimates", ST["h3"]))
    block_data = [
        [Paragraph("<b>Block Type</b>", ST["table_header"]),
         Paragraph("<b>FDE Value</b>", ST["table_header"]),
         Paragraph("<b>Color Code</b>", ST["table_header"])],
        [Paragraph("Full Day", ST["table_cell"]),
         Paragraph("1.0", ST["table_cell"]),
         Paragraph("Blue badge", ST["table_cell"])],
        [Paragraph("Half Day", ST["table_cell"]),
         Paragraph("0.5", ST["table_cell"]),
         Paragraph("Green badge", ST["table_cell"])],
        [Paragraph("Quarter Day", ST["table_cell"]),
         Paragraph("0.25", ST["table_cell"]),
         Paragraph("Amber badge", ST["table_cell"])],
        [Paragraph("Quick Task", ST["table_cell"]),
         Paragraph("0 (not counted)", ST["table_cell"]),
         Paragraph("Gray badge", ST["table_cell"])],
    ]
    bt = Table(block_data, colWidths=[content_width * 0.25, content_width * 0.35, content_width * 0.4])
    bt.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), SURFACE),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(bt)

    story.append(PageBreak())

    # ════════════════════════════════
    # 3. INTERACTION PATTERNS
    # ════════════════════════════════
    story.append(SectionDivider(content_width))
    story.append(Paragraph("3. Interaction Patterns", ST["h1"]))

    # 3.1 Delegate Popover
    story.append(Paragraph("3.1  Delegate Popover", ST["h2"]))
    story.append(Paragraph(
        "Clicking 'Delegate' on any attention card opens a popover positioned above the button. "
        "The popover sits on the document body (not inside the card) to avoid CSS stacking context "
        "issues. A transparent backdrop covers the screen behind it.",
        ST["body"]
    ))
    story.append(Paragraph("The popover has four fields:", ST["body"]))

    delegate_fields = [
        "<b>Assign to</b> - Searchable combo box. Shows all five team members in a dropdown. "
        "Typing filters the list in real time. Selecting a member fills the input and enables the submit button.",
        "<b>Note</b> - Freeform textarea for quick context or instructions.",
        "<b>Priority</b> - Dropdown auto-filled based on the card's severity level "
        "(On Fire = Urgent, At Risk = High, others = Medium). Options: Urgent, High, Medium, Low.",
        "<b>Due by</b> - Opens a custom calendar picker (see 3.2).",
    ]
    for b in delegate_fields:
        story.append(Paragraph(f"\u2022  {b}", ST["bullet"]))

    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "The 'Delegate' submit button stays disabled until a team member is selected. "
        "On submit, a toast notification appears at the bottom center of the screen "
        "confirming the delegation ('Delegated \"[task]\" to [name]'), fades after 2 seconds.",
        ST["body"]
    ))
    story.append(Paragraph(
        "Dismiss: click the backdrop, click Cancel, or press Escape.",
        ST["body"]
    ))

    # 3.2 Calendar Picker
    story.append(Paragraph("3.2  Calendar Picker", ST["h2"]))
    story.append(Paragraph(
        "A custom-built calendar widget inside the delegate popover. Opens above the 'Due by' "
        "trigger button. Month navigation with left/right arrows. Days of the week displayed "
        "as two-letter abbreviations (Su, Mo, Tu, etc.).",
        ST["body"]
    ))
    story.append(Paragraph("Day states:", ST["body"]))
    cal_bullets = [
        "<b>Today:</b> Bold text, 1.5px blue inset ring, blue text color.",
        "<b>Selected:</b> Solid blue background, white text.",
        "<b>Past days:</b> Faded (50% opacity), hover disabled. Users cannot pick past dates.",
        "<b>Other month:</b> Faded text, not clickable.",
        "<b>Hover:</b> Soft blue background with blue text.",
    ]
    for b in cal_bullets:
        story.append(Paragraph(f"\u2022  {b}", ST["bullet"]))
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        "A 'Today' quick-action link sits below the calendar grid. Clicking it selects "
        "today's date, updates the trigger text, and closes the calendar.",
        ST["body"]
    ))

    # 3.3 Task Carry-Over
    story.append(Paragraph("3.3  Task Carry-Over Logic", ST["h2"]))
    story.append(Paragraph(
        "When the user opens the page, the system checks which weekday column matches "
        "today's date. All unfinished tasks from past columns get cloned into today's "
        "column with a 'Carried from [Day]' badge (red accent left border, arrow icon, "
        "red label text). This happens client-side on page load using the original task "
        "data stored in memory.",
        ST["body"]
    ))
    story.append(Paragraph(
        "The carry-over logic only applies to the 'This week' tab. Tasks marked as done "
        "(data-done='true') are not carried over.",
        ST["body"]
    ))

    # 3.4 Tooltips
    story.append(Paragraph("3.4  Tooltips and Feedback", ST["h2"]))
    story.append(Paragraph(
        "A global tooltip system uses a single floating element that repositions itself "
        "on hover over any element with a data-tip attribute. Tooltips appear after a "
        "400ms delay, positioned above the target by default. If there isn't enough room above "
        "(for example, header icons near the top of the viewport), the tooltip flips below. "
        "Horizontal overflow is corrected automatically (shifts left if it would clip the viewport edge).",
        ST["body"]
    ))
    story.append(Paragraph(
        "Button-specific tooltips on the attention card actions (Delegate, Review) use a "
        "different mechanism: a child element inside each button that appears after 0.6 "
        "seconds with a downward arrow pointer. These explain what each button does.",
        ST["body"]
    ))
    story.append(Paragraph(
        "The 'back to top' button appears after scrolling 400px, with a tooltip on hover "
        "('Back to top') that appears after 0.4s delay. Smooth scroll to top on click.",
        ST["body"]
    ))

    # 3.5 Block Drag-and-Drop
    story.append(Paragraph("3.5  Block Drag-and-Drop Reorder", ST["h2"]))
    story.append(Paragraph(
        "Each of the four content blocks (Portfolio Health, Attention, Schedule, Workload) "
        "has a drag handle that appears on hover in the block header area. Dragging a block "
        "creates a floating clone with elevated shadow. A blue drop indicator line pulses "
        "above or below other blocks to show where it will land.",
        ST["body"]
    ))
    story.append(Paragraph(
        "The new order is saved to localStorage and restored on next visit. "
        "Drop animation uses a cubic-bezier curve for a natural settle effect.",
        ST["body"]
    ))

    story.append(PageBreak())

    # ════════════════════════════════
    # 4. DESIGN SYSTEM
    # ════════════════════════════════
    story.append(SectionDivider(content_width))
    story.append(Paragraph("4. Design System", ST["h1"]))

    # 4.1 Color Tokens
    story.append(Paragraph("4.1  Color Tokens", ST["h2"]))
    story.append(Paragraph(
        "Colors are defined as CSS custom properties on :root with a separate set "
        "for [data-theme='dark']. The two-token approach (highlight vs accent) keeps "
        "interactive elements visually separate from alert states.",
        ST["body"]
    ))

    color_data = [
        [Paragraph("<b>Token</b>", ST["table_header"]),
         Paragraph("<b>Light Value</b>", ST["table_header"]),
         Paragraph("<b>Dark Value</b>", ST["table_header"]),
         Paragraph("<b>Usage</b>", ST["table_header"])],
        [Paragraph("--highlight", ST["table_cell_code"]),
         Paragraph("#007AFF", ST["table_cell"]),
         Paragraph("#0A84FF", ST["table_cell"]),
         Paragraph("Interactive: buttons, links, focus rings, today indicator", ST["table_cell"])],
        [Paragraph("--highlight-soft", ST["table_cell_code"]),
         Paragraph("rgba(0,122,255,0.08)", ST["table_cell"]),
         Paragraph("rgba(10,132,255,0.14)", ST["table_cell"]),
         Paragraph("Hover backgrounds, secondary button fills", ST["table_cell"])],
        [Paragraph("--accent", ST["table_cell_code"]),
         Paragraph("#FF3B30", ST["table_cell"]),
         Paragraph("#FF453A", ST["table_cell"]),
         Paragraph("Alerts only: On Fire, overdue, carried tasks", ST["table_cell"])],
        [Paragraph("--accent-soft", ST["table_cell_code"]),
         Paragraph("rgba(255,59,48,0.08)", ST["table_cell"]),
         Paragraph("rgba(255,69,58,0.14)", ST["table_cell"]),
         Paragraph("Alert backgrounds (deadline tags, On Fire icon)", ST["table_cell"])],
        [Paragraph("--bg", ST["table_cell_code"]),
         Paragraph("#FBFBFD", ST["table_cell"]),
         Paragraph("#000000", ST["table_cell"]),
         Paragraph("Page background", ST["table_cell"])],
        [Paragraph("--bg-elev", ST["table_cell_code"]),
         Paragraph("#FFFFFF", ST["table_cell"]),
         Paragraph("#1C1C1E", ST["table_cell"]),
         Paragraph("Card surfaces, popovers, panels", ST["table_cell"])],
        [Paragraph("--text", ST["table_cell_code"]),
         Paragraph("#1D1D1F", ST["table_cell"]),
         Paragraph("#F5F5F7", ST["table_cell"]),
         Paragraph("Primary text, headings", ST["table_cell"])],
        [Paragraph("--text-muted", ST["table_cell_code"]),
         Paragraph("#636366", ST["table_cell"]),
         Paragraph("#AEAEB2", ST["table_cell"]),
         Paragraph("Secondary text, descriptions", ST["table_cell"])],
        [Paragraph("--hairline", ST["table_cell_code"]),
         Paragraph("rgba(0,0,0,0.08)", ST["table_cell"]),
         Paragraph("rgba(255,255,255,0.1)", ST["table_cell"]),
         Paragraph("Borders, dividers", ST["table_cell"])],
    ]
    ct = Table(color_data, colWidths=[content_width * 0.22, content_width * 0.22, content_width * 0.22, content_width * 0.34])
    ct.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), SURFACE),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(ct)

    # 4.2 Typography
    story.append(Paragraph("4.2  Typography Scale", ST["h2"]))
    story.append(Paragraph(
        "The page uses the system font stack: -apple-system, BlinkMacSystemFont, 'SF Pro Display', "
        "'SF Pro Text', 'Segoe UI', sans-serif. Font feature settings enable tabular numbers "
        "(tnum) and stylistic set 01.",
        ST["body"]
    ))

    type_data = [
        [Paragraph("<b>Role</b>", ST["table_header"]),
         Paragraph("<b>Size</b>", ST["table_header"]),
         Paragraph("<b>Weight</b>", ST["table_header"]),
         Paragraph("<b>Example</b>", ST["table_header"])],
        [Paragraph("Page title", ST["table_cell"]),
         Paragraph("34px", ST["table_cell"]),
         Paragraph("600", ST["table_cell"]),
         Paragraph("'Good morning, Nikko.'", ST["table_cell"])],
        [Paragraph("Day name (schedule)", ST["table_cell"]),
         Paragraph("21px", ST["table_cell"]),
         Paragraph("600", ST["table_cell"]),
         Paragraph("'Monday', 'Tuesday'", ST["table_cell"])],
        [Paragraph("Logo", ST["table_cell"]),
         Paragraph("18px", ST["table_cell"]),
         Paragraph("600", ST["table_cell"]),
         Paragraph("Header brand name", ST["table_cell"])],
        [Paragraph("Attention title", ST["table_cell"]),
         Paragraph("16px", ST["table_cell"]),
         Paragraph("600", ST["table_cell"]),
         Paragraph("Card title in attention list", ST["table_cell"])],
        [Paragraph("Popover heading", ST["table_cell"]),
         Paragraph("15px", ST["table_cell"]),
         Paragraph("700", ST["table_cell"]),
         Paragraph("'Delegate Task'", ST["table_cell"])],
        [Paragraph("Body/Nav/Buttons", ST["table_cell"]),
         Paragraph("13 - 14px", ST["table_cell"]),
         Paragraph("500", ST["table_cell"]),
         Paragraph("Descriptions, button labels, nav links", ST["table_cell"])],
        [Paragraph("Sections/Labels", ST["table_cell"]),
         Paragraph("11 - 12px", ST["table_cell"]),
         Paragraph("500 - 600", ST["table_cell"]),
         Paragraph("Section headers, severity badges, health labels", ST["table_cell"])],
        [Paragraph("Tags/Hints", ST["table_cell"]),
         Paragraph("10 - 11px", ST["table_cell"]),
         Paragraph("600", ST["table_cell"]),
         Paragraph("Task tags, calendar day-of-week, tooltips", ST["table_cell"])],
    ]
    tt = Table(type_data, colWidths=[content_width * 0.22, content_width * 0.12, content_width * 0.12, content_width * 0.54])
    tt.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), SURFACE),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(tt)
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "Tight letter-spacing is used on larger text (-0.022em on the title, -0.02em on day "
        "names). Uppercase labels use wider tracking (0.06 - 0.08em). This follows a traditional "
        "typographic scale where spacing tightens as size increases.",
        ST["body"]
    ))

    # 4.3 Component Patterns
    story.append(Paragraph("4.3  Component Patterns", ST["h2"]))

    story.append(Paragraph("Buttons", ST["h3"]))
    btn_data = [
        [Paragraph("<b>Type</b>", ST["table_header"]),
         Paragraph("<b>Default State</b>", ST["table_header"]),
         Paragraph("<b>Hover State</b>", ST["table_header"])],
        [Paragraph("Primary (solid)", ST["table_cell"]),
         Paragraph("Blue background, white text, blue border", ST["table_cell"]),
         Paragraph("Opacity 0.9", ST["table_cell"])],
        [Paragraph("Secondary (outline)", ST["table_cell"]),
         Paragraph("White background, hairline border, dark text", ST["table_cell"]),
         Paragraph("Soft blue bg, blue border, blue text", ST["table_cell"])],
        [Paragraph("Cancel (inside popover)", ST["table_cell"]),
         Paragraph("White background, hairline border", ST["table_cell"]),
         Paragraph("Soft blue bg, blue border, blue text", ST["table_cell"])],
        [Paragraph("Icon button (header)", ST["table_cell"]),
         Paragraph("Soft gray circle background, muted icon", ST["table_cell"]),
         Paragraph("Hairline background", ST["table_cell"])],
    ]
    bnt = Table(btn_data, colWidths=[content_width * 0.22, content_width * 0.39, content_width * 0.39])
    bnt.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), SURFACE),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(bnt)
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "All buttons use pill-shaped borders (border-radius: 980px) and a consistent "
        "13px font weight 500-600. Active states use scale(0.96) for tactile feedback.",
        ST["body"]
    ))

    story.append(Paragraph("Cards", ST["h3"]))
    story.append(Paragraph(
        "Cards use 16-18px border radius, 1px hairline-soft border, and a subtle box shadow. "
        "Hover states add elevation (shadow-hover) and a slight upward shift. All transitions "
        "are 0.15 to 0.2 seconds with ease timing.",
        ST["body"]
    ))

    story.append(Paragraph("Form inputs", ST["h3"]))
    story.append(Paragraph(
        "Inputs, textareas, and selects share a consistent look: 10px border radius, soft "
        "gray background, hairline border, 9px 12px padding. Focus state changes the border "
        "to blue (--highlight). Placeholder text uses --text-faint color.",
        ST["body"]
    ))

    # 4.4 Dark Mode
    story.append(Paragraph("4.4  Dark Mode", ST["h2"]))
    story.append(Paragraph(
        "Dark mode is toggled by setting data-theme='dark' on the root HTML element, "
        "persisted to localStorage. All colors swap through the CSS custom property system "
        "so components need zero class changes.",
        ST["body"]
    ))
    story.append(Paragraph(
        "Key dark mode adjustments:",
        ST["body"]
    ))
    dark_bullets = [
        "Page background goes full black (#000000), card surfaces to #1C1C1E",
        "Text flips to #F5F5F7 (near-white), muted text to #AEAEB2",
        "Borders shift from black-alpha to white-alpha for correct contrast",
        "Accent-soft and highlight-soft use higher alpha in dark mode (0.14 vs 0.08) for visibility",
        "Shadow intensities increase to stay perceptible on dark backgrounds",
        "Nav bar blur effect uses rgba(0,0,0,0.72) for the frosted glass look",
        "The blue highlight shifts from #007AFF to #0A84FF (brighter for dark backgrounds)",
    ]
    for b in dark_bullets:
        story.append(Paragraph(f"\u2022  {b}", ST["bullet"]))

    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "All theme transitions use 0.3s ease for background and color properties, so "
        "the switch feels smooth rather than jarring.",
        ST["body"]
    ))

    story.append(PageBreak())

    # ════════════════════════════════
    # 5. ACCESSIBILITY
    # ════════════════════════════════
    story.append(SectionDivider(content_width))
    story.append(Paragraph("5. Accessibility", ST["h1"]))
    story.append(Paragraph(
        "The mockup includes several accessibility considerations that need to be "
        "preserved and expanded during production build:",
        ST["body"]
    ))

    a11y_items = [
        ("<b>Reduced motion:</b> A @media (prefers-reduced-motion: reduce) rule sets all "
         "transition and animation durations to 0.01ms, disabling visual motion for users "
         "who have this system setting enabled."),
        ("<b>Keyboard dismissal:</b> Escape key closes the delegate popover and the team "
         "workload panel."),
        ("<b>ARIA labels:</b> Icon-only buttons (notifications, theme toggle, avatar, drag handles, "
         "close buttons) include aria-label attributes."),
        ("<b>aria-expanded:</b> The 'View all' toggle on the attention section tracks its "
         "expanded state with aria-expanded='true/false'."),
        ("<b>Semantic HTML:</b> The page uses header, main, nav elements. The mockup uses "
         "button elements (not divs) for interactive controls."),
        ("<b>Color + shape:</b> Severity levels use both color and text labels (not color alone). "
         "The 'On Fire' state is red dot + red text + 'On Fire' label."),
        ("<b>Tooltips:</b> All icon-only elements and metrics have data-tip attributes "
         "that explain what they mean on hover."),
    ]
    for item in a11y_items:
        story.append(Paragraph(f"\u2022  {item}", ST["bullet"]))

    story.append(Spacer(1, 8))
    story.append(Paragraph("Still needed for production (not in the mockup):", ST["h3"]))
    prod_a11y = [
        "Focus traps for the delegate popover and workload panel",
        "Skip-to-content link before the header for keyboard users",
        "role='checkbox' and aria-checked on week tasks that toggle completion",
        "Screen reader testing (VoiceOver/NVDA)",
        "Tab order audit across all interactive elements",
    ]
    for b in prod_a11y:
        story.append(Paragraph(f"\u2022  {b}", ST["bullet"]))

    # ════════════════════════════════
    # 6. RESPONSIVE STRATEGY
    # ════════════════════════════════
    story.append(Paragraph("6. Responsive Strategy", ST["h2"]))
    story.append(Paragraph(
        "The mockup is designed for desktop-first (1200px container). Two breakpoints "
        "are planned but not fully implemented in the mockup:",
        ST["body"]
    ))

    resp_data = [
        [Paragraph("<b>Breakpoint</b>", ST["table_header"]),
         Paragraph("<b>Layout Changes</b>", ST["table_header"])],
        [Paragraph("960px", ST["table_cell"]),
         Paragraph("Health strip: 2x2 grid (dividers hidden). Column height: 380px. "
                    "Page title: 28px.", ST["table_cell"])],
        [Paragraph("768px (tablet)", ST["table_cell"]),
         Paragraph("Week board: horizontal scroll with snap. Attention card actions: "
                    "stack below content. Workload: 3+2 wrap.", ST["table_cell"])],
        [Paragraph("480px (mobile)", ST["table_cell"]),
         Paragraph("Single column layout. Week board: swipeable single-day view. "
                    "Nav: hamburger menu. Health strip: vertical stack.", ST["table_cell"])],
    ]
    respt = Table(resp_data, colWidths=[content_width * 0.2, content_width * 0.8])
    respt.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), SURFACE),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(respt)

    story.append(PageBreak())

    # ════════════════════════════════
    # 7. DEVELOPER HANDOFF NOTES
    # ════════════════════════════════
    story.append(SectionDivider(content_width))
    story.append(Paragraph("7. Developer Handoff Notes", ST["h1"]))
    story.append(Paragraph(
        "These notes are embedded as a CSS comment block in the mockup file and are "
        "reproduced here for quick reference.",
        ST["body"]
    ))

    handoff_items = [
        ("<b>Focus traps:</b> The delegate popover (.delegate-pop) needs a focus trap. "
         "Tab should cycle within the popover and not escape to the page behind the backdrop. "
         "The team workload panel (.wl-panel) also needs a focus trap when open."),
        ("<b>Undo on delegation:</b> After a successful delegation, the toast should include "
         "an 'Undo' link with a 5-second countdown. Clicking Undo reverts the delegation."),
        ("<b>ARIA roles on week tasks:</b> Each .week-task toggles data-done on click but "
         "has no role='checkbox' or aria-checked. Add these for screen reader support."),
        ("<b>Skip-to-content:</b> Add a visually-hidden skip link before the header for "
         "keyboard users: &lt;a href='#main' class='sr-only focus:not-sr-only'&gt;Skip to content&lt;/a&gt;"),
        ("<b>Empty states:</b> Design these for each section when data is missing:"),
    ]
    for item in handoff_items:
        story.append(Paragraph(f"\u2022  {item}", ST["bullet"]))

    empty_states = [
        "Portfolio Health: 'No active clients yet. Add your first client to see health metrics.'",
        "Attention: 'Nothing needs your attention right now. Nice work!'",
        "Schedule: 'No tasks scheduled this week. Enjoy the breathing room.'",
        "Team Workload: 'No team members assigned yet.'",
    ]
    for es in empty_states:
        story.append(Paragraph(f"&nbsp;&nbsp;&nbsp;&nbsp;\u2013  {es}", ST["bullet"]))

    story.append(Spacer(1, 8))
    story.append(Paragraph(
        "The mockup file is a single self-contained HTML file with inline styles and scripts. "
        "In production, the CSS should be extracted into the project's design token system and "
        "the JavaScript should be converted to proper components. The mockup uses vanilla JS "
        "for interactions so the logic is easy to read without framework knowledge.",
        ST["body"]
    ))

    # ════════════════════════════════
    # 8. STUBS
    # ════════════════════════════════
    story.append(Paragraph("8. What Is Not Built Yet (Stubs)", ST["h2"]))
    story.append(Paragraph(
        "The following interactions are visible in the mockup but do not have working "
        "behavior yet. They need to be wired up during production development:",
        ST["body"]
    ))

    stub_items = [
        "'Review' button on attention cards (should open the task/project detail)",
        "Clicking an attention card body (should navigate to the related project)",
        "Clicking a week task (should open a task detail view)",
        "Search bar / Command+K (should open a search overlay)",
        "Notification bell (should open a notifications panel)",
        "User avatar dropdown (should show account menu with sign-out)",
        "Analytics nav link (no page built yet)",
        "Weather API geolocation (works in mockup but needs production error handling)",
    ]
    for item in stub_items:
        story.append(Paragraph(f"\u2022  {item}", ST["bullet"]))

    story.append(Spacer(1, 24))
    story.append(HLine(content_width, BORDER, 0.5))
    story.append(Spacer(1, 12))
    story.append(Paragraph(
        "End of document. Questions or feedback go to the project lead.",
        ST["caption"]
    ))

    # ── Build ──
    doc.build(story)
    return output_path


if __name__ == "__main__":
    path = build_pdf()
    print(f"PDF created: {path}")
