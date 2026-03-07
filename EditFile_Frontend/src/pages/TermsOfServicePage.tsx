import InfoPageLayout from '@/components/InfoPageLayout';

export default function TermsOfServicePage() {
  return (
    <InfoPageLayout
      title="Terms of Service"
      description="Rules and conditions for using EditFile services."
    >
      <section className="space-y-2">
        <h2 className="font-display font-bold text-2xl text-dark">1. Acceptance of Terms</h2>
        <p>
          By using EditFile, you agree to these terms and all applicable laws. If you do not agree,
          please do not use the service.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display font-bold text-2xl text-dark">2. Permitted Use</h2>
        <p>
          You may use the service for lawful document and image processing. You must not upload illegal
          content, malicious files, or content you do not have rights to process.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display font-bold text-2xl text-dark">3. Service Availability</h2>
        <p>
          We work to keep the platform available, but uptime is not guaranteed. Features may change as
          we improve reliability and security.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display font-bold text-2xl text-dark">4. Intellectual Property</h2>
        <p>
          The EditFile brand, software, and platform content are protected by applicable intellectual
          property laws. Your uploaded files remain yours.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display font-bold text-2xl text-dark">5. Limitation of Liability</h2>
        <p>
          Services are provided on an as-is basis. To the extent allowed by law, EditFile is not liable
          for indirect, incidental, or consequential damages.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display font-bold text-2xl text-dark">6. Contact</h2>
        <p>
          For terms questions, contact
          {' '}
          <a className="text-violet underline" href="mailto:support@typely.in">
            support@typely.in
          </a>
          .
        </p>
      </section>
    </InfoPageLayout>
  );
}
