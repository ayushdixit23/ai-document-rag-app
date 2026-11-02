import { DrizzleQueryError } from 'drizzle-orm';

type ErrorDiagnostic = { name: string; message: string; stack?: string; code?: string | number };

/** Preserve the cause chain without logging SQL, bound parameters, or driver connection details. */
export function errorDiagnostics(error: unknown): ErrorDiagnostic[] {
  const diagnostics: ErrorDiagnostic[] = [];
  const seen = new Set<Error>();
  let current = error;
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    const code: unknown = 'code' in current ? current.code : undefined;
    const isQueryError = current instanceof DrizzleQueryError;
    diagnostics.push({
      name: isQueryError ? 'DrizzleQueryError' : current.name,
      // Drizzle's wrapper message embeds SQL and bound values; use its underlying cause instead.
      message: isQueryError ? 'Database query failed' : current.message,
      ...(!isQueryError && { stack: current.stack }),
      ...((typeof code === 'string' || typeof code === 'number') && { code }),
    });
    current = current.cause;
  }
  return diagnostics;
}
