import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[720px] flex-col justify-center gap-4 p-4">
      <h1 className="m-0 text-2xl font-bold">Page not found</h1>
      <Link href="/" className="text-accent">
        Back to the start
      </Link>
    </main>
  );
}
