/**
 * A Supabase client stand-in for tests.
 *
 * Pages in this codebase query through long chains —
 *
 *   supabase.from("suppliers").select("…").eq("id", x).in("status", […]).order("…")
 *
 * — and then await the result. Every builder method returns the builder, and the
 * builder itself is awaitable. That is the whole contract a page depends on, so
 * that is all this reproduces: a chainable, thenable object that answers with
 * whatever rows the test declared for that table.
 *
 * Filters are deliberately NOT evaluated. A mock that half-implements `.eq()`
 * invites tests that pass because the mock's filtering agrees with the page's
 * intent, which proves nothing about Postgres. Instead the calls are RECORDED,
 * so a test can assert the page asked the right question — which is exactly the
 * bug shape behind the cross-tenant leaks: the page asked an unscoped one.
 */

export type TableRows = Record<string, unknown[]>;

export type RecordedCall = {
  table: string;
  method: string;
  args: unknown[];
};

export type SupabaseMock = {
  from: (table: string) => any;
  /** Every builder call made, in order. */
  calls: RecordedCall[];
  /** Filter calls made against one table, for asserting scope. */
  callsFor: (table: string) => RecordedCall[];
  /** True when the table was queried with `.eq(column, …)` at least once. */
  filtered: (table: string, column: string) => boolean;
};

const CHAINABLE = [
  "select", "eq", "neq", "in", "is", "not", "gt", "gte", "lt", "lte",
  "like", "ilike", "or", "filter", "order", "limit", "range", "match",
  "insert", "update", "upsert", "delete", "returns",
];

/**
 * `rows` maps table name to the rows that table should answer with. A table not
 * listed answers with an empty array, which is what an untouched tenant looks
 * like and is the state most page bugs hide in.
 */
export function createSupabaseMock(rows: TableRows = {}): SupabaseMock {
  const calls: RecordedCall[] = [];

  function builder(table: string) {
    const data = rows[table] ?? [];

    const result = {
      data,
      error: null as null | { message: string; code?: string },
      count: data.length,
      status: 200,
    };

    const chain: Record<string, unknown> = {
      // Awaiting the chain resolves to the table's rows.
      then: (onFulfilled: (v: typeof result) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(onFulfilled, onRejected),

      // Terminal single-row forms. `.maybeSingle()` answering null on an empty
      // table is the case that produced "your account is not linked to an
      // importing organization" during today's browser session.
      maybeSingle: () => {
        calls.push({ table, method: "maybeSingle", args: [] });
        return Promise.resolve({ ...result, data: data[0] ?? null, count: null });
      },
      single: () => {
        calls.push({ table, method: "single", args: [] });
        return Promise.resolve(
          data.length > 0
            ? { ...result, data: data[0], count: null }
            : { data: null, error: { message: "No rows found", code: "PGRST116" }, count: null, status: 406 }
        );
      },
    };

    for (const method of CHAINABLE) {
      chain[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        return chain;
      };
    }

    return chain;
  }

  return {
    from: (table: string) => {
      calls.push({ table, method: "from", args: [] });
      return builder(table);
    },
    calls,
    callsFor: (table: string) => calls.filter((c) => c.table === table),
    filtered: (table: string, column: string) =>
      calls.some(
        (c) =>
          c.table === table &&
          (c.method === "eq" || c.method === "in") &&
          c.args[0] === column
      ),
  };
}
