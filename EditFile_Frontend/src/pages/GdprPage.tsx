import InfoPageLayout from '@/components/InfoPageLayout';

export default function GdprPage() {
  return (
    <InfoPageLayout
      title="GDPR"
      description="Information about GDPR-related data rights and support."
    >
      <section className="space-y-2">
        <h2 className="font-display font-bold text-2xl text-dark">1. Data Rights</h2>
        <p>
          Users in the European Economic Area can request access, correction, deletion, restriction, or
          portability of personal data where applicable.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display font-bold text-2xl text-dark">2. Legal Basis</h2>
        <p>
          Processing may rely on contractual necessity, legitimate interests, legal obligations, or user
          consent depending on the context.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display font-bold text-2xl text-dark">3. Requests</h2>
        <p>
          To submit a GDPR request, email
          {' '}
          <a className="text-violet underline" href="mailto:support@typely.in">
            support@typely.in
          </a>
          {' '}
          with your identity and request details.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display font-bold text-2xl text-dark">4. Response Timeline</h2>
        <p>
          We review valid requests and respond within the timeframes required under applicable law.
        </p>
      </section>
    </InfoPageLayout>
  );
}
