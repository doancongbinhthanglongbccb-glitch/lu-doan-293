# Quiz Page Overrides

> **PROJECT:** Đoàn Công binh Thăng Long  
> **Page:** Làm bài trắc nghiệm (`#screenQuiz`)  
> Rules here **override** `MASTER.md`.

---

## Layout Overrides

- **Max Width:** 1100px for quiz workspace
- **Structure:** Sidebar (question nav) + Main (question + action bar)
- **Mobile (<768px):** Stack — question first, compact nav strip, sticky action bar

### Spacing Overrides

- Question card padding: `20px` mobile / `28px` desktop
- Option gap: `10px`
- Action bar: sticky bottom on mobile with safe-area padding

### Color Overrides (Quiz states)

| State | Color | Class |
|-------|-------|-------|
| Unanswered | White + slate border | `.grid-item` |
| Current | Orange `#E85D04` | `.grid-item.current` |
| Answered | Green `#15803D` | `.grid-item.done` |
| Flagged | Sky `#0284C7` | `.grid-item.doubt` |
| Current + Answered | Green fill + orange ring | `.grid-item.current.done` |

### Typography Overrides

- Exam title: Be Vietnam Pro 600, military blue
- Question stem: Noto Sans 500, 17–18px, high contrast `#0F172A`
- Options: Noto Sans 400, 16px+

---

## Page-Specific Components

### 1. Question navigator
- Grid of numbered cells, min 40×40 (44×44 on mobile)
- Legend under title: Chưa làm / Đang làm / Đã trả lời / Nghi ngờ
- Color is not the only indicator — legend labels + aria-labels

### 2. Custom radio / checkbox options
- Full-row hit target ≥ 48px
- Custom circle/square indicator (22px)
- Selected: blue border + light blue wash + filled inner
- Letter badge slightly emphasized

### 3. Unified action bar
- Single bar: Prev | Flag (exam) / Check (review) | Next + Submit
- Primary CTA (Nộp đáp án / Nộp bài) uses orange or military blue — never buried inside card alone
- Secondary nav uses outline style

### 4. Contrast shell
- Stronger white overlay on banner background for quiz screen
- Cards: `rgba(255,255,255,0.97)` + border + shadow
- Footer text: `#334155` on semi-opaque bar

---

## Recommendations

- Micro-interactions: option select 150ms border/bg only
- Touch: 8px+ gap between grid items
- Focus-visible rings on options and grid items
- Keep existing JS state machine; improve markup/classes only
