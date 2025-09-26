// src/components/form/controls.tsx
/* eslint-disable react-refresh/only-export-components */
import React, {
    type ReactNode,
    useState,
    type Dispatch,
    type SetStateAction,
  } from "react";
  import {
    useFormContext,
    Controller,
    get, // helper de RHF para acceder a paths anidados
    type FieldValues,
    type FieldPath,
    type FieldError,
    type FieldErrors,
    type PathValue,
    type UseFormReturn,
  } from "react-hook-form";
  import { UploadCloud, CheckCircle2 } from "lucide-react";
  
  /* =========================================================================
     Hook SEGURO para RHF
     ======================================================================= */
  function useFormContextSafe<TFieldValues extends FieldValues>(): UseFormReturn<TFieldValues> {
   
    const ctx = useFormContext<TFieldValues>();
    if (!ctx) {
      throw new Error("useFormContextSafe debe usarse dentro de <FormProvider />");
    }
    return ctx;
  }
  
  /* =========================================================================
     Wrappers visuales
     ======================================================================= */
  
  type EntityCardChildren = (
    sent: boolean,
    setSent: Dispatch<SetStateAction<boolean>>
  ) => ReactNode;
  
  function EntityCard({
    title,
    children,
  }: {
    title: string;
    children: EntityCardChildren;
  }) {
    const [sent, setSent] = useState(false);
  
    return (
      <div className="w-full max-w-lg bg-[#0f1b2e] p-6 shadow-xl rounded-md">
        <h2 className="text-xl font-semibold mb-4 text-center">{title}</h2>
        {children(sent, setSent)}
      </div>
    );
  }
  
  function Section({
    icon,
    title,
    children,
  }: {
    icon?: ReactNode;
    title: string;
    children?: ReactNode;
  }) {
    return (
      <div className="space-y-2">
        <h2 className="text-2xl font-extrabold tracking-tight text-[#FE8B02] flex items-center gap-2">
          {icon && <span className="text-2xl">{icon}</span>} {title}
        </h2>
        {children}
      </div>
    );
  }
  
  /* =========================================================================
     Mensajes / Banners
     ======================================================================= */
  
  function SuccessMsg({ title, subtitle }: { title: string; subtitle?: string }) {
    return (
      <div className="rounded-md border border-green-500/20 bg-green-500/10 p-6 text-center">
        <div className="flex justify-center mb-2">
          <CheckCircle2 className="text-green-400" />
        </div>
        <h2 className="text-xl font-semibold text-green-400">{title}</h2>
        {subtitle && <p className="/70 mt-2">{subtitle}</p>}
      </div>
    );
  }
  
  function StepErrorBanner({ errors }: { errors: string[] }) {
    if (errors.length === 0) return null;
    return (
      <div className="rounded-md border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
        <p className="font-semibold mb-2">Corrige estos campos:</p>
        <ul className="list-disc pl-5 space-y-1">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      </div>
    );
  }
  
  /* =========================================================================
     Inputs RHF reutilizables (tipados)
     ======================================================================= */
  
  function RHFInput<T extends FieldValues>({
    name,
    label,
    helper,
    type = "text",
    placeholder,
    ...props
  }: {
    name: FieldPath<T>;
    label: string;
    helper?: string;
    type?: React.InputHTMLAttributes<HTMLInputElement>["type"];
    placeholder?: string;
  } & Omit<React.ComponentProps<"input">, "name" | "type">) {
    const {
      register,
      formState: { errors },
    } = useFormContextSafe<T>();
  
    const err = getError(errors, name)?.message;
  
    return (
      <label className="flex flex-col gap-1">
        <span className="text-l text-bold font-medium">{label}</span>
        <input
          type={type}
          placeholder={placeholder}
          {...register(name)}
          {...props}
          className={`rounded-md px-2 py-2 bg-[#0f0f16] border ${
            err ? "border-red-500" : "border-[#3a3357]"
          } focus:outline-none focus:border-[#FE8B02] placeholder:/30`}
        />
        {helper && <span className="text-xs /40">{helper}</span>}
        {err && <span className="text-xs text-red-500">{err}</span>}
      </label>
    );
  }
  
  function RHFTextarea<T extends FieldValues>({
    name,
    label,
    helper,
    rows = 4,
    placeholder,
    ...props
  }: {
    name: FieldPath<T>;
    label: string;
    helper?: string;
    rows?: number;
    placeholder?: string;
  } & Omit<React.ComponentProps<"textarea">, "name">) {
    const {
      register,
      formState: { errors },
    } = useFormContextSafe<T>();
  
    const err = getError(errors, name)?.message;
  
    return (
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{label}</span>
        <textarea
          rows={rows}
          placeholder={placeholder}
          {...register(name)}
          {...props}
          className={`rounded-md px-2 py-2 bg-[#0f0f16] border ${
            err ? "border-red-500" : "border-[#3a3357]"
          } focus:outline-none focus:border-[#FE8B02] placeholder:/30`}
        />
        {helper && <span className="text-xs /40">{helper}</span>}
        {err && <span className="text-xs text-red-500">{err}</span>}
      </label>
    );
  }
  
  function RHFSelect<T extends FieldValues>({
    name,
    label,
    options,
    placeholder,
  }: {
    name: FieldPath<T>;
    label: string;
    placeholder?: string;
    options: readonly string[] | string[];
  }) {
    const {
      register,
      formState: { errors },
    } = useFormContextSafe<T>();
  
    const err = getError(errors, name)?.message;
  
    return (
      <label className="flex flex-col gap-1">
        <span className="text-l text-bold font-medium">{label}</span>
        <select
          {...register(name)}
          className="w-full bg-white/5 border /10 rounded px-2 py-2 h-[42px] text-sm text-center goup-select"
          defaultValue=""
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        {err && <span className="text-xs text-red-500">{err}</span>}
      </label>
    );
  }
  
  /**
   * Switch booleano (checkbox simple). Si usas tu propio componente Switch,
   * reemplaza el <input type="checkbox" />.
   */
  function RHFServiceSwitch<T extends FieldValues>({
    name,
    label,
  }: {
    name: FieldPath<T>;
    label: string;
  }) {
    const { control } = useFormContextSafe<T>();
  
    return (
      <Controller
        name={name}
        control={control}
        render={({ field: { value, onChange } }) => (
          <div className="flex items-center justify-between">
            <span>{label}</span>
            <input
              type="checkbox"
              checked={!!value}
              onChange={(e) => onChange(e.target.checked)}
              className="relative w-11 h-6 appearance-none rounded-full bg-gray-600 checked:bg-[#FE8B02] transition-colors cursor-pointer"
            />
          </div>
        )}
      />
    );
  }
  
  function RHFFile<T extends FieldValues>({
    name,
    label,
    accept = "image/*",
  }: {
    name: FieldPath<T>;
    label: string;
    accept?: string;
  }) {
    const {
      setValue,
      formState: { errors },
    } = useFormContextSafe<T>();
  
    const err = getError(errors, name)?.message;
  
    return (
      <label className="flex text-white flex-col gap-1">
        <span className="text-sm text-white font-medium">{label}</span>
  
        <div
          className={`flex items-center gap-2 bg-[#0f0f16] text-white  border ${
            err ? "border-red-500" : "border-[#3a3357]"
          } rounded-md p-2`}
        >
          <UploadCloud size={18} className="text-white " />
          <input
            type="file"
            accept={accept}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              setValue(name, file as PathValue<T, typeof name>, {
                shouldValidate: true,
              });
            }}
            className="flex-1 bg-transparent focus:outline-none text-white file:mr-2 file:rounded file:border-none file:bg-[#FE8B02] file:px-2 file:py-1 file:"
          />
        </div>
  
        {err && <span className="text-xs text-red-500">{err}</span>}
      </label>
    );
  }
  
  /**
   * Grupo de checkboxes para strings[]
   */
  function RHFCheckboxGroup<
    T extends FieldValues,
    K extends FieldPath<T>
  >({
    name,
    label,
    options,
  }: {
    name: K;
    label: string;
    options: string[];
  }) {
    const { watch, setValue } = useFormContextSafe<T>();
    const values: string[] = (watch(name) as unknown as string[]) ?? [];
  
    const toggle = (v: string) =>
      setValue(
        name,
        (values.includes(v)
          ? values.filter((x) => x !== v)
          : [...values, v]) as PathValue<T, K>,
        { shouldValidate: true }
      );
  
    return (
      <div className="mt-2">
        <p className="text-sm font-medium mb-2">{label}</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {options.map((g) => (
            <label key={g} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={values.includes(g)}
                onChange={() => toggle(g)}
              />
              <span>{g}</span>
            </label>
          ))}
        </div>
      </div>
    );
  }
  
  /* =========================================================================
     Bloque de revisión (simple)
     ======================================================================= */
  function ReviewBlock<T extends FieldValues>() {
    const { getValues } = useFormContextSafe<T>();
    const values = getValues();
    return (
      <pre className="bg-[#0f0f16] border /5 rounded-md p-4 text-xs overflow-x-auto">
        {JSON.stringify(values, null, 2)}
      </pre>
    );
  }
  
  /* =========================================================================
     Helpers
     ======================================================================= */
  
  function getError<T extends FieldValues>(
    errors: FieldErrors<T>,
    path: FieldPath<T>
  ): FieldError | undefined {
    return get(errors, path) as FieldError | undefined;
  }
  
  /* =========================================================================
     Export ÚNICO (no redeclarar)
     ======================================================================= */
  export {
    useFormContextSafe,
    EntityCard,
    Section,
    ReviewBlock,
    SuccessMsg,
    StepErrorBanner,
    RHFInput,
    RHFTextarea,
    RHFSelect,
    RHFServiceSwitch,
    RHFFile,
    RHFCheckboxGroup,
  };