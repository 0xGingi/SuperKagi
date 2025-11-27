declare module "bun:sqlite" {
  export interface DatabaseOptions {
    readonly?: boolean;
    create?: boolean;
    readwrite?: boolean;
    safeIntegers?: boolean;
    strict?: boolean;
  }

  export class Database {
    constructor(filename?: string, options?: number | DatabaseOptions);
    prepare<T = unknown, Params = unknown>(sql: string): Statement<T, Params>;
    query<T = unknown, Params = unknown>(sql: string): Statement<T, Params>;
    run(
      sql: string,
      params?: SQLQueryBindings,
    ): { lastInsertRowid: number; changes: number };
    exec(sql: string): void;
    transaction<T extends (...args: any[]) => any>(
      fn: T,
    ): T & {
      deferred: T;
      immediate: T;
      exclusive: T;
    };
    close(throwOnError?: boolean): void;
  }

  export type SQLQueryBindings =
    | string
    | bigint
    | number
    | boolean
    | null
    | Uint8Array
    | Record<string, string | bigint | number | boolean | null | Uint8Array>;

  export class Statement<T = unknown, Params = unknown> {
    all(params?: Params): T[];
    get(params?: Params): T | undefined;
    run(params?: Params): { lastInsertRowid: number; changes: number };
    values(params?: Params): unknown[][];
    finalize(): void;
    toString(): string;
    columnNames: string[];
    columnTypes: string[];
    declaredTypes: (string | null)[];
    paramsCount: number;
    native: any;
    as<C>(Class: new () => C): Statement<C, Params>;
    [Symbol.iterator](): IterableIterator<T>;
    iterate(params?: Params): IterableIterator<T>;
  }
}
