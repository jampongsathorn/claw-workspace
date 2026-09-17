"use client";

import { useState } from "react";
import Reveal from "./Reveal";
import { ArrowRight, Check } from "./icons";

type Plan = {
  name: string;
  tagline: string;
  monthly: number | null;
  annual: number | null;
  cta: string;
  featured?: boolean;
  features: string[];
};

const plans: Plan[] = [
  {
    name: "Starter",
    tagline: "For solo operators testing the water.",
    monthly: 0,
    annual: 0,
    cta: "Start free",
    features: [
      "1,000 workflow runs / month",
      "5 active workflows",
      "25 integrations",
      "Community support",
      "7-day run history",
    ],
  },
  {
    name: "Growth",
    tagline: "For teams automating real revenue ops.",
    monthly: 49,
    annual: 39,
    cta: "Start 14-day trial",
    featured: true,
    features: [
      "50,000 workflow runs / month",
      "Unlimited workflows",
      "300+ integrations",
      "Human-in-the-loop approvals",
      "90-day run history + replay",
      "Priority support, 4h SLA",
    ],
  },
  {
    name: "Scale",
    tagline: "For regulated and high-volume orgs.",
    monthly: null,
    annual: null,
    cta: "Talk to sales",
    features: [
      "Unlimited runs & seats",
      "SSO / SCIM, audit logs",
      "Data residency & VPC peering",
      "Custom models + fine-tuning",
      "Dedicated solutions architect",
      "99.95% uptime SLA",
    ],
  },
];

export default function Pricing() {
  const [annual, setAnnual] = useState(true);

  return (
    <section id="pricing" className="relative py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-brand-600/10 to-transparent"
      />
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold tracking-[0.18em] text-brand-300 uppercase">
            Pricing
          </p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight text-white text-balance sm:text-5xl">
            Priced per workspace, not per headache
          </h2>
          <p className="mt-5 text-lg text-slate-300 text-pretty">
            Start free. Upgrade when the automations start paying for
            themselves — usually inside a week.
          </p>

          <div className="mt-8 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
            {[
              { id: "monthly", label: "Monthly" },
              { id: "annual", label: "Annual · save 20%" },
            ].map((option) => {
              const active = (option.id === "annual") === annual;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setAnnual(option.id === "annual")}
                  aria-pressed={active}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    active
                      ? "bg-white text-ink-950"
                      : "text-slate-300 hover:text-white"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </Reveal>

        <div className="mt-14 grid items-start gap-5 lg:grid-cols-3">
          {plans.map((plan, i) => {
            const price = annual ? plan.annual : plan.monthly;

            return (
              <Reveal key={plan.name} delay={i * 110}>
                <article
                  className={`relative h-full rounded-2xl p-7 transition duration-300 ${
                    plan.featured
                      ? "border border-brand-400/40 bg-gradient-to-b from-brand-500/15 to-white/[0.02] shadow-2xl shadow-brand-600/20 lg:-mt-4 lg:pb-10"
                      : "surface surface-hover"
                  }`}
                >
                  {plan.featured && (
                    <span className="absolute -top-3 left-7 rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-3 py-1 text-[11px] font-semibold tracking-wide text-white uppercase">
                      Most popular
                    </span>
                  )}

                  <h3 className="text-lg font-semibold text-white">
                    {plan.name}
                  </h3>
                  <p className="mt-1.5 text-sm text-slate-400">
                    {plan.tagline}
                  </p>

                  <div className="mt-6 flex items-baseline gap-1.5">
                    {price === null ? (
                      <span className="text-4xl font-semibold text-white">
                        Custom
                      </span>
                    ) : (
                      <>
                        <span className="text-4xl font-semibold tracking-tight text-white">
                          ${price}
                        </span>
                        <span className="text-sm text-slate-400">
                          / user / month
                        </span>
                      </>
                    )}
                  </div>
                  {price !== null && price > 0 && (
                    <p className="mt-1.5 text-xs text-slate-500">
                      {annual
                        ? "Billed annually"
                        : "Billed monthly, cancel anytime"}
                    </p>
                  )}

                  <a
                    href="#cta"
                    className={`group mt-6 flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition ${
                      plan.featured
                        ? "bg-gradient-to-r from-brand-500 to-accent-500 text-white hover:shadow-lg hover:shadow-brand-600/40"
                        : "border border-white/15 bg-white/5 text-white hover:bg-white/10"
                    }`}
                  >
                    {plan.cta}
                    <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
                  </a>

                  <ul className="mt-7 space-y-3">
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2.5 text-sm text-slate-300"
                      >
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </article>
              </Reveal>
            );
          })}
        </div>

        <Reveal className="mt-10 text-center text-sm text-slate-400">
          All paid plans include SOC 2 Type II reporting, unlimited viewers and
          a 30-day money-back guarantee.
        </Reveal>
      </div>
    </section>
  );
}
