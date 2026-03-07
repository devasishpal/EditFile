import InfoPageLayout from '@/components/InfoPageLayout';

const posts = [
  {
    title: 'How To Reduce PDF Size Without Losing Readability',
    date: 'March 3, 2026',
    summary:
      'A practical guide to compression settings, image quality tradeoffs, and when to optimize before sharing.',
  },
  {
    title: 'PDF To JPG: Choosing The Right Output Quality',
    date: 'February 18, 2026',
    summary:
      'Understand DPI, export strategy, and file size balance when converting PDF pages into image format.',
  },
  {
    title: 'Best Practices For Secure Document Sharing',
    date: 'January 29, 2026',
    summary:
      'Use password protection, redaction workflows, and retention controls to lower document exposure risk.',
  },
];

export default function BlogPage() {
  return (
    <InfoPageLayout
      title="Blog"
      description="Product updates, tutorials, and practical document workflow tips."
    >
      <section className="space-y-3">
        <h2 className="font-display font-bold text-2xl text-dark">Latest Articles</h2>
        <p>
          This section shares guides for PDF and image editing, release notes, and file-processing best
          practices for teams and individual users.
        </p>
      </section>

      <section className="space-y-4">
        {posts.map((post) => (
          <article key={post.title} className="rounded-xl border-2 border-gray-200 p-4">
            <p className="text-sm text-gray">{post.date}</p>
            <h3 className="font-display font-bold text-xl text-dark mt-1">{post.title}</h3>
            <p className="mt-2 text-gray">{post.summary}</p>
          </article>
        ))}
      </section>
    </InfoPageLayout>
  );
}
