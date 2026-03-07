import InfoPageLayout from '@/components/InfoPageLayout';

export default function CookiePolicyPage() {
  return (
    <InfoPageLayout
      title="Cookie Policy"
      description="How cookies and similar technologies are used on EditFile."
    >
      <section className="space-y-2">
        <h2 className="font-display font-bold text-2xl text-dark">1. What Are Cookies</h2>
        <p>
          Cookies are small text files stored by your browser to remember preferences and support site
          functionality.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display font-bold text-2xl text-dark">2. Why We Use Them</h2>
        <p>
          Cookies help with session continuity, usage analytics, security controls, and improving
          product performance.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display font-bold text-2xl text-dark">3. Cookie Categories</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Essential cookies for core functionality.</li>
          <li>Performance cookies to measure and optimize usage.</li>
          <li>Preference cookies to store UI choices.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-display font-bold text-2xl text-dark">4. Managing Cookies</h2>
        <p>
          You can control or disable cookies in your browser settings. Some features may not function
          properly if essential cookies are blocked.
        </p>
      </section>
    </InfoPageLayout>
  );
}
