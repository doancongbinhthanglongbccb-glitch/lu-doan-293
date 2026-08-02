# Admin Page Overrides

> **PROJECT:** Đoàn Công binh Thăng Long  
> **Page:** Admin (`admin.html`) — Quản lý câu hỏi / Người dùng / Lịch sử thi  
> Rules here **override** `MASTER.md` for Admin only.

---

## Design Intent

Data-dense institutional admin. Cam chủ đạo + xanh quân sự phụ. Clean, high-contrast surfaces over unit banner background.

### Color Overrides (align with quiz app tokens)

| Role | Hex | Token |
|------|-----|-------|
| CTA / Brand Orange | `#E85D04` | `--primary` |
| Military Blue | `#1B3A5F` | `--military-blue` |
| Action Blue | `#2563EB` | `--blue-accent` |
| Surface | `#FFFFFF` / `rgba(255,255,255,0.97)` | `--card-bg` |
| Text | `#0F172A` | `--text-main` |
| Muted | `#475569` | `--text-muted` |
| Border | `#CBD5E1` | `--border-color` |
| Success | `#15803D` | `--green-accent` |
| Danger | `#DC2626` | `--red-accent` |

### Typography Overrides

- Heading / UI labels: **Be Vietnam Pro** 600–700
- Body / table: **Noto Sans** 400–500
- Do **not** use Fira Code / playful fonts

---

## Shared Admin Shell

```
Header (brand)
└─ admin-layout
   ├─ admin-section-nav (3 equal tabs)
   └─ admin-section-panel
      └─ admin-panel (surface card)
         ├─ admin-toolbar (title left · actions/search right)
         ├─ admin-hint (optional)
         ├─ admin-stats (stat-card grid)
         ├─ admin-subnav (optional filters)
         └─ admin-panel-body (sidebar+table OR table)
```

### Tab navigation (required identical)

- Equal width tabs (`flex: 1`), min-height 48px
- Inactive: white surface, slate border, military-blue text
- Active: orange fill, white text, orange border
- Hover: orange border (no layout shift)

### Toolbar (required identical)

- Left: `toolbar-title` + `toolbar-desc`
- Right: `toolbar-actions` — search + buttons aligned end
- Search: shared `.admin-search-input` (min-height 44px, radius 8px)
- Buttons: `.btn-toolbar` variants orange / blue / green / outline

### Stats cards

- Grid `repeat(auto-fit, minmax(180px, 1fr))`
- White card, 12px radius, `--shadow-md`, top accent bar orange
- Label muted 12–13px; value military-blue or orange, bold

### Tables

- Wrapped in `.table-wrap` (overflow-x auto)
- Header: military-blue wash, uppercase small, bold
- Rows: hover `#EFF6FF`, borders `#E2E8F0`
- Action buttons: `.btn-sm` edit=blue, delete=red, approve=green

### Spacing / radius / shadow

- Panel padding: 20–24px
- Gap between sections: 16–20px
- Radius: 8px controls, 12px cards
- Shadow: `--shadow-sm` / `--shadow-md` only

---

## Anti-patterns

- ❌ Different tab widths / paddings per section
- ❌ Search in random places
- ❌ Mixed table header styles
- ❌ Emoji-only icons without text label on primary nav (prefer text; SVG optional)
- ❌ Low-contrast gray-on-gray text

---

## Checklist

- [ ] 3 tabs identical style/size/active
- [ ] Toolbar pattern shared across 3 panels
- [ ] Tables share `.admin-table` rules
- [ ] Stats use `.stat-card`
- [ ] Contrast ≥ 4.5:1 on surfaces
- [ ] Responsive: stack toolbar on <768px
