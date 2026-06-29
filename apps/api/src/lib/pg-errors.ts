/** Helpers de SQLSTATE do Postgres. Drizzle embrulha o erro original em `cause`. */

function codeOf(e: unknown): string | undefined {
  return typeof e === 'object' && e !== null ? (e as { code?: string }).code : undefined;
}

function hasCode(err: unknown, code: string): boolean {
  return codeOf(err) === code || codeOf((err as { cause?: unknown }).cause) === code;
}

/** Violação de unique (23505). */
export function isUniqueViolation(err: unknown): boolean {
  return hasCode(err, '23505');
}

/**
 * Violação de foreign key (23503): a linha referenciada não existe.
 * É determinística — retentar nunca resolve, então o handler deve responder 4xx
 * (não 5xx) pra a outbox do client encerrar a mutação em vez de travar a fila.
 */
export function isForeignKeyViolation(err: unknown): boolean {
  return hasCode(err, '23503');
}
