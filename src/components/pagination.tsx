import Link from "next/link";

export function Pagination({
  page,
  pages,
  total,
  extra,
}: {
  page: number;
  pages: number;
  total: number;
  extra?: Record<string, string | undefined>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value) params.set(key, value);
  }
  const href = (next: number) => {
    const copy = new URLSearchParams(params);
    copy.set("page", String(next));
    return `?${copy.toString()}`;
  };
  return (
    <p className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
      <span>
        Page {page} of {pages} · {total} records
      </span>
      {page > 1 ? (
        <Link className="text-primary" href={href(page - 1)}>
          Previous
        </Link>
      ) : null}
      {page < pages ? (
        <Link className="text-primary" href={href(page + 1)}>
          Next
        </Link>
      ) : null}
    </p>
  );
}
