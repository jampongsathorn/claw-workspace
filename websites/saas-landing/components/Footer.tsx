import Reveal from "./Reveal";
import { Logo } from "./icons";

const columns = [
  {
    title: "Product",
    links: ["Overview", "Integrations", "Agents", "Changelog", "Security"],
  },
  {
    title: "Solutions",
    links: ["Finance ops", "Revenue ops", "Support", "IT & admin", "Data teams"],
  },
  {
    title: "Resources",
    links: ["Docs", "API reference", "Templates", "Blog", "Status"],
  },
  {
    title: "Company",
    links: ["About", "Careers", "Customers", "Partners", "Contact"],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-white/[0.07] bg-ink-950 pt-16 pb-10">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <Reveal className="grid gap-12 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)]">
          <div>
            <a href="#top" className="flex items-center gap-2.5">
              <Logo />
              <span className="text-lg font-semibold tracking-tight text-white">
                Nova
              </span>
            </a>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-400">
              The AI workflow platform for teams who'd rather build the
              business than babysit the process.
            </p>

            <form className="mt-6 flex max-w-xs gap-2">
              <label htmlFor="footer-email" className="sr-only">
                Email
              </label>
              <input
                id="footer-email"
                type="email"
                placeholder="Newsletter"
                className="w-full rounded-full border border-white/12 bg-white/[0.03] px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-brand-400/50 focus:outline-none"
              />
              <button
                type="submit"
                className="shrink-0 rounded-full border border-white/12 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Join
              </button>
            </form>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {columns.map((column) => (
              <div key={column.title}>
                <h3 className="text-sm font-semibold text-white">
                  {column.title}
                </h3>
                <ul className="mt-4 space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link}>
                      <a
                        href="#top"
                        className="text-sm text-slate-400 transition hover:text-white"
                      >
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Reveal>

        <div className="mt-14 flex flex-col items-center justify-between gap-5 border-t border-white/[0.07] pt-8 sm:flex-row">
          <p className="text-sm text-slate-500">
            © {new Date().getFullYear()} Nova Labs. All rights reserved.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-500">
            {["Privacy", "Terms", "DPA", "SOC 2"].map((item) => (
              <a
                key={item}
                href="#top"
                className="transition hover:text-slate-300"
              >
                {item}
              </a>
            ))}
            <span className="inline-flex items-center gap-2 text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              All systems operational
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
