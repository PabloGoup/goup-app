// src/lib/schemas.ts
import { z } from "zod";

/* =========================
 *  CLUB
 * =======================*/
export const clubSchema = z.object({
  nombre: z.string().min(2, "El nombre es obligatorio"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  tel: z.string().optional().or(z.literal("")),
  desc: z.string().optional().or(z.literal("")),
  direccion: z.string().optional().or(z.literal("")),
  comuna: z.string().optional().or(z.literal("")),
  aforo: z
    .number({ invalid_type_error: "Debes indicar el aforo" })
    .int()
    .positive()
    .or(z.string().transform((v) => (v ? Number(v) : undefined))),
  banos: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .or(z.string().transform((v) => (v ? Number(v) : undefined))),
  amb: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .or(z.string().transform((v) => (v ? Number(v) : undefined))),
  servicios: z.object({
    estacionamiento: z.boolean(),
    guardarropia: z.boolean(),
    terraza: z.boolean(),
    accesibilidad: z.boolean(),
    wifi: z.boolean(),
    fumadores: z.boolean(),
  }),
  img_perfil: z.any().optional(),
  img_banner: z.any().optional(),
});
export type ClubData = z.infer<typeof clubSchema>;

/* =========================
 *  PRODUCTORA
 * =======================*/
export const producerSchema = z.object({
  nombre: z.string().min(2, "El nombre es obligatorio"),
  correo: z.string().email("Correo inválido"),
  tel: z.string().min(5, "Teléfono requerido"),
  rut: z.string().min(5, "RUT requerido"),
  rs: z.string().min(2, "Razón social requerida"),
  img_perfil_prod: z.any().optional(),
  img_banner_prod: z.any().optional(),
  instagram: z.string().optional().or(z.literal("")),
  web: z.string().optional().or(z.literal("")),
});
export type ProducerData = z.infer<typeof producerSchema>;

/* =========================
 *  EVENTO
 * =======================*/
export const eventSchema = z.object({
    nombre: z.string().min(1, "Nombre requerido"),
    tipo: z.string().min(1, "Tipo requerido"),
    fecha: z.string().min(1, "Fecha requerida"),
    horaInicio: z.string().min(1, "Hora de inicio requerida"),
    horaCierre: z.string().min(1, "Hora de cierre requerida"),
    capacidad: z.string().min(1,"Seleccione capacidad aproximada"),
    presupuesto: z.string().optional().default(""),
    promotor: z.string().min(1, "Promotor requerido"),
    telefono: z.string().min(1, "Teléfono requerido"),
    email: z.string().email("Email inválido"),
    desc: z.string().min(1, "Descripción requerida"),
    generos: z.array(z.string()).min(1, "Selecciona al menos un género"),
    flyer: z
      .any()
      .nullable()
      .optional(),
    imgSec: z
      .any()
      .nullable()
      .optional(),
      edad: z
  .string()
  .transform((val) => parseInt(val, 10))
  .refine((val) => val >= 18, {
    message: "La edad mínima debe ser 18 años o más",
  
  }),

  
      tieneVip: z.string().optional(),
      vip: z.string().optional(),
      reservas: z
  .string()
  .transform((val) => val === "Sí"),
 // tieneLineup: z
 // .string()
//  .transform((val) => val === "Sí"),
  
 //     cantidadDJs: z.string().optional(),
  //    djs: z.array(z.string()).optional(),
  dress_code: z.string({ required_error: "Debes seleccionar un código de vestimenta" }),
  generosOtro: z.string().optional(),
      
  });
  export type EventData = z.infer<typeof eventSchema>;
  export type EventFormValues = z.infer<typeof eventSchema>;