import PublicRuleCard from "@/components/public/PublicRuleCard";
import {
  ADVANCE_EMI_POLICY,
  DIRECT_SALE_POLICY,
  GENERIC_POLICIES,
  LEASE_POLICY,
  RENT_POLICY,
} from "@/lib/public-content";

const coreSections = [ADVANCE_EMI_POLICY, RENT_POLICY, LEASE_POLICY, DIRECT_SALE_POLICY] as const;
const commonSections = [
  GENERIC_POLICIES.delivery,
  GENERIC_POLICIES.returnInspection,
  GENERIC_POLICIES.warrantyService,
  GENERIC_POLICIES.paymentAccount,
  GENERIC_POLICIES.kycVerification,
] as const;

export default function PoliciesOperationalSummary() {
  return (
    <section className="grid gap-6">
      <section className="public-surface p-6">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Customer rule summary</div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Core workflow rules</h2>
        <p className="mt-3 max-w-4xl text-sm leading-7 text-muted-foreground sm:text-base">
          These summaries reuse existing public policy content so customers can compare plan paths before contacting the branch.
        </p>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {coreSections.map((section) => (
            <article key={section.title} className="public-card p-5">
              <h3 className="text-lg font-semibold text-foreground">{section.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{section.intro}</p>
              <div className="mt-4 grid gap-3">
                {section.cards.slice(0, 2).map((card) => (
                  <PublicRuleCard key={card.title} title={card.title} points={card.points} />
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="public-surface p-6">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Common rule areas</div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Delivery, service, records, and verification</h2>
        <p className="mt-3 max-w-4xl text-sm leading-7 text-muted-foreground sm:text-base">
          These common areas apply across multiple customer journeys and should be reviewed before branch confirmation.
        </p>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {commonSections.map((card) => (
            <PublicRuleCard key={card.title} title={card.title} points={card.points} />
          ))}
        </div>
      </section>
    </section>
  );
}
