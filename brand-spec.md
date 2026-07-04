# ClickUp CRM Clone — Brand Spec

Source: Official ClickUp DESIGN.md (light theme)
Extracted from: user-provided token list

## Color Tokens

```css
/* Neutrals */
--bg:      #ffffff;   /* oklch(100% 0 0)          — page canvas */
--surface: #f8f9fa;   /* oklch(97.5% 0.003 250)    — card alt, inset surfaces */
--fg:      #090c1d;   /* oklch(10% 0.03 270)       — midnight ink, headings */
--muted:   #646464;   /* oklch(42% 0.01 270)       — slate, placeholders */
--border:  #e8e8e8;   /* oklch(91% 0.005 270)      — cloud, card borders */

/* Brand / Accent */
--accent:    #7b68ee; /* oklch(58% 0.18 280)       — brand violet */
--accent-hover: #6647f0; /* ultra-violet */
--signal-blue: #0091ff;  /* feature badges, icons */

/* Text hierarchy */
--charcoal: #292d34;   /* secondary text, borders */
--carbon:   #202023;   /* primary filled button */

/* Surfaces */
--linen:    #e9ebf0;   /* alternating section bands */
```

## Font Stacks

```css
--font-display: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
--font-body:    'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
--font-mono:    'Sometype Mono', 'JetBrains Mono', ui-monospace, Menlo, monospace;
--font-label:   'Inter', system-ui, -apple-system, sans-serif;
```

## Border Radius

- Buttons: 9px
- Cards: 12px
- Pills: 54px

## Shadows

```css
--shadow-subtle: 0 1px 3px rgba(0,0,0,0.1), 0 1px 2px -1px rgba(0,0,0,0.1);
--shadow-sm:     0 4px 4px rgba(13,21,48,0.04);
--shadow-card:   0 1px 4px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04);
```

## Posture

- Clean white canvas, light grey surfaces for hierarchy
- Violet accent for CTAs, active states, brand moments
- Signal blue for secondary badges, feature icons, links
- Inter for dense label text (filters, table headers, metadata)
- Sometype Mono for badges, counters, tags
- Flat cards with subtle shadows — no glow, no gradients
- 12px card radius, 9px button radius, 54px pill radius
- Desktop-first responsive layout
