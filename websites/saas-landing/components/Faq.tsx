import Reveal from "./Reveal";
import { Plus } from "./icons";

const faqs = [
  {
    q: "Do I need engineers to set this up?",
    a: "No. Connecting an integration is OAuth and two clicks, and workflows are described in plain English or built from templates. Most teams ship their first automation without writing code — and if you do want code, there's a full API and webhook layer.",
  },
  {
    q: "What happens when an agent isn't confident?",
    a: "You set a confidence threshold per workflow. Anything below it is paused and routed to a named reviewer in Slack or email, with the full context attached. Nothing ambiguous ever gets written back to your systems silently.",
  },
  {
    q: "Where does my data live?",
    a: "Data is processed in the region you choose (US, EU, or APAC) and encrypted in transit and at rest. We don't train shared models on your data, and Scale plans support VPC peering so traffic never leaves your network boundary.",
  },
  {
    q: "How does pricing scale as we grow?",
    a: "Each plan includes a monthly run allowance, and overage is billed per 1,000 runs rather than as a hard block. If you're trending past your allowance we'll tell you before the invoice does — and usually suggest a cheaper architecture.",
  },
  {
    q: "Can we migrate from Zapier or Make?",
    a: "Yes. Import your existing zaps or scenarios and Nova will map them to native workflows, flagging anything that relied on a non-standard step so you can decide how to handle it.",
  },
  {
    q: "Is there a free trial on paid plans?",
    a: "Every paid plan starts with a 14-day trial, no card required. Annual plans also carry a 30-day money-back guarantee if the numbers don't work out.",
  },
];

export default function Faq() {
  return (
    <section id="faq" className="py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <Reveal>
            <p className="text-xs font-semibold tracking-[0.18em] text-brand-300 uppercase">
              FAQ
            </p>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight text-white text-balance sm:text-5xl">
              Questions we get on the first call
            </h2>
            <p className="mt-5 text-slate-300 text-pretty">
              Still unsure about something?{" "}
              <a
                href="#cta"
                className="font-medium text-brand-300 underline decoration-brand-400/40 underline-offset-4 transition hover:text-brand-200"
              >
                Book a 20-minute technical review
              </a>{" "}
              and we'll answer it with your own stack on screen.
            </p>
          </Reveal>

          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <Reveal key={faq.q} delay={i * 60}>
                <details className="surface group rounded-2xl px-6 py-5 transition open:border-brand-400/30">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-left text-base font-medium text-white [&::-webkit-details-marker]:hidden">
                    {faq.q}
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 text-slate-300 transition group-open:rotate-45 group-open:border-brand-400/40 group-open:text-brand-300">
                      <Plus className="h-4 w-4" />
                    </span>
                  </summary>
                  <p className="mt-4 text-sm leading-relaxed text-slate-400">
                    {faq.a}
                  </p>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
