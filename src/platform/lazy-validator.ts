import type { ErrorObject, ValidateFunction } from 'ajv';

/**
 * A module-level `ajv.compile(...)` costs its full compile at import even when the command never
 * validates that shape. This wrapper compiles on the first call, then delegates; the inner errors
 * are copied onto the wrapper so every `validator.errors` read keeps working.
 */
interface AjvCompiler {
  getSchema(id: string): ValidateFunction | undefined;
  compile<T = unknown>(schema: unknown): ValidateFunction<T>;
}

type AnyValidate<T> = ValidateFunction<T>;
type DataCxt = Parameters<AnyValidate<unknown>>[1];

const registry: (() => void)[] = [];

function resolveCompile<T>(ajv: AjvCompiler, schema: unknown): () => AnyValidate<T> {
  return () => {
    const id = (schema as { $id?: unknown } | null | undefined)?.$id;
    const registered = typeof id === 'string' ? ajv.getSchema(id) : undefined;
    return (registered as AnyValidate<T> | undefined) ?? ajv.compile<T>(schema);
  };
}

export function lazyValidator<T = unknown>(compile: () => AnyValidate<T>): AnyValidate<T>;
export function lazyValidator<T = unknown>(ajv: AjvCompiler, schema: unknown): AnyValidate<T>;
export function lazyValidator<T = unknown>(first: AjvCompiler | (() => AnyValidate<T>), schema?: unknown): AnyValidate<T> {
  const compile = typeof first === 'function' ? first : resolveCompile<T>(first, schema);
  let inner: AnyValidate<T> | undefined;
  let failure: { error: unknown } | undefined;
  const resolve = (): AnyValidate<T> => {
    if (failure) throw failure.error;
    if (!inner) {
      try { inner = compile(); }
      catch (error) { failure = { error }; throw error; }
    }
    return inner;
  };
  let validate!: AnyValidate<T>;
  validate = Object.assign(
    (data: unknown, dataCxt?: DataCxt): data is T => {
      const compiled = resolve();
      const ok = dataCxt === undefined ? compiled(data) : compiled(data, dataCxt);
      validate.errors = compiled.errors ?? null;
      return ok;
    },
    { errors: null as ErrorObject[] | null },
  ) as AnyValidate<T>;
  registry.push(() => { resolve(); });
  return validate;
}

/** Compile every registered lazy validator now; a compile error is thrown here and on every later call. */
export function compileAll(): void {
  for (const compile of registry) compile();
}
