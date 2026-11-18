import type { ErrorObject, ValidateFunction } from 'ajv';

/**
 * `lazyValidator` mirrors a module-level `ajv.compile(...)`: by default it compiles at creation, so
 * a bad schema still throws during module evaluation. Read-view entry scripts switch lazy mode on
 * before importing anything else; from then on validators compile on their first call instead, and
 * `compileAll()` restores the fail-before-use check where a command needs it.
 */
interface AjvCompiler {
  getSchema(id: string): ValidateFunction | undefined;
  compile<T = unknown>(schema: unknown): ValidateFunction<T>;
}

type AnyValidate<T> = ValidateFunction<T>;
type DataCxt = Parameters<AnyValidate<unknown>>[1];

let lazyMode = false;

/** Compile-on-first-call for every validator created after this point; off by default. */
export function enableLazyValidators(): void {
  lazyMode = true;
}

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
  // Eager unless lazy mode is on: exactly a bare `ajv.compile()`, so a bad schema throws here.
  if (!lazyMode) inner = compile();
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

/** Compile every registered validator now; a compile error is thrown here and on every later call. */
export function compileAll(): void {
  for (const compile of registry) compile();
}
