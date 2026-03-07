import InfoPageLayout from '@/components/InfoPageLayout';

export default function AboutPage() {
  return (
    <InfoPageLayout
      title="About EditFile"
      description="Learn what EditFile does, how we handle your data, and why we built this platform."
    >
      <section className="space-y-3">
        <h2 className="font-display font-bold text-2xl text-dark">Who We Are</h2>
        <p>
          EditFile is a browser-based platform for PDF and image processing. We built it to give users
          a fast way to merge, split, convert, optimize, and secure files without installing desktop
          software.
        </p>
        <p>
          Our focus is simple: practical tools, clean experience, and reliable results for day-to-day
          document work.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display font-bold text-2xl text-dark">What You Can Do</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Compress, merge, split, and reorganize PDF files.</li>
          <li>Convert between common formats such as PDF, JPG, PNG, and Word.</li>
          <li>Add watermarks, page numbers, and password protection.</li>
          <li>Use image tools like resize, crop, rotate, and background removal.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-display font-bold text-2xl text-dark">How We Work</h2>
        <p>
          We prioritize speed and usability. Most tasks are designed to be completed in three steps:
          upload, configure, and download.
        </p>
        <p>
          We also design the product to work well on desktop and mobile so users can process files from
          any modern browser.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display font-bold text-2xl text-dark">Security and Privacy</h2>
        <p>
          We treat file privacy as a core requirement. File handling follows controlled processing and
          retention rules described in our Privacy Policy.
        </p>
        <p>
          We do not sell user files or file contents. For complete details, review the Privacy Policy,
          Terms of Service, and GDPR pages.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display font-bold text-2xl text-dark">Contact</h2>
        <p>
          Questions, feedback, or partnership requests can be sent to
          {' '}
          <a className="text-violet underline" href="mailto:support@typely.in">
            support@typely.in
          </a>
          .
        </p>
        <p>We aim to respond as quickly as possible on business days.</p>
      </section>
    </InfoPageLayout>
  );
}
