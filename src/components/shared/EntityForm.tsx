import type { ReactNode } from "react";
import {
  useForm,
  type DefaultValues,
  type FieldValues,
  type Resolver,
  type UseFormReturn,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Form } from "@/components/ui/form";

/**
 * Wrapper de formulário: react-hook-form + validação zod (@hookform/resolvers).
 * Os schemas zod espelham as constraints do banco (frontend.md), então o front
 * barra o erro antes do round-trip — mas a verdade continua sendo o Postgres.
 *
 * Uso:
 *   <EntityForm schema={vinculoSchema} valoresIniciais={...} onSubmit={...}>
 *     {(form) => (<FormField control={form.control} name="funcao" ... />)}
 *   </EntityForm>
 */
export function EntityForm<TValues extends FieldValues>({
  schema,
  valoresIniciais,
  onSubmit,
  children,
  id,
  className,
}: {
  schema: z.ZodType<TValues, z.ZodTypeDef, unknown>;
  valoresIniciais: DefaultValues<TValues>;
  onSubmit: (valores: TValues) => void | Promise<void>;
  children: (form: UseFormReturn<TValues>) => ReactNode;
  id?: string;
  className?: string;
}) {
  const form = useForm<TValues>({
    // O genérico é abstrato demais para as sobrecargas do zodResolver; o cast
    // é pontual e a segurança de tipo permanece via TValues no restante.
    resolver: zodResolver(schema as never) as Resolver<TValues>,
    defaultValues: valoresIniciais,
  });

  return (
    <Form {...form}>
      <form id={id} className={className} onSubmit={form.handleSubmit(onSubmit)}>
        {children(form)}
      </form>
    </Form>
  );
}
