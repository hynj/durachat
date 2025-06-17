import type { ValidationTargets } from "hono";
import type { BaseSchema } from "valibot";
import { validator } from 'hono/validator';
import * as v from "valibot";


export const customValibotValidator = <
  Target extends keyof ValidationTargets,
  ValibotSchema extends BaseSchema<any, any, any>
>(
  target: Target,
  schema: ValibotSchema
) => {
  return validator(target, (value, c) => {
    const result = v.safeParse(schema, value);

    if (!result.success) {
      let errorMessage = "Validation failed";
      let statusCode: 400 | 401 = 400;
      let issues = v.flatten(result.issues).nested;

      return c.json({type: "error", message: errorMessage, issues: issues}, statusCode);
    }
    return result.output;
  });
};


