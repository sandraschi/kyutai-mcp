import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
      <div className="text-6xl font-semibold text-slate-600">404</div>
      <h1 className="text-xl font-semibold text-slate-200">Page not found</h1>
      <p className="max-w-md text-sm text-slate-400">
        This route is not part of the kyutai-mcp dashboard. Use the sidebar or return home.
      </p>
      <Link
        className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm text-amber-100 hover:bg-amber-400/15"
        to="/"
      >
        Back to Home
      </Link>
    </div>
  );
}
