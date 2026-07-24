import { useCallback, useMemo, useState } from "react";
import type { z } from "zod";

/**
 * Minimal form state + zod validation (#9). Pairs with the `error` prop on the
 * `Field` component. Validates on blur and on submit; surfaces one message per
 * field. Uses the `zod` schemas the app already relies on.
 *
 *   const form = useZodForm(ticketSchema, { title: "", body: "" });
 *   <Field label="Title" value={form.values.title}
 *          onChangeText={form.setField("title")}
 *          onBlur={form.blur("title")} error={form.errors.title} />
 *   <Button title="Submit" onPress={() => form.submit(onValid)} />
 */
export function useZodForm<S extends z.ZodType>(
  schema: S,
  initial: z.input<S>,
) {
  type Values = z.input<S>;
  type Keys = Extract<keyof Values, string>;

  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Partial<Record<Keys, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<Keys, boolean>>>({});

  const collect = useCallback(
    (v: Values) => {
      const res = schema.safeParse(v);
      if (res.success) return {} as Partial<Record<Keys, string>>;
      const next: Partial<Record<Keys, string>> = {};
      for (const issue of res.error.issues) {
        const key = issue.path[0] as Keys | undefined;
        if (key && !next[key]) next[key] = issue.message;
      }
      return next;
    },
    [schema],
  );

  const setField = useCallback(
    (key: Keys) => (val: Values extends Record<string, unknown> ? Values[Keys] : never) => {
      setValues((prev) => {
        const next = Object.assign({}, prev as object, {
          [key]: val,
        }) as Values;
        // Re-validate a field only after it's been touched, so users aren't
        // yelled at while first typing.
        setErrors((e) => (touched[key] ? { ...e, [key]: collect(next)[key] } : e));
        return next;
      });
    },
    [collect, touched],
  );

  const blur = useCallback(
    (key: Keys) => () => {
      setTouched((t) => ({ ...t, [key]: true }));
      setErrors((e) => ({ ...e, [key]: collect(values)[key] }));
    },
    [collect, values],
  );

  const submit = useCallback(
    (onValid: (data: z.output<S>) => void) => {
      const res = schema.safeParse(values);
      if (res.success) {
        setErrors({});
        onValid(res.data);
        return true;
      }
      setErrors(collect(values));
      setTouched(
        Object.keys(values as object).reduce(
          (acc, k) => ({ ...acc, [k]: true }),
          {} as Partial<Record<Keys, boolean>>,
        ),
      );
      return false;
    },
    [collect, schema, values],
  );

  const isValid = useMemo(
    () => schema.safeParse(values).success,
    [schema, values],
  );

  const reset = useCallback(() => {
    setValues(initial);
    setErrors({});
    setTouched({});
  }, [initial]);

  return { values, errors, touched, setField, blur, submit, reset, isValid };
}
