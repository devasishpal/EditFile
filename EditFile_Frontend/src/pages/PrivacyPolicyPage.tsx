import InfoPageLayout from '@/components/InfoPageLayout';

export default function PrivacyPolicyPage() {
  return (
    <InfoPageLayout
      title="Privacy Policy"
      description="How EditFile collects, uses, stores, and protects personal information."
    >
      <section className="space-y-2">
        <h2 className="font-display font-bold text-2xl text-dark">1. Information We Collect</h2>
        <p>
          We may collect basic account or contact details when you communicate with us, technical logs
          for reliability, and file metadata needed to process tool requests.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display font-bold text-2xl text-dark">2. How We Use Information</h2>
        <p>
          Data is used to deliver file-processing features, improve performance, prevent abuse, and
          provide user support.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display font-bold text-2xl text-dark">3. File Handling</h2>
        <p>
          Uploaded files are processed to produce output files requested by the user. Files are not sold
          to third parties.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display font-bold text-2xl text-dark">4. Retention</h2>
        <p>
          We keep operational logs for security and reliability for limited periods. File retention
          windows may vary based on processing requirements and infrastructure controls.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display font-bold text-2xl text-dark">5. Security</h2>
        <p>
          We implement technical and organizational safeguards to reduce unauthorized access, including
          secure transport and controlled service access.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display font-bold text-2xl text-dark">6. Contact</h2>
        <p>
          Privacy questions can be sent to
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
