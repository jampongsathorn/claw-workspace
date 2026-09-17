# Nova — SaaS / AI product landing page

Modern dark-mode marketing site built with **Next.js 16 (App Router) + React 19 + Tailwind CSS v4**.
Placeholder brand is "Nova" — swap the name/copy once the reference design is confirmed.

## Structure

The page is composed from one component per section, in `app/page.tsx`:

| # | Component | Section |
|---|-----------|---------|
| 1 | `Navbar` | Sticky blurred nav, mobile drawer |
| 2 | `Hero` | Badge, headline, dual CTA, trust row, dashboard mockup |
| 3 | `LogoCloud` | Infinite marquee of customer wordmarks |
| 4 | `Stats` | 4-up metric band |
| 5 | `HowItWorks` | 3-step timeline + rollout progress panel |
| 6 | `Features` | 6-card bento grid |
| 7 | `Testimonials` | 3 quote cards with ratings |
| 8 | `Pricing` | 3 tiers, monthly/annual toggle |
| 9 | `Faq` | 6-item accordion (`<details>`, no JS) |
| 10 | `Cta` | Email capture + closing pitch |
| 11 | `Footer` | 4 link columns, newsletter, status |

Reordering sections = reordering lines in `app/page.tsx`.

## Run

```bash
npm install
npm run dev      # http://0.0.0.0:3000
npm run build && npm start
```

## Notes

- `allowedDevOrigins` in `next.config.ts` whitelists sandbox preview hosts (`*.e2b.app`).
- Animations are CSS-only plus a tiny `Reveal` IntersectionObserver wrapper — no animation deps.
- Design tokens (colours, keyframes) live in the `@theme` block of `app/globals.css`.
- `prefers-reduced-motion` is respected; nav, pricing toggle and FAQ work without JS hydration issues.
