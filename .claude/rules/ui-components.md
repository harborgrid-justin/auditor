---
paths:
  - "src/components/**"
  - "src/app/**/page.tsx"
  - "src/app/**/layout.tsx"
---

# UI Component Rules

- Primitive components in `src/components/ui/` follow shadcn/ui conventions: use `cn()`, CVA for variants
- Use Tailwind CSS classes exclusively -- no CSS modules or styled-components
- Layout components in `src/components/layout/` handle navigation chrome
- All interactive components must be accessible (aria labels, keyboard navigation, focus management)
- State management: use Zustand stores for global state, not React context
- Forms: controlled components with Zod validation
- Financial data display: always format with locale-appropriate number formatting; never show raw floats
