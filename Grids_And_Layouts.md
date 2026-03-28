# Grids & Layout Skill

A practical design reference distilled from the *Grids & Layout Guidebook* by Viktor Baltus (Type Design Class, 2021). Use this when designing or reviewing layouts for web, print, or digital products.

---

## 1. Typography Fundamentals

### Typeface vs Font
- A **typeface** is a font family (e.g., PT Serif)
- A **font** is a single weight within that family (e.g., PT Serif Bold)
- Fonts within a typeface are called **weights**

### Serif vs Sans Serif
- **Serif fonts** have decorative strokes at the ends of letter stems — they help the eye connect letters, making them ideal for long-form reading (books, articles)
- **Sans serif fonts** lack these strokes — they have a more modern look and are often used at larger sizes (headings, UI elements)

### Display Fonts
- Designed for headlines, titles, posters, and logotypes at large sizes
- Not intended for long body text paragraphs
- Can be serif, slab serif, script, sans serif, etc.

### Font Sizes
- The traditional typographic scale: 6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 21, 24, 36, 48, 60, 72pt
- 72 points = 1 inch; dividing 72 into six gives the base sizes: 12, 24, 36, 48, 60, 72
- The intermediate sizes (6-11, 14, 16, 18, 21) were added for finer control in lead typesetting
- You can create your own scaling system as long as increments are consistent

### Font Size Misconceptions
- "12pt is the best font size" is not universally true
- Different fonts at the same point size can appear very different due to varying ascender heights, x-heights, and descender heights
- Always evaluate visually, not just by the number

---

## 2. Building the Page — Grid Anatomy

### Columns
- A grid contains one or multiple **columns** (vertical spaces for text/images)
- Literature typically uses a single column; newspapers can use up to six

### Alleys
- The space **between columns** is called the **alley** (also called "column gutter" in Adobe InDesign)
- Not to be confused with the gutter in book binding

### Margins and Gutters
- **Book layouts:** the inside space (near the spine) is the **gutter**; the outside space is the **margin**
- **Single page / digital layouts:** all outside spaces are called **margins**

### Rows
- Horizontal divisions in your layout
- Useful for aligning images, creating columns of different heights, or breaking up repeating elements across pages

### Baseline Grid
- Horizontal rulers along the base of each line of text
- Ensures text aligns across columns with different heights or font sizes
- Essential for professional-looking multi-column layouts

### Line Length & Column Width
- **Line length** = number of characters or words per line
- **Column width** = measured in physical units (mm, pt, px)
- They are closely related but measured differently

---

## 3. Creating Your Grid

### Step 1: Know Your Audience
- Your goal and audience dictate the design
- Study similar layouts before starting: What fonts? What colors? What draws the eye first? What's most important?
- An ad activates emotion; a newspaper article informs — the layout should match the purpose

### Step 2: Determine Column Width
- Choose your body font first — different fonts stretch differently at the same size
- Optimal line length: **45-70 characters per line** (including spaces), or **10-13 words per line**
- Too wide = hard to track sentences; too narrow = tiring, constant line-breaking
- Count characters/words per line before finalizing column width

### Step 3: Create Balanced Alleys
- **Trick:** type "MM" in your chosen font and use that width for your alley
- Alternative: use the same value as your leading (line spacing)
- This creates an alley width that feels natural to the font

### Step 4: Set Line Spacing (Leading)
- **+2/+3 method:** add 2-3pt to your font size (e.g., 11pt font = 13-14pt leading)
- **Percentage method:** keep line spacing at 120-145% of font size
  - Formula: `120 x 0.XX` where XX is font size (e.g., `120 x 0.11 = 13.2pt`)
- Titles, headers, and subheaders need **less** leading than body text

### Step 5: Set Up Baseline Grid
- All text should align to the baseline grid across columns
- When using multiple font sizes, leading must be incremental with the baseline grid
- Example: 13pt baseline grid = use 13, 26, or 39pt leading for different elements

### Step 6: Add Rows
- Add rows for images or columns of different heights
- Align row bottoms to the baseline grid and row tops to the x-height (or descender height) of your font
- Skip one or multiple baselines between rows

---

## 4. Professional Compositions

### Golden Ratio (1:1.61)
- Based on proportions found in nature
- **4 steps to create a Golden Rectangle:**
  1. Draw a square
  2. Draw a diagonal from the bottom center to the top right corner
  3. Rotate the line on the bottom corner until it aligns horizontally with the square
  4. Use the end of the line as a guide for the long side of your rectangle
- Golden Rectangles can be nested infinitely, creating the **Golden Spiral**

### Fibonacci Sequence
- Each number is the sum of the previous two: 1, 1, 2, 3, 5, 8, 13, 21...
- Related to the Golden Ratio
- Can be used as a scaling system for design elements
- Drawing circles within Fibonacci squares creates another controlled scaling method

### Rabatment Composition
- Overlapping squares within a horizontal or vertical rectangle
- Works regardless of dimensions (unlike Golden Ratio which needs 1:1.61)
- **Secondary Rabatment:** the rectangle created by overlapping two Rabatment squares
- Can be subdivided further with diagonal lines to create focus points
- Useful for aligning columns and images for a structured look

