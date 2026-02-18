const HEADLINE_TEXT = 'LumenFlow Web Surface';
const BODY_TEXT =
  'This app hosts API routes that bridge Next.js handlers to the kernel HTTP surface runtime.';

export default function HomePage() {
  return (
    <main>
      <h1 className="text-4xl font-bold tracking-tight">{HEADLINE_TEXT}</h1>
      <p className="mt-4 max-w-prose text-lg text-slate-700">{BODY_TEXT}</p>
    </main>
  );
}
