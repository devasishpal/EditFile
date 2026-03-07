import InfoPageLayout from '@/components/InfoPageLayout';

export default function ContactPage() {
  return (
    <InfoPageLayout
      title="Contact"
      description="Reach support for help with tools, account issues, or general questions."
    >
      <section className="space-y-3">
        <h2 className="font-display font-bold text-2xl text-dark">Support</h2>
        <p>
          For product support, conversion issues, or bug reports, email us at
          {' '}
          <a className="text-violet underline" href="mailto:support@typely.in">
            support@typely.in
          </a>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display font-bold text-2xl text-dark">Business Inquiries</h2>
        <p>
          For partnerships, integrations, or enterprise discussions, share your details over email and
          include your use case, expected volume, and timeline.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display font-bold text-2xl text-dark">Response Time</h2>
        <p>
          We usually respond within 1-2 business days. For urgent technical issues, mention
          {' '}
          <span className="font-semibold">URGENT</span>
          {' '}
          in the subject line.
        </p>
      </section>
    </InfoPageLayout>
  );
}