### Rule of Thirds
- Based on human optical vision (~170 degrees field of view)
- Divide the layout into a 3x3 grid (9 equal spaces)
- The **lines** and **intersections** are where the eye naturally looks
- Align key elements to these lines or cross-sections
- Familiar from phone camera viewfinders

### Gestalt Theory (Psychological Composition)

Six principles that describe how humans perceive visual elements:

1. **Simplicity** — forms are easiest perceived in their simplest form; grouped letters form words, separated letters become individual shapes
2. **Figure/Ground** — the "figure" (focus object) stands out against the "ground" (background); convex elements read as figures, concave as ground
3. **Proximity & Similarity** — elements close together or sharing shape, color, direction, or size are perceived as a group
4. **Symmetry** — symmetrical elements are perceived as part of the same group; mirrored spreads, equal-importance elements
5. **Continuity** — aligned elements are perceived as related; even with missing parts, the eye completes the pattern
6. **Connectedness** — lines, dots, arrows, and shapes connecting elements create perceived relationships (infographics, flowcharts, timelines)

---

## 5. Artboard Sizes

### A-Series (ISO 216 International Standard)
- Aspect ratio: 1:1.4142 (square root of 2)
- A0 = 1 square meter; each smaller size is half the previous
- Two pages side by side maintain the same aspect ratio
- Sizes: A0, A1, A2, A3, **A4** (standard printer paper), A5, A6, A7, A8, A9, A10

### B-Series
- B0 longest side = 1 meter; each smaller size is half the previous
- B1 = standard poster format (50x70cm)
- B5 = often used for books

### C-Series
- Designed for **envelopes**
- An unfolded A4 fits in C4; A4 folded to A5 fits in C5; folded again to A6 fits in C6

### US-Series
- Standard formats: Letter, Legal, Executive, Ledger/Tabloid
- Two alternating aspect ratios: 17/11 = 1.545 and 22/17 = 1.294
- Cannot scale to next size without empty margins (unlike A-series)
- Only used in US, Canada, and parts of Mexico — 95% of the world uses ISO sizes
- Consider ISO sizes for international designs

---

## 6. Practical Tips

### Margins & White Space
- Never place columns at the edge of the artboard
- **Thumb rule:** margins should be wider than a thumb to avoid obscuring text when held
- **Gutenberg method:** draw a diagonal from inside top corner to outside bottom corner, align columns along it

### Modular Grids
- A grid with multiple columns and rows enables a wide variety of layouts
- Overlap text fields across multiple columns/rows to change the look while maintaining structure
- Best for designs with many elements (text, graphs, images)
- Always pair with a baseline grid to anchor all elements together

### Drop Caps
Five rules for drop caps:
1. Set the first word/phrase in small caps for a smooth transition
2. The initial cap can be a different font
3. Align the top of the initial with the top of the small caps; the bottom should sit on the baseline of the 2nd or 3rd indent
4. Use a **fitted cap** (text flows around the letter) for single-syllable English words
5. Wide or script initial caps can be placed **outside** the column

### Text Alignment (Range)
- **Flush left (ragged right):** most natural for Western languages; words wrap naturally
- **Flush right (ragged left):** unnatural for long Western text; better for RTL languages (Persian, Arabic, Hebrew)
- **Justified:** creates clean text blocks; easiest to read; used in most newspapers and books
  - Requires 10-13 words per line and hyphenation turned on to avoid word gaps
  - **Full justification** = even the last line is justified
- **Centered:** creates symmetrical shapes; use **only for very short headlines**
  - Double ragged edges make longer text difficult to read
  - Remove trailing spaces at line breaks to avoid off-center alignment

### Indents & Outdents
Five rules for professional paragraphs:
1. **Don't indent the first paragraph** — industry best practice
2. **Avoid orphans and widows** — stray lines at the top or bottom of a page/column separated from their paragraph
3. **Don't use standard indent widths** — create your own relative to column width (try the width of two uppercase M's)
4. **Use outdents (hanging indents)** for bibliographies, glossaries, or tables of contents to make scanning easier
5. **Don't add extra leading** between paragraphs that already have an indent — use one or the other, not both

---

## Quick Reference Checklist

When starting a new layout:

- [ ] Define the purpose and audience
- [ ] Choose body font and test at target size
- [ ] Set column width to 45-70 characters per line
- [ ] Set alleys to "MM" width or equal to leading
- [ ] Set leading to font size + 2-3pt (or 120-145%)
- [ ] Establish baseline grid
- [ ] Add rows for images if needed
- [ ] Set margins (Gutenberg method or thumb rule)
- [ ] Choose a composition method (Golden Ratio, Rule of Thirds, Rabatment)
- [ ] Apply Gestalt principles (proximity, similarity, continuity)
- [ ] Select artboard size appropriate for the medium
- [ ] Set text alignment (justified for long text, flush left for general use)
