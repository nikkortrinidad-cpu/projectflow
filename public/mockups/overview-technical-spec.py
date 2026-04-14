#!/usr/bin/env python3
"""
Generate the Overview Page technical spec PDF for the developer.
Run: python3 overview-technical-spec.py
Output: overview-technical-spec.pdf (same directory)
"""

import os
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, Frame, PageTemplate,
    BaseDocTemplate, NextPageTemplate, Preformatted,
)
from reportlab.platypus.flowables import Flowable

# ── Colors ──
PRIMARY = HexColor("#007AFF")
TEXT = HexColor("#1D1D1F")
TEXT_MUTED = HexColor("#636366")
TEXT_SOFT = HexColor("#86868B")
SURFACE = HexColor("#F5F5F7")
BORDER = HexColor("#E5E5EA")
CODE_BG = HexColor("#F8F8FA")
WHITE = white

FONT = "Helvetica"
FONT_BOLD = "Helvetica-Bold"
MONO = "Courier"
MONO_BOLD = "Courier-Bold"


def make_styles():
    s = {}
    s["cover_title"] = ParagraphStyle(
        "CoverTitle", fontName=FONT_BOLD, fontSize=34, leading=40,
        textColor=TEXT, spaceAfter=8
    )
    s["cover_sub"] = ParagraphStyle(
        "CoverSub", fontName=FONT, fontSize=14, leading=20,
        textColor=TEXT_MUTED, spaceAfter=4
    )
    s["cover_meta"] = ParagraphStyle(
        "CoverMeta", fontName=FONT, fontSize=11, leading=16,
        textColor=TEXT_SOFT
    )
    s["h1"] = ParagraphStyle(
        "H1", fontName=FONT_BOLD, fontSize=22, leading=28,
        textColor=TEXT, spaceBefore=0, spaceAfter=12
    )
    s["h2"] = ParagraphStyle(
        "H2", fontName=FONT_BOLD, fontSize=15, leading=20,
        textColor=TEXT, spaceBefore=20, spaceAfter=8
    )
    s["h3"] = ParagraphStyle(
        "H3", fontName=FONT_BOLD, fontSize=12, leading=17,
        textColor=TEXT, spaceBefore=14, spaceAfter=5
    )
    s["body"] = ParagraphStyle(
        "Body", fontName=FONT, fontSize=10, leading=15,
        textColor=TEXT, spaceAfter=7
    )
    s["bullet"] = ParagraphStyle(
        "Bullet", fontName=FONT, fontSize=10, leading=15,
        textColor=TEXT, spaceAfter=3, leftIndent=20, bulletIndent=10
    )
    s["bullet_inner"] = ParagraphStyle(
        "BulletInner", fontName=FONT, fontSize=10, leading=15,
        textColor=TEXT, spaceAfter=2, leftIndent=36, bulletIndent=26
    )
    s["code_block"] = ParagraphStyle(
        "CodeBlock", fontName=MONO, fontSize=8.5, leading=12.5,
        textColor=TEXT, spaceAfter=8, leftIndent=12,
        backColor=CODE_BG, borderPadding=(8, 8, 8, 8),
    )
    s["code_inline"] = ParagraphStyle(
        "CodeInline", fontName=MONO, fontSize=9, leading=14,
        textColor=TEXT_MUTED
    )
    s["caption"] = ParagraphStyle(
        "Caption", fontName=FONT, fontSize=9, leading=13,
        textColor=TEXT_SOFT, spaceAfter=4
    )
    s["note"] = ParagraphStyle(
        "Note", fontName=FONT, fontSize=9.5, leading=14,
        textColor=PRIMARY, spaceAfter=6, leftIndent=12,
    )
    s["toc_h1"] = ParagraphStyle(
        "TOCH1", fontName=FONT_BOLD, fontSize=11, leading=18,
        textColor=TEXT, spaceAfter=2
    )
    s["toc_item"] = ParagraphStyle(
        "TOC", fontName=FONT, fontSize=11, leading=18,
        textColor=TEXT, leftIndent=8, spaceAfter=2
    )
    s["th"] = ParagraphStyle(
        "TH", fontName=FONT_BOLD, fontSize=9, leading=13, textColor=TEXT
    )
    s["td"] = ParagraphStyle(
        "TD", fontName=FONT, fontSize=9, leading=13, textColor=TEXT
    )
    s["td_code"] = ParagraphStyle(
        "TDCode", fontName=MONO, fontSize=8.5, leading=13, textColor=TEXT_MUTED
    )
    return s


class SectionDivider(Flowable):
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


class HLine(Flowable):
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


def draw_footer(c, doc):
    c.saveState()
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.5)
    c.line(doc.leftMargin, 36, doc.width + doc.leftMargin, 36)
    c.setFont(FONT, 8)
    c.setFillColor(TEXT_SOFT)
    c.drawString(doc.leftMargin, 24, "Overview Page | Technical Spec")
    c.drawRightString(doc.width + doc.leftMargin, 24, f"Page {doc.page}")
    c.restoreState()


def make_table(data, col_widths, ST):
    """Helper to build a consistently styled table."""
    t = Table(data, colWidths=col_widths)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), SURFACE),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t


def build_pdf():
    output_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "overview-technical-spec.pdf"
    )

    doc = BaseDocTemplate(
        output_path, pagesize=letter,
        leftMargin=60, rightMargin=60,
        topMargin=52, bottomMargin=52,
        title="Overview Page — Technical Spec",
        author="Product Team",
        subject="Developer Implementation Guide"
    )

    frame_cover = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="cover")
    frame_body = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="body")

    doc.addPageTemplates([
        PageTemplate(id="cover", frames=frame_cover, onPage=lambda c, d: None),
        PageTemplate(id="body", frames=frame_body, onPage=draw_footer),
    ])

    ST = make_styles()
    W = doc.width
    story = []

    # ════════════════════════════════════
    # COVER
    # ════════════════════════════════════
    story.append(Spacer(1, 1.8 * inch))
    story.append(Paragraph("Overview Page", ST["cover_title"]))
    story.append(Spacer(1, 4))
    story.append(Paragraph("Technical Spec for Production Build", ST["cover_sub"]))
    story.append(Spacer(1, 20))
    story.append(HLine(W * 0.18, PRIMARY, 2))
    story.append(Spacer(1, 20))
    story.append(Paragraph("Audience: Senior Web Developer", ST["cover_meta"]))
    story.append(Paragraph("Version: 1.0  |  April 2026", ST["cover_meta"]))
    story.append(Spacer(1, 2.2 * inch))
    story.append(Paragraph(
        "This document is the build spec. It covers every data shape, CSS token, "
        "interaction rule, and edge case your code needs to handle. "
        "The design rationale lives in the companion document "
        "(overview-page-documentation.pdf). This one is just the how.",
        ST["body"]
    ))
    story.append(Spacer(1, 12))
    story.append(Paragraph(
        "<b>Reference mockup:</b> <font face='Courier' size='9'>public/mockups/00-overview-refined.html</font><br/>"
        "<b>Design doc:</b> <font face='Courier' size='9'>public/mockups/overview-page-documentation.pdf</font><br/>"
        "<b>Repo:</b> <font face='Courier' size='9'>https://github.com/nikkortrinidad-cpu/kanban-website</font>",
        ST["body"]
    ))

    story.append(NextPageTemplate("body"))
    story.append(PageBreak())

    # ════════════════════════════════════
    # TOC
    # ════════════════════════════════════
    story.append(Paragraph("Contents", ST["h1"]))
    story.append(Spacer(1, 6))

    toc = [
        ("1", "Source File and Project Context", True),
        ("2", "Data Contracts (JSON Shapes)", True),
        ("", "2.1  Portfolio Health", False),
        ("", "2.2  Attention Items", False),
        ("", "2.3  Schedule (Week Board)", False),
        ("", "2.4  Team Members and Workload", False),
        ("", "2.5  User / Session", False),
        ("3", "CSS Architecture", True),
        ("", "3.1  Token Map (Full)", False),
        ("", "3.2  Dark Mode Mechanism", False),
        ("", "3.3  Key Layout Values", False),
        ("4", "Component Inventory", True),
        ("5", "Interaction Specs", True),
        ("", "5.1  Delegate Popover", False),
        ("", "5.2  Calendar Picker", False),
        ("", "5.3  Task Carry-Over", False),
        ("", "5.4  Block Reorder (Drag-and-Drop)", False),
        ("", "5.5  Tooltip System", False),
        ("", "5.6  Week Tab Switching", False),
        ("", "5.7  Workload Panel", False),
        ("6", "State and Persistence", True),
        ("7", "Accessibility Checklist", True),
        ("8", "Deployment (GitHub Pages)", True),
        ("9", "Open Decisions", True),
    ]
    for num, label, is_h in toc:
        prefix = f"<b>{num}</b>&nbsp;&nbsp;&nbsp;" if num else "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"
        story.append(Paragraph(f"{prefix}{label}", ST["toc_h1"] if is_h else ST["toc_item"]))

    story.append(PageBreak())

    # ════════════════════════════════════
    # 1. SOURCE FILE
    # ════════════════════════════════════
    story.append(SectionDivider(W))
    story.append(Paragraph("1. Source File and Project Context", ST["h1"]))
    story.append(Paragraph(
        "The mockup is a single self-contained HTML file with inline CSS and vanilla JS. "
        "No build step, no framework, no external dependencies.",
        ST["body"]
    ))
    story.append(Paragraph(
        "<font face='Courier' size='9'>public/mockups/00-overview-refined.html</font>",
        ST["body"]
    ))
    story.append(Paragraph(
        "This page is a <b>standalone project</b>. It is not part of the existing React/TypeScript kanban app "
        "in this repo. The kanban app happens to share the same repository and deployment pipeline, "
        "but the overview page has its own tech choices. Pick whatever framework (or none) fits best.",
        ST["body"]
    ))
    story.append(Paragraph(
        "The mockup uses vanilla JS so every behavior is readable without framework knowledge. "
        "Treat the mockup as the source of truth for visual output. This spec documents the "
        "logic and data behind it.",
        ST["body"]
    ))

    story.append(Paragraph("What you get from the mockup file:", ST["h3"]))
    mb = [
        "All CSS custom properties (design tokens) with light and dark values",
        "Complete HTML structure for every section",
        "All JS interactions: delegate popover, calendar picker, carry-over, drag reorder, tooltips, "
        "theme toggle, greeting logic, weather integration, week tabs, workload panel",
        "Responsive breakpoint at 960px (partial); 768px and 480px are spec'd but not built",
        "Developer handoff notes as a CSS comment block (lines 1252-1293)",
    ]
    for b in mb:
        story.append(Paragraph(f"\u2022  {b}", ST["bullet"]))

    story.append(PageBreak())

    # ════════════════════════════════════
    # 2. DATA CONTRACTS
    # ════════════════════════════════════
    story.append(SectionDivider(W))
    story.append(Paragraph("2. Data Contracts", ST["h1"]))
    story.append(Paragraph(
        "These are the JSON shapes the page expects. The data source is your call "
        "(REST API, Firestore, static file, whatever). These shapes match what the "
        "mockup renders, so your components can consume them directly.",
        ST["body"]
    ))

    # 2.1 Portfolio Health
    story.append(Paragraph("2.1  Portfolio Health", ST["h2"]))
    story.append(Preformatted(
        '{\n'
        '  "onFire":      number,    // count of critical clients\n'
        '  "atRisk":      number,    // count of at-risk clients\n'
        '  "onTrack":     number,    // count of healthy clients\n'
        '  "avgDelivery": number,    // 0-100, percentage on-time\n'
        '  "totalClients": number    // shown in section subtitle\n'
        '}',
        ST["code_block"]
    ))
    story.append(Paragraph(
        "The 'On Fire' value renders in red (--accent). All others use default text color. "
        "Each cell has a tooltip explaining the metric (hardcoded strings in the mockup).",
        ST["body"]
    ))

    # 2.2 Attention Items
    story.append(Paragraph("2.2  Attention Items", ST["h2"]))
    story.append(Preformatted(
        '{\n'
        '  "id":          string,\n'
        '  "severity":    "critical" | "warning" | "info",\n'
        '  "severityLabel": string,  // "On Fire", "At Risk", "Decision", "Onboarding"\n'
        '  "client":      string,    // client/project name\n'
        '  "age":         string,    // "3 days overdue", "5 hours left", etc.\n'
        '  "title":       string,    // bold card title\n'
        '  "description": string,    // one-line summary, max ~62 chars\n'
        '}',
        ST["code_block"]
    ))
    story.append(Paragraph("Rendering rules:", ST["h3"]))
    attn_rules = [
        "Sort by severity: critical first, then warning, then info.",
        "Show the first 3 items. Hide the rest behind a '3 more items' toggle.",
        "The 'View all N' link in the header and the '3 more items' footer toggle the same expanded state.",
        "Left border color: red for critical, gray (--text-soft, 70% opacity) for warning, "
        "faint gray (--text-faint, 40% opacity) for info.",
        "Severity badge dot color matches the border color logic.",
        "Each card has two actions: Delegate (opens popover) and Review (navigation, not built yet).",
    ]
    for r in attn_rules:
        story.append(Paragraph(f"\u2022  {r}", ST["bullet"]))

    # 2.3 Schedule
    story.append(Paragraph("2.3  Schedule (Week Board)", ST["h2"]))
    story.append(Paragraph("Each task in the schedule board:", ST["body"]))
    story.append(Preformatted(
        '{\n'
        '  "id":        string,\n'
        '  "title":     string,\n'
        '  "meta":      string,      // assignee, time, or context line\n'
        '  "tag":       "deadline" | "meeting" | "milestone",\n'
        '  "done":      boolean,     // used for carry-over logic\n'
        '  "dayIndex":  number,      // 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri\n'
        '  "week":      "current" | "next"\n'
        '}',
        ST["code_block"]
    ))
    story.append(Paragraph("Column data (derived, not stored):", ST["body"]))
    story.append(Preformatted(
        '// Each weekday column\n'
        '{\n'
        '  "dayIndex":   number,      // 0-4 for current week, 5-9 for next\n'
        '  "dayName":    string,      // "Monday", "Tuesday", etc.\n'
        '  "dateLabel":  string,      // "Apr 14, 2026"\n'
        '  "dateNum":    number,      // 14 (used to match today)\n'
        '  "week":       "current" | "next"\n'
        '}',
        ST["code_block"]
    ))
    story.append(Paragraph("Tag rendering:", ST["h3"]))
    tag_data = [
        [Paragraph("<b>Tag</b>", ST["th"]),
         Paragraph("<b>Background</b>", ST["th"]),
         Paragraph("<b>Text Color</b>", ST["th"]),
         Paragraph("<b>Icon</b>", ST["th"])],
        [Paragraph("deadline", ST["td_code"]),
         Paragraph("--accent-soft", ST["td"]),
         Paragraph("--accent (red)", ST["td"]),
         Paragraph("Clock circle", ST["td"])],
        [Paragraph("meeting", ST["td_code"]),
         Paragraph("--bg-elev", ST["td"]),
         Paragraph("--text-muted", ST["td"]),
         Paragraph("People group", ST["td"])],
        [Paragraph("milestone", ST["td_code"]),
         Paragraph("--bg-elev", ST["td"]),
         Paragraph("--text-muted", ST["td"]),
         Paragraph("Flag", ST["td"])],
    ]
    story.append(make_table(tag_data, [W*0.15, W*0.25, W*0.3, W*0.3], ST))

    story.append(PageBreak())

    # 2.4 Team Workload
    story.append(Paragraph("2.4  Team Members and Workload", ST["h2"]))
    story.append(Preformatted(
        '// Team member\n'
        '{\n'
        '  "name":      string,\n'
        '  "role":      string,\n'
        '  "initials":  string,      // 2 chars, used in avatar\n'
        '  "avatarBg":  string,      // hex, e.g. "#e0e7ff"\n'
        '  "avatarFg":  string,      // hex, e.g. "#4f46e5"\n'
        '  "tasks":     Task[]\n'
        '}\n'
        '\n'
        '// Task within a team member\n'
        '{\n'
        '  "title":   string,\n'
        '  "meta":    string,        // schedule context\n'
        '  "block":   "full" | "half" | "quarter" | "quick",\n'
        '  "urgent":  boolean        // shows red dot in panel\n'
        '}',
        ST["code_block"]
    ))
    story.append(Paragraph("FDE (Full Day Equivalent) calculation:", ST["h3"]))
    fde_data = [
        [Paragraph("<b>Block</b>", ST["th"]),
         Paragraph("<b>FDE Value</b>", ST["th"]),
         Paragraph("<b>Ring Color</b>", ST["th"]),
         Paragraph("<b>Panel Badge Color</b>", ST["th"])],
        [Paragraph("full", ST["td_code"]),
         Paragraph("1.0", ST["td"]),
         Paragraph("(per total)", ST["td"]),
         Paragraph("Blue (#3B82F6)", ST["td"])],
        [Paragraph("half", ST["td_code"]),
         Paragraph("0.5", ST["td"]),
         Paragraph("(per total)", ST["td"]),
         Paragraph("Green (#10B981)", ST["td"])],
        [Paragraph("quarter", ST["td_code"]),
         Paragraph("0.25", ST["td"]),
         Paragraph("(per total)", ST["td"]),
         Paragraph("Amber (#F59E0B)", ST["td"])],
        [Paragraph("quick", ST["td_code"]),
         Paragraph("0 (not counted)", ST["td"]),
         Paragraph("(per total)", ST["td"]),
         Paragraph("Gray (--text-faint)", ST["td"])],
    ]
    story.append(make_table(fde_data, [W*0.15, W*0.2, W*0.3, W*0.35], ST))
    story.append(Spacer(1, 6))

    story.append(Paragraph("Ring color thresholds (capacity = 4 FDE):", ST["h3"]))
    ring_data = [
        [Paragraph("<b>Total FDE</b>", ST["th"]),
         Paragraph("<b>Status</b>", ST["th"]),
         Paragraph("<b>Ring Stroke</b>", ST["th"])],
        [Paragraph("0 - 1.9", ST["td"]),
         Paragraph("light", ST["td_code"]),
         Paragraph("#10B981 (green)", ST["td"])],
        [Paragraph("2 - 3.9", ST["td"]),
         Paragraph("steady", ST["td_code"]),
         Paragraph("#3B82F6 (blue)", ST["td"])],
        [Paragraph("4 - 4.9", ST["td"]),
         Paragraph("heavy", ST["td_code"]),
         Paragraph("#F59E0B (amber)", ST["td"])],
        [Paragraph("5+", ST["td"]),
         Paragraph("over", ST["td_code"]),
         Paragraph("--accent (red)", ST["td"])],
    ]
    story.append(make_table(ring_data, [W*0.2, W*0.2, W*0.6], ST))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "Ring is an SVG circle with radius 21, circumference ~131.95. "
        "stroke-dasharray = circumference. stroke-dashoffset = circumference * (1 - pct), "
        "where pct = min(totalFDE / capacity, 1). Rotate the SVG -90deg so the fill starts at 12 o'clock.",
        ST["body"]
    ))

    # 2.5 User/Session
    story.append(Paragraph("2.5  User / Session", ST["h2"]))
    story.append(Preformatted(
        '{\n'
        '  "name":      string,      // first name for greeting\n'
        '  "initials":  string,      // avatar in header\n'
        '}',
        ST["code_block"]
    ))
    story.append(Paragraph(
        "The greeting is built from the user's first name and the current hour: "
        "'Good morning' (before 12), 'Good afternoon' (12-16), 'Good evening' (17+). "
        "Tagline rotates daily from a 14-item array, indexed by day-of-year mod 14.",
        ST["body"]
    ))
    story.append(Paragraph(
        "Weather integration is optional. If the browser grants geolocation, "
        "a request to the Open-Meteo API returns temperature and weather code. "
        "Notable conditions (rain, snow, extreme heat/cold, storms) append a short "
        "note to the greeting. Fail silently on denied permissions or network error.",
        ST["body"]
    ))

    story.append(PageBreak())

    # ════════════════════════════════════
    # 3. CSS ARCHITECTURE
    # ════════════════════════════════════
    story.append(SectionDivider(W))
    story.append(Paragraph("3. CSS Architecture", ST["h1"]))

    # 3.1 Token Map
    story.append(Paragraph("3.1  Token Map (Full)", ST["h2"]))
    story.append(Paragraph(
        "All colors, shadows, and backgrounds are defined as CSS custom properties "
        "on :root (light) and :root[data-theme='dark'] (dark). Copy these directly "
        "from the mockup. Here is the complete list:",
        ST["body"]
    ))

    token_rows = [
        [Paragraph("<b>Token</b>", ST["th"]),
         Paragraph("<b>Light</b>", ST["th"]),
         Paragraph("<b>Dark</b>", ST["th"])],
        [Paragraph("--bg", ST["td_code"]), Paragraph("#FBFBFD", ST["td"]), Paragraph("#000000", ST["td"])],
        [Paragraph("--bg-elev", ST["td_code"]), Paragraph("#FFFFFF", ST["td"]), Paragraph("#1C1C1E", ST["td"])],
        [Paragraph("--bg-soft", ST["td_code"]), Paragraph("#F5F5F7", ST["td"]), Paragraph("#2C2C2E", ST["td"])],
        [Paragraph("--bg-faint", ST["td_code"]), Paragraph("#FAFAFA", ST["td"]), Paragraph("#161618", ST["td"])],
        [Paragraph("--text", ST["td_code"]), Paragraph("#1D1D1F", ST["td"]), Paragraph("#F5F5F7", ST["td"])],
        [Paragraph("--text-muted", ST["td_code"]), Paragraph("#636366", ST["td"]), Paragraph("#AEAEB2", ST["td"])],
        [Paragraph("--text-soft", ST["td_code"]), Paragraph("#86868B", ST["td"]), Paragraph("#86868B", ST["td"])],
        [Paragraph("--text-faint", ST["td_code"]), Paragraph("#AEAEB2", ST["td"]), Paragraph("#636366", ST["td"])],
        [Paragraph("--hairline", ST["td_code"]), Paragraph("rgba(0,0,0,0.08)", ST["td"]), Paragraph("rgba(255,255,255,0.1)", ST["td"])],
        [Paragraph("--hairline-soft", ST["td_code"]), Paragraph("rgba(0,0,0,0.04)", ST["td"]), Paragraph("rgba(255,255,255,0.06)", ST["td"])],
        [Paragraph("--hairline-faint", ST["td_code"]), Paragraph("rgba(0,0,0,0.02)", ST["td"]), Paragraph("rgba(255,255,255,0.03)", ST["td"])],
        [Paragraph("--accent", ST["td_code"]), Paragraph("#FF3B30", ST["td"]), Paragraph("#FF453A", ST["td"])],
        [Paragraph("--accent-soft", ST["td_code"]), Paragraph("rgba(255,59,48,0.08)", ST["td"]), Paragraph("rgba(255,69,58,0.14)", ST["td"])],
        [Paragraph("--highlight", ST["td_code"]), Paragraph("#007AFF", ST["td"]), Paragraph("#0A84FF", ST["td"])],
        [Paragraph("--highlight-soft", ST["td_code"]), Paragraph("rgba(0,122,255,0.08)", ST["td"]), Paragraph("rgba(10,132,255,0.14)", ST["td"])],
        [Paragraph("--shadow", ST["td_code"]), Paragraph("0 1px 3px rgba(0,0,0,0.04)", ST["td"]), Paragraph("0 1px 3px rgba(0,0,0,0.4)", ST["td"])],
        [Paragraph("--shadow-hover", ST["td_code"]), Paragraph("0 4px 16px rgba(0,0,0,0.08)", ST["td"]), Paragraph("0 4px 16px rgba(0,0,0,0.6)", ST["td"])],
        [Paragraph("--avatar-bg", ST["td_code"]), Paragraph("#1D1D1F", ST["td"]), Paragraph("#F5F5F7", ST["td"])],
        [Paragraph("--avatar-fg", ST["td_code"]), Paragraph("#FFFFFF", ST["td"]), Paragraph("#1D1D1F", ST["td"])],
        [Paragraph("--nav-bg", ST["td_code"]), Paragraph("rgba(255,255,255,0.72)", ST["td"]), Paragraph("rgba(0,0,0,0.72)", ST["td"])],
        [Paragraph("--btn-bg", ST["td_code"]), Paragraph("#FFFFFF", ST["td"]), Paragraph("#1C1C1E", ST["td"])],
        [Paragraph("--btn-bg-hover", ST["td_code"]), Paragraph("#F5F5F7", ST["td"]), Paragraph("#2C2C2E", ST["td"])],
        [Paragraph("--kbd-bg", ST["td_code"]), Paragraph("#FFFFFF", ST["td"]), Paragraph("#2C2C2E", ST["td"])],
        [Paragraph("--kbd-border", ST["td_code"]), Paragraph("#D2D2D7", ST["td"]), Paragraph("rgba(255,255,255,0.15)", ST["td"])],
    ]
    story.append(make_table(token_rows, [W*0.25, W*0.375, W*0.375], ST))

    # 3.2 Dark Mode
    story.append(Paragraph("3.2  Dark Mode Mechanism", ST["h2"]))
    story.append(Paragraph(
        "Toggle sets <font face='Courier' size='9'>data-theme='dark'</font> on "
        "<font face='Courier' size='9'>&lt;html&gt;</font> and persists to "
        "<font face='Courier' size='9'>localStorage</font> (key: "
        "<font face='Courier' size='9'>refined-theme</font>). "
        "A blocking script in &lt;head&gt; reads the value before first paint to prevent flash. "
        "All components consume tokens, so zero class changes are needed per component.",
        ST["body"]
    ))
    story.append(Paragraph(
        "Transitions: background and color properties use 0.3s ease. "
        "Theme toggle icon swaps via CSS display (moon visible in light, sun visible in dark).",
        ST["body"]
    ))

    # 3.3 Layout Values
    story.append(Paragraph("3.3  Key Layout Values", ST["h2"]))
    layout_data = [
        [Paragraph("<b>Element</b>", ST["th"]),
         Paragraph("<b>Value</b>", ST["th"])],
        [Paragraph("Page max-width", ST["td"]), Paragraph("1200px, centered", ST["td"])],
        [Paragraph("Page padding", ST["td"]), Paragraph("36px top, 32px sides, 96px bottom", ST["td"])],
        [Paragraph("Header height", ST["td"]), Paragraph("56px, sticky top, z-index 100", ST["td"])],
        [Paragraph("Header blur", ST["td"]), Paragraph("saturate(180%) blur(20px)", ST["td"])],
        [Paragraph("Block spacing", ST["td"]), Paragraph("48px margin-bottom between sections", ST["td"])],
        [Paragraph("Health strip grid", ST["td"]), Paragraph("1.2fr 1px 1fr 1px 1fr 1px 1fr, gap 32px", ST["td"])],
        [Paragraph("Health strip radius", ST["td"]), Paragraph("18px", ST["td"])],
        [Paragraph("Attention card radius", ST["td"]), Paragraph("16px", ST["td"])],
        [Paragraph("Week board grid", ST["td"]), Paragraph("repeat(5, 1fr), gap 12px", ST["td"])],
        [Paragraph("Week column height", ST["td"]), Paragraph("420px fixed (380px at 960px)", ST["td"])],
        [Paragraph("Week column radius", ST["td"]), Paragraph("16px", ST["td"])],
        [Paragraph("Workload card radius", ST["td"]), Paragraph("14px", ST["td"])],
        [Paragraph("Ring chart SVG", ST["td"]), Paragraph("52x52 viewBox, circle r=21, stroke-width 5", ST["td"])],
        [Paragraph("Workload panel width", ST["td"]), Paragraph("400px, max 90vw-24px, right-anchored", ST["td"])],
        [Paragraph("Delegate popover width", ST["td"]), Paragraph("340px, position: fixed on body", ST["td"])],
        [Paragraph("Button border-radius", ST["td"]), Paragraph("980px (pill shape)", ST["td"])],
        [Paragraph("Scrollbar width", ST["td"]), Paragraph("4px, hairline thumb", ST["td"])],
        [Paragraph("Base font size", ST["td"]), Paragraph("14px on body", ST["td"])],
        [Paragraph("Font stack", ST["td"]),
         Paragraph("-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Segoe UI', sans-serif", ST["td"])],
    ]
    story.append(make_table(layout_data, [W*0.3, W*0.7], ST))

    story.append(PageBreak())

    # ════════════════════════════════════
    # 4. COMPONENT INVENTORY
    # ════════════════════════════════════
    story.append(SectionDivider(W))
    story.append(Paragraph("4. Component Inventory", ST["h1"]))
    story.append(Paragraph(
        "This is the list of distinct UI pieces in the mockup. "
        "How you organize them into components is up to you.",
        ST["body"]
    ))

    comp_data = [
        [Paragraph("<b>Component</b>", ST["th"]),
         Paragraph("<b>CSS Class</b>", ST["th"]),
         Paragraph("<b>Notes</b>", ST["th"])],
        [Paragraph("Header", ST["td"]),
         Paragraph(".header", ST["td_code"]),
         Paragraph("Sticky, blur, contains nav + search + actions", ST["td"])],
        [Paragraph("Page Greeting", ST["td"]),
         Paragraph(".page-header", ST["td_code"]),
         Paragraph("Dynamic: time of day, weather, rotating tagline", ST["td"])],
        [Paragraph("Health Strip", ST["td"]),
         Paragraph(".health-strip", ST["td_code"]),
         Paragraph("4 cells + 3 dividers in a grid", ST["td"])],
        [Paragraph("Health Cell", ST["td"]),
         Paragraph(".health-cell", ST["td_code"]),
         Paragraph("Icon (44x44, 12px radius) + label + value + subtitle", ST["td"])],
        [Paragraph("Attention Card", ST["td"]),
         Paragraph(".attn-card", ST["td_code"]),
         Paragraph("Left border, severity badge, actions. 3 visible + N hidden", ST["td"])],
        [Paragraph("Delegate Popover", ST["td"]),
         Paragraph(".delegate-pop", ST["td_code"]),
         Paragraph("Appended to body, fixed position, 340px wide", ST["td"])],
        [Paragraph("Calendar Picker", ST["td"]),
         Paragraph(".dp-cal", ST["td_code"]),
         Paragraph("Inside delegate popover, opens upward", ST["td"])],
        [Paragraph("Week Column", ST["td"]),
         Paragraph(".week-col", ST["td_code"]),
         Paragraph("420px tall, header + scrollable body. States: is-today, is-past", ST["td"])],
        [Paragraph("Week Task", ST["td"]),
         Paragraph(".week-task", ST["td_code"]),
         Paragraph("Title + meta + tag pill. Carried variant has red left border", ST["td"])],
        [Paragraph("Week Tabs", ST["td"]),
         Paragraph(".week-tabs", ST["td_code"]),
         Paragraph("Pill-style segmented control: This week / Next week", ST["td"])],
        [Paragraph("Workload Card", ST["td"]),
         Paragraph(".wl-card", ST["td_code"]),
         Paragraph("Ring chart + avatar + name + role. Clickable.", ST["td"])],
        [Paragraph("Workload Panel", ST["td"]),
         Paragraph(".wl-panel", ST["td_code"]),
         Paragraph("Slide-in from right. Backdrop + panel. 400px wide.", ST["td"])],
        [Paragraph("Block Drag Handle", ST["td"]),
         Paragraph(".block-drag-handle", ST["td_code"]),
         Paragraph("6-dot grip icon, appears on block hover", ST["td"])],
        [Paragraph("Back to Top", ST["td"]),
         Paragraph(".back-to-top", ST["td_code"]),
         Paragraph("Fixed bottom-right, appears after 400px scroll", ST["td"])],
        [Paragraph("Tooltip", ST["td"]),
         Paragraph(".tip-bubble", ST["td_code"]),
         Paragraph("Single reusable element, repositioned by JS", ST["td"])],
    ]
    story.append(make_table(comp_data, [W*0.18, W*0.22, W*0.6], ST))

    story.append(PageBreak())

    # ════════════════════════════════════
    # 5. INTERACTION SPECS
    # ════════════════════════════════════
    story.append(SectionDivider(W))
    story.append(Paragraph("5. Interaction Specs", ST["h1"]))

    # 5.1 Delegate Popover
    story.append(Paragraph("5.1  Delegate Popover", ST["h2"]))
    story.append(Paragraph("<b>Trigger:</b> Click the 'Delegate' button on any attention card.", ST["body"]))
    story.append(Paragraph("<b>Positioning:</b>", ST["body"]))
    pop_rules = [
        "Append to document.body (not inside the card). This is required because .attn-card "
        "creates a CSS stacking context on hover (transform: translateY), which traps z-index.",
        "Use position: fixed. Calculate right and bottom from the trigger button's getBoundingClientRect().",
        "A transparent backdrop (position: fixed, inset: 0, z-index: 998) sits behind the popover (z-index: 999).",
    ]
    for r in pop_rules:
        story.append(Paragraph(f"\u2022  {r}", ST["bullet"]))

    story.append(Paragraph("<b>Fields:</b>", ST["body"]))
    field_spec = [
        "<b>Assign to</b> (combo box): Text input filters a dropdown of team members by name or role. "
        "Selecting a member fills the input, closes the dropdown, enables the submit button. "
        "Typing resets the selection. Auto-select on exact name match.",
        "<b>Note</b> (textarea): Optional. Placeholder: 'Quick context or instructions...'",
        "<b>Priority</b> (select): Auto-filled from card severity. "
        "critical='Urgent', warning='High', info/other='Medium'. Options: Urgent, High, Medium, Low.",
        "<b>Due by</b> (calendar trigger): Opens the calendar picker (see 5.2).",
    ]
    for f in field_spec:
        story.append(Paragraph(f"\u2022  {f}", ST["bullet"]))

    story.append(Paragraph("<b>Submit behavior:</b>", ST["body"]))
    submit_spec = [
        "Button stays disabled until a team member is selected (not just typed).",
        "On submit: close popover, show a toast at bottom center ('Delegated \"[task]\" to [name]').",
        "Toast fades after 2 seconds, removed from DOM at 2.4s.",
        "Production addition: toast should include an 'Undo' link with a 5-second countdown.",
    ]
    for s in submit_spec:
        story.append(Paragraph(f"\u2022  {s}", ST["bullet"]))

    story.append(Paragraph("<b>Dismiss:</b> Backdrop click, Cancel button, or Escape key.", ST["body"]))

    # 5.2 Calendar
    story.append(Paragraph("5.2  Calendar Picker", ST["h2"]))
    cal_spec = [
        "Opens upward from the 'Due by' button (bottom: calc(100% + 6px)).",
        "Width: 280px. Grid: 7 columns (Su-Sa). Month nav arrows in header.",
        "Day states: .today (bold, blue inset ring 1.5px), .selected (solid blue bg, white text), "
        ".past (50% opacity, hover disabled, not clickable), .other-month (faint, disabled).",
        "Hover on valid days: soft blue bg, blue text.",
        "'Today' link below the grid: selects today's date, closes the calendar.",
        "Clicking a valid future day selects it, updates the trigger text to the formatted date, closes the calendar.",
        "Previous month / next month buttons update the grid without closing.",
    ]
    for c in cal_spec:
        story.append(Paragraph(f"\u2022  {c}", ST["bullet"]))

    # 5.3 Carry-Over
    story.append(Paragraph("5.3  Task Carry-Over", ST["h2"]))
    carry_spec = [
        "On page load, determine which column index matches today's real date.",
        "For each task in columns before today: if done=false, clone it into today's column.",
        "Cloned tasks get: red left border (3px, --accent), 'Carried from [Day]' badge with arrow icon.",
        "Cloned tasks are prepended (inserted at top of today's column body).",
        "Original tasks stay in their original columns (which are visually faded at 45% opacity).",
        "Only applies to 'current' week columns. Next week is untouched.",
        "If today is not in the current week's date range, no carry-over happens.",
    ]
    for c in carry_spec:
        story.append(Paragraph(f"\u2022  {c}", ST["bullet"]))

    # 5.4 Block Reorder
    story.append(Paragraph("5.4  Block Reorder (Drag-and-Drop)", ST["h2"]))
    drag_spec = [
        "Each of the 4 content blocks has a drag handle (6-dot grip icon) that shows on hover.",
        "Pointer down on handle: create a fixed-position clone at the block's current rect, "
        "apply is-dragging class (opacity 0.85, elevated shadow, border-radius 16px).",
        "Pointer move: reposition clone. Calculate drop target by comparing pointer Y to midpoints "
        "of other blocks. Show drop-above or drop-below indicator (3px blue line, pulsing animation).",
        "Pointer up: insert the block before/after the drop target. Remove clone and indicators. "
        "Save new order to localStorage (key: 'overview-block-order') as JSON array of block IDs.",
        "On page load: read saved order from localStorage, reorder DOM nodes to match.",
        "Block IDs: 'health', 'attention', 'schedule', 'workload'.",
    ]
    for d in drag_spec:
        story.append(Paragraph(f"\u2022  {d}", ST["bullet"]))

    # 5.5 Tooltip System
    story.append(Paragraph("5.5  Tooltip System", ST["h2"]))
    tip_spec = [
        "A single .tip-bubble element lives on the body. It repositions on every mouseenter "
        "event on elements with a data-tip attribute.",
        "Show delay: 400ms. Positioned above the target by default, left-aligned to its left edge.",
        "Vertical flip: if there isn't enough room above (topAbove &lt; 8px from viewport), "
        "the tooltip flips to below the target. Applies to header icons (notifications, theme, avatar).",
        "Horizontal overflow: if tooltip would clip the right viewport edge, shift left. Min 8px from edges.",
        "Button-specific tooltips (on .attn-btn): separate child elements with 0.6s delay and a "
        "downward arrow. These are independent from the global system.",
        "Back-to-top tooltip: appears on hover with 0.4s delay, positioned to the left of the button.",
    ]
    for t in tip_spec:
        story.append(Paragraph(f"\u2022  {t}", ST["bullet"]))

    # 5.6 Week Tabs
    story.append(Paragraph("5.6  Week Tab Switching", ST["h2"]))
    week_spec = [
        "Two tabs: 'This week' and 'Next week'. Each shows a date range next to the label.",
        "Active tab: white background, bold text, subtle shadow. Inactive: transparent, muted text.",
        "Tab container: soft gray background, 3px padding, 10px radius (pill-style segmented control).",
        "Clicking 'Next week': adds .show-next to the board, which hides data-week='current' "
        "columns and shows data-week='next' columns via CSS display toggle.",
        "Clicking 'This week': removes .show-next, reverting to current week view.",
        "Today/past/future column states only apply to current week.",
    ]
    for w in week_spec:
        story.append(Paragraph(f"\u2022  {w}", ST["bullet"]))

    # 5.7 Workload Panel
    story.append(Paragraph("5.7  Workload Panel", ST["h2"]))
    wl_spec = [
        "Click any workload card to open the panel.",
        "Panel slides in from right: transform translateX(110%) to translateX(0), "
        "cubic-bezier(0.32, 0.72, 0, 1), 0.35s.",
        "Backdrop: fixed overlay, rgba(0,0,0,0.25), fades in with opacity transition.",
        "Panel structure: header (avatar + name + role + close button), "
        "summary bar (status label + FDE count + block type counts), task list.",
        "Each task in panel: urgency dot (red or gray), title, meta line, block type badge.",
        "Dismiss: close button, backdrop click, or Escape key.",
        "Production addition: needs a focus trap when open.",
    ]
    for w in wl_spec:
        story.append(Paragraph(f"\u2022  {w}", ST["bullet"]))

    story.append(PageBreak())

    # ════════════════════════════════════
    # 6. STATE AND PERSISTENCE
    # ════════════════════════════════════
    story.append(SectionDivider(W))
    story.append(Paragraph("6. State and Persistence", ST["h1"]))

    state_data = [
        [Paragraph("<b>State</b>", ST["th"]),
         Paragraph("<b>Storage</b>", ST["th"]),
         Paragraph("<b>Key</b>", ST["th"]),
         Paragraph("<b>Format</b>", ST["th"])],
        [Paragraph("Theme (light/dark)", ST["td"]),
         Paragraph("localStorage", ST["td"]),
         Paragraph("refined-theme", ST["td_code"]),
         Paragraph("'light' or 'dark'", ST["td"])],
        [Paragraph("Block order", ST["td"]),
         Paragraph("localStorage", ST["td"]),
         Paragraph("overview-block-order", ST["td_code"]),
         Paragraph('JSON array: ["health","attention",...]', ST["td"])],
        [Paragraph("Attention expanded", ST["td"]),
         Paragraph("Session only (DOM)", ST["td"]),
         Paragraph("n/a", ST["td"]),
         Paragraph(".expanded class on .attention-list", ST["td"])],
        [Paragraph("Active week tab", ST["td"]),
         Paragraph("Session only (DOM)", ST["td"]),
         Paragraph("n/a", ST["td"]),
         Paragraph(".show-next class on .week-board", ST["td"])],
        [Paragraph("Workload panel open", ST["td"]),
         Paragraph("Session only (DOM)", ST["td"]),
         Paragraph("n/a", ST["td"]),
         Paragraph(".open class on panel + backdrop", ST["td"])],
        [Paragraph("Delegate popover", ST["td"]),
         Paragraph("Session only (DOM)", ST["td"]),
         Paragraph("n/a", ST["td"]),
         Paragraph("Created/destroyed dynamically", ST["td"])],
    ]
    story.append(make_table(state_data, [W*0.2, W*0.17, W*0.27, W*0.36], ST))
    story.append(Spacer(1, 8))
    story.append(Paragraph(
        "Theme is loaded in a blocking &lt;script&gt; in &lt;head&gt; to prevent flash of wrong theme. "
        "Block order is restored after DOM is ready.",
        ST["body"]
    ))

    # ════════════════════════════════════
    # 7. ACCESSIBILITY
    # ════════════════════════════════════
    story.append(Paragraph("7. Accessibility Checklist", ST["h2"]))
    story.append(Paragraph(
        "What the mockup already does (preserve these):",
        ST["body"]
    ))
    a11y_done = [
        "@media (prefers-reduced-motion: reduce) kills all transitions/animations.",
        "Escape key closes delegate popover and workload panel.",
        "aria-label on all icon-only buttons (notifications, theme, avatar, drag handles, close).",
        "aria-expanded on the attention toggle link.",
        "Semantic elements: &lt;header&gt;, &lt;main&gt;, &lt;nav&gt;, &lt;button&gt;.",
        "Severity uses color + text label (not color alone).",
        "data-tip tooltips on all metrics and icon-only controls.",
    ]
    for a in a11y_done:
        story.append(Paragraph(f"\u2022  {a}", ST["bullet"]))

    story.append(Spacer(1, 6))
    story.append(Paragraph("What you need to add:", ST["h3"]))
    a11y_todo = [
        "Focus trap in delegate popover (tab cycles inside, does not escape to page behind backdrop).",
        "Focus trap in workload panel when open.",
        "Skip-to-content link: &lt;a href='#main' class='sr-only focus:not-sr-only'&gt;Skip to content&lt;/a&gt; before header.",
        "role='checkbox' and aria-checked on .week-task elements (they toggle data-done on click).",
        "Screen reader pass (VoiceOver on Mac, NVDA on Windows) for every interactive flow.",
        "Tab order audit: make sure tab sequence matches visual reading order.",
        "Contrast check on all text/bg combos (WCAG AA: 4.5:1 body, 3:1 large text).",
    ]
    for a in a11y_todo:
        story.append(Paragraph(f"\u2022  {a}", ST["bullet"]))

    story.append(PageBreak())

    # ════════════════════════════════════
    # 8. DEPLOYMENT
    # ════════════════════════════════════
    story.append(SectionDivider(W))
    story.append(Paragraph("8. Deployment (GitHub Pages)", ST["h1"]))
    story.append(Paragraph(
        "The overview page uses the same GitHub Pages deployment as the rest of the repo.",
        ST["body"]
    ))

    story.append(Paragraph("Current pipeline:", ST["h3"]))
    story.append(Preformatted(
        'push to main\n'
        '  -> GitHub Actions (.github/workflows/deploy.yml)\n'
        '  -> npm ci --legacy-peer-deps\n'
        '  -> npm run build (Vite, outputs to dist/)\n'
        '  -> upload dist/ as Pages artifact\n'
        '  -> deploy to GitHub Pages',
        ST["code_block"]
    ))
    story.append(Paragraph(
        "Vite config sets <font face='Courier' size='9'>base: '/kanban-website/'</font>. "
        "Files in <font face='Courier' size='9'>public/</font> are copied to "
        "<font face='Courier' size='9'>dist/</font> as-is during build. "
        "The mockup is already accessible at:",
        ST["body"]
    ))
    story.append(Preformatted(
        'https://nikkortrinidad-cpu.github.io/kanban-website/mockups/00-overview-refined.html',
        ST["code_block"]
    ))
    story.append(Paragraph("Deployment options for production:", ST["h3"]))
    deploy_opts = [
        "<b>Option A (simplest):</b> Keep the page as a standalone HTML file in public/mockups/. "
        "Wire up real data via fetch calls to your API. No framework needed. Deploys automatically.",
        "<b>Option B:</b> Build a separate SPA (React, Vue, Svelte, whatever) with its own build step. "
        "Output to a subfolder in dist/. Update the GitHub Actions workflow to run both builds.",
        "<b>Option C:</b> Integrate into the existing Vite+React app as a new route. "
        "This ties it to the kanban app's tech stack, which may not be what you want.",
    ]
    for o in deploy_opts:
        story.append(Paragraph(f"\u2022  {o}", ST["bullet"]))

    story.append(Spacer(1, 8))
    story.append(Paragraph(
        "Whichever option you pick, the live URL format will be:<br/>"
        "<font face='Courier' size='9'>https://nikkortrinidad-cpu.github.io/kanban-website/[your-path]</font>",
        ST["body"]
    ))

    # ════════════════════════════════════
    # 9. OPEN DECISIONS
    # ════════════════════════════════════
    story.append(Paragraph("9. Open Decisions", ST["h2"]))
    story.append(Paragraph(
        "These items are not decided yet. Flag them early if they block your work.",
        ST["body"]
    ))

    open_data = [
        [Paragraph("<b>Decision</b>", ST["th"]),
         Paragraph("<b>Options</b>", ST["th"]),
         Paragraph("<b>Impact</b>", ST["th"])],
        [Paragraph("Authentication", ST["td"]),
         Paragraph("Firebase Google Auth (same as kanban app), separate auth, or none", ST["td"]),
         Paragraph("Determines if the page is public or gated, and how user identity is resolved for the greeting.", ST["td"])],
        [Paragraph("Data source", ST["td"]),
         Paragraph("Firestore, REST API, static JSON, other", ST["td"]),
         Paragraph("Shapes in section 2 are ready to consume. You pick the transport layer.", ST["td"])],
        [Paragraph("Real-time updates", ST["td"]),
         Paragraph("Polling, WebSocket, Firestore onSnapshot, manual refresh", ST["td"]),
         Paragraph("Affects whether attention items and workload data refresh live or on page load only.", ST["td"])],
        [Paragraph("Navigation structure", ST["td"]),
         Paragraph("Overview is the landing page, or sits behind a separate login/dashboard", ST["td"]),
         Paragraph("Determines if the header nav links (Clients, Board, Analytics) route to real pages or are stubs.", ST["td"])],
        [Paragraph("Framework", ST["td"]),
         Paragraph("Vanilla, React, Vue, Svelte, Astro, other", ST["td"]),
         Paragraph("The mockup is vanilla. Convert to whatever you prefer. Component inventory in section 4 maps 1:1.", ST["td"])],
        [Paragraph("Search (Cmd+K)", ST["td"]),
         Paragraph("Client-side filter, API search, or third-party (Algolia, etc.)", ST["td"]),
         Paragraph("The search bar is visible but not wired up. Decide scope: clients only, tasks, people, or all.", ST["td"])],
    ]
    story.append(make_table(open_data, [W*0.18, W*0.38, W*0.44], ST))

    story.append(Spacer(1, 20))
    story.append(HLine(W, BORDER, 0.5))
    story.append(Spacer(1, 10))
    story.append(Paragraph(
        "End of spec. The mockup file is your visual source of truth. This document is the logic behind it. "
        "If something here contradicts the mockup, the mockup wins.",
        ST["caption"]
    ))

    # Build
    doc.build(story)
    return output_path


if __name__ == "__main__":
    path = build_pdf()
    print(f"PDF created: {path}")
