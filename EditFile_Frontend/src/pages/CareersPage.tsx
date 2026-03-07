import InfoPageLayout from '@/components/InfoPageLayout';

export default function CareersPage() {
  return (
    <InfoPageLayout
      title="Careers"
      description="Build practical file tools that users rely on every day."
    >
      <section className="space-y-3">
        <h2 className="font-display font-bold text-2xl text-dark">Why Join</h2>
        <p>
          We work on products that remove friction from document tasks. The team values ownership,
          clear communication, and engineering quality.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display font-bold text-2xl text-dark">What We Value</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>User-first product decisions.</li>
          <li>Reliable systems and measurable performance.</li>
          <li>Simple interfaces for complex workflows.</li>
          <li>Fast iteration with responsible release practices.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-display font-bold text-2xl text-dark">Current Openings</h2>
        <p>No active openings are listed right now.</p>
        <p>
          You can still share your profile at
          {' '}
          <a className="text-violet underline" href="mailto:support@typely.in">
            support@typely.in
          </a>
          {' '}
          and we will reach out when a suitable role opens.
        </p>
      </section>
    </InfoPageLayout>
  );
}
