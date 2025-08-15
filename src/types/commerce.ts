export type TicketTypeDraft = {
    id?: string;             // key local (uuid) o docId luego
    name: string;            // Early, General, VIP, etc.
    price: number;           // CLP (enteros)
    stockTotal: number;
    stockDisponible: number;
    perUserLimit?: number | null;
    orden: number;
    activo: boolean;
  };
  
  export type EventDraft = {
    nombre: string;
    descripcion: string;
    fechaInicio: Date;
    fechaFin: Date;
    clubId: string;            // referencia a /club/*
    venderTickets: boolean;
    moneda: "CLP";
    perUserLimit: number;
    ventaAbre?: Date | null;
    ventaCierra?: Date | null;
    imagen?: File | null;
  };
  
  export type OrderDraft = {
    userId: string;
    eventId: string;
    status: "pending" | "paid" | "expired" | "refunded";
    items: Array<{ ticketTypeId: string; name: string; unitPrice: number; qty: number; lineTotal: number }>;
    amountSubtotal: number;
    amountFees: number;
    amountTotal: number;
    currency: "CLP";
    createdAt: any;           // serverTimestamp
  };