import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <p className="text-5xl font-semibold text-slate-700">404</p>
      <h1 className="mt-4 text-xl font-semibold text-slate-100">Nothing here</h1>
      <p className="mt-2 text-sm text-slate-400">
        The page you asked for does not exist, or you do not have access to it.
      </p>
      <Link className="btn btn-ghost mt-6" href="/">
        Back to home
      </Link>
    </div>
  );
}
