/**
 * Hand-authored Supabase schema types, kept in step with supabase/migrations.
 * When the backend is provisioned you can regenerate this with
 * `supabase gen types typescript` and replace this file.
 */
export type AppRole = "saas" | "dueno" | "admin" | "mesero";
export type PlanTier = "Básico" | "Pro" | "Enterprise";
export type TenantStatus = "Activo" | "Prueba" | "Suspendido";
export type TableStatus = "libre" | "ocupada" | "cuenta" | "reservada";
export type OrderStatus = "abierta" | "en_cocina" | "servida" | "cobrada" | "anulada";
export type KdsColumn = "nuevos" | "preparacion" | "listos" | "entregado";
export type ComprobanteTipo = "Boleta" | "Factura" | "NotaCredito";
export type SunatStatus = "encola" | "enviando" | "aceptada" | "rechazada";
export type CurrencyCode = "PEN" | "USD" | "EUR";
export type PayMethod = "efectivo" | "tarjeta" | "transferencia" | "yape" | "plin";

type Timestamps = { created_at: string };

export interface Tables {
  tenants: {
    Row: { id: string; name: string; slug: string; owner_name: string; plan: PlanTier; mrr: number; status: TenantStatus; since: string } & Timestamps;
  };
  memberships: {
    Row: { id: string; user_id: string; tenant_id: string | null; role: AppRole } & Timestamps;
  };
  subscription_plans: {
    Row: { id: string; tier: PlanTier; price: number; features: string } & Timestamps;
  };
  saas_invoices: {
    Row: { id: string; tenant_id: string; folio: string; amount: number; igv: number; method: PayMethod | null; paid: boolean; issued_at: string };
  };
  support_tickets: {
    Row: { id: string; tenant_id: string; subject: string; priority: string; status: string } & Timestamps;
  };
  platform_activity: {
    Row: { id: string; actor: string; message: string; created_at: string };
  };
  platform_settings: {
    Row: {
      id: boolean;
      razon_social: string;
      ruc: string;
      direccion: string;
      billing_email: string;
      billing_provider: string;
      sunat_mode: string;
      sol_user: string | null;
      billing_endpoint: string | null;
      updated_at: string;
    };
  };
  platform_fiscal_credentials: {
    Row: {
      id: boolean;
      provider: string;
      sol_pass: string | null;
      cert_pem: string | null;
      key_pem: string | null;
      api_token: string | null;
      updated_at: string;
    };
  };
  subscription_charges: {
    Row: {
      id: string;
      tenant_id: string;
      plan: PlanTier;
      base: number;
      igv: number;
      total: number;
      ruc: string | null;
      razon_social: string | null;
      period: string;
      status: "pendiente" | "aprobada" | "rechazada" | "cobrada" | "fallida";
      note: string | null;
      invoice_id: string | null;
      proposed_at: string;
      decided_at: string | null;
      decided_by: string | null;
    };
  };
  onboarding_links: {
    Row: { id: string; tenant_id: string; token_hash: string; expires_at: string; used_at: string | null } & Timestamps;
  };
  branches: {
    Row: { id: string; tenant_id: string; name: string; city: string } & Timestamps;
  };
  staff_members: {
    Row: { id: string; tenant_id: string; name: string; initials: string; role: AppRole; pin_hash: string | null; active: boolean } & Timestamps;
  };
  business_settings: {
    Row: { tenant_id: string; name: string; currency: CurrencyCode; tax_rate: number; tip_presets: number[]; online_orders: boolean; auto_tip: boolean; ruc: string | null; address: string | null; yape_number: string | null; plin_number: string | null; card_provider: string; card_public_key: string | null; razon_social: string | null; ubigeo: string | null; billing_provider: string; sunat_mode: string; sol_user: string | null; billing_endpoint: string | null; updated_at: string };
  };
  payment_credentials: {
    Row: {
      tenant_id: string;
      provider: string;
      secret_key: string | null;
      public_key: string | null;
      merchant_id: string | null;
      webhook_secret: string | null;
      extra: Record<string, unknown>;
      updated_at: string;
    };
  };
  payment_events: {
    Row: {
      id: string;
      tenant_id: string | null;
      provider: string;
      event_id: string;
      event_type: string | null;
      charge_id: string | null;
      amount: number | null;
      status: string | null;
      raw: unknown;
      received_at: string;
    };
  };
  complaints: {
    Row: {
      id: string;
      tenant_id: string;
      correlativo: number;
      consumer_name: string;
      consumer_doc_type: string;
      consumer_doc: string;
      consumer_address: string | null;
      consumer_phone: string | null;
      consumer_email: string | null;
      is_minor: boolean;
      item_type: string;
      item_amount: number | null;
      item_description: string | null;
      claim_type: string;
      detail: string;
      request: string | null;
      status: string;
      response: string | null;
      responded_at: string | null;
      created_at: string;
    };
  };
  fiscal_credentials: {
    Row: { tenant_id: string; provider: string; sol_pass: string | null; cert_pem: string | null; key_pem: string | null; api_token: string | null; updated_at: string };
  };
  menu_categories: {
    Row: { id: string; tenant_id: string; key: string; name: string; icon: string; subtitle: string; sort: number };
  };
  menu_items: {
    Row: { id: string; tenant_id: string; category_id: string; name: string; description: string; price: number; emoji: string; badge: string | null; is_veg: boolean; is_spicy: boolean; is_gf: boolean; is_meat: boolean; available: boolean; sort: number };
  };
  modifier_extras: {
    Row: { id: string; tenant_id: string; key: string; name: string; price: number };
  };
  modifier_prefs: {
    Row: { id: string; tenant_id: string; key: string; name: string };
  };
  restaurant_tables: {
    Row: { id: string; tenant_id: string; branch_id: string | null; zone: string; number: number; seats: number; status: TableStatus; waiter_id: string | null };
  };
  customers: {
    Row: { id: string; tenant_id: string; name: string; phone: string; visits: number; spent: number; points: number; tier: string } & Timestamps;
  };
  orders: {
    Row: { id: string; tenant_id: string; branch_id: string | null; table_id: string | null; waiter_id: string | null; customer_id: string | null; status: OrderStatus; opened_at: string; closed_at: string | null; paid_method: PayMethod | null; paid_total: number | null };
  };
  order_lines: {
    Row: { id: string; tenant_id: string; order_id: string; menu_item_id: string | null; name: string; qty: number; unit_price: number; extra_price: number; modifiers: string; split_payer: number | null } & Timestamps;
  };
  kitchen_tickets: {
    Row: { id: string; tenant_id: string; order_id: string | null; table_label: string; col: KdsColumn; entered_at: string; note: string; done: boolean; branch_id: string | null };
  };
  ticket_lines: {
    Row: { id: string; ticket_id: string; qty: number; name: string };
  };
  inventory_items: {
    Row: { id: string; tenant_id: string; name: string; unit: string; stock: number; par: number; cost: number | null };
  };
  recipes: {
    Row: { id: string; tenant_id: string; menu_item_id: string; inventory_id: string; qty_per_unit: number };
  };
  loyalty_transactions: {
    Row: { id: string; tenant_id: string; customer_id: string; order_id: string | null; points_delta: number } & Timestamps;
  };
  menu_change_requests: {
    Row: { id: string; tenant_id: string; kind: string; item_name: string; detail: string; status: string; requested_by: string | null } & Timestamps;
  };
  void_events: {
    Row: { id: string; tenant_id: string; order_id: string | null; line_name: string; reason: string; actor_id: string | null } & Timestamps;
  };
  online_orders: {
    Row: { id: string; tenant_id: string; channel: string; customer_name: string; items: string; total: number; eta: string; status: string } & Timestamps;
  };
  comprobantes: {
    Row: { id: string; tenant_id: string; order_id: string | null; folio: string; tipo: ComprobanteTipo; buyer_ruc: string | null; buyer_name: string | null; subtotal: number; igv: number; total: number; reference: string; status: SunatStatus; error: string | null; issued_at: string; ref_folio: string | null; motivo: string | null; signed_xml: string | null; cdr: string | null; sunat_ticket: string | null };
  };
  sunat_outbox: {
    Row: { id: string; tenant_id: string; comprobante_id: string; attempts: number; next_attempt_at: string; last_error: string | null } & Timestamps;
  };
  activity_log: {
    Row: { id: string; tenant_id: string; actor: string; message: string } & Timestamps;
  };
}

type Writable<T> = Omit<T, "id" | "created_at">;

export type Database = {
  public: {
    Tables: {
      [K in keyof Tables]: {
        Row: Tables[K]["Row"];
        Insert: Partial<Writable<Tables[K]["Row"]>> & Record<string, unknown>;
        Update: Partial<Tables[K]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      next_folio: { Args: { tid: string; p_serie: string }; Returns: string };
      set_comprobante_status: {
        Args: { cid: string; new_status: SunatStatus; new_error: string | null };
        Returns: undefined;
      };
      set_comprobante_result: {
        Args: { cid: string; new_status: SunatStatus; new_error: string | null; new_xml: string | null; new_cdr: string | null };
        Returns: undefined;
      };
      public_menu: { Args: { p_slug: string }; Returns: unknown };
      public_tenant_info: { Args: { p_slug: string }; Returns: unknown };
      submit_complaint: { Args: { p_slug: string; payload: unknown }; Returns: unknown };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Row<K extends keyof Tables> = Tables[K]["Row"];
