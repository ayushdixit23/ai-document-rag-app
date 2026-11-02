import type postgres from 'postgres';

/** Drizzle calls unsafe(), whose driver default disables protocol statement caching. */
export const enablePreparedQueries = (client: Pick<postgres.Sql, 'unsafe'>): void => {
  const unsafe = client.unsafe;
  client.unsafe = <T extends unknown[] = postgres.Row[]>(
    query: string,
    parameters?: Parameters<postgres.Sql['unsafe']>[1],
    options?: postgres.UnsafeQueryOptions,
  ) => unsafe<T>(query, parameters, { prepare: true, ...options });
};
