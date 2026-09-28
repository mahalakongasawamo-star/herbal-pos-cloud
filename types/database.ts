export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      branches: {
        Row: {
          active: boolean;
          code: string;
          created_at: string;
          id: string;
          name: string;
        };
        Insert: {
          active?: boolean;
          code: string;
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: {
          active?: boolean;
          code?: string;
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          is_package: boolean;
          name: string;
          sort_order: number;
        };
        Insert: {
          id?: string;
          is_package?: boolean;
          name: string;
          sort_order?: number;
        };
        Update: {
          id?: string;
          is_package?: boolean;
          name?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      member_tiers: {
        Row: {
          discount_pct: number;
          id: string;
          name: string;
          sort_order: number;
        };
        Insert: {
          discount_pct?: number;
          id?: string;
          name: string;
          sort_order?: number;
        };
        Update: {
          discount_pct?: number;
          id?: string;
          name?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      package_inclusions: {
        Row: {
          component_product_id: string;
          package_product_id: string;
          qty: number;
        };
        Insert: {
          component_product_id: string;
          package_product_id: string;
          qty: number;
        };
        Update: {
          component_product_id?: string;
          package_product_id?: string;
          qty?: number;
        };
        Relationships: [
          {
            foreignKeyName: "package_inclusions_component_product_id_fkey";
            columns: ["component_product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "package_inclusions_package_product_id_fkey";
            columns: ["package_product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_methods: {
        Row: {
          id: string;
          is_cash: boolean;
          name: string;
          sort_order: number;
        };
        Insert: {
          id?: string;
          is_cash?: boolean;
          name: string;
          sort_order?: number;
        };
        Update: {
          id?: string;
          is_cash?: boolean;
          name?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      products: {
        Row: {
          active: boolean;
          category_id: string;
          created_at: string;
          id: string;
          is_package: boolean;
          member_price: number;
          name: string;
          price: number;
          reorder_level: number;
          sku: string;
          tier_prices: NonNullable<Json>;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          category_id: string;
          created_at?: string;
          id?: string;
          is_package?: boolean;
          member_price?: number;
          name: string;
          price?: number;
          reorder_level?: number;
          sku: string;
          tier_prices?: NonNullable<Json>;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          category_id?: string;
          created_at?: string;
          id?: string;
          is_package?: boolean;
          member_price?: number;
          name?: string;
          price?: number;
          reorder_level?: number;
          sku?: string;
          tier_prices?: NonNullable<Json>;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          active: boolean;
          branch_id: string | null;
          created_at: string;
          full_name: string;
          id: string;
          role: string;
        };
        Insert: {
          active?: boolean;
          branch_id?: string | null;
          created_at?: string;
          full_name?: string;
          id: string;
          role: string;
        };
        Update: {
          active?: boolean;
          branch_id?: string | null;
          created_at?: string;
          full_name?: string;
          id?: string;
          role?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      sale_items: {
        Row: {
          category: string;
          charged_unit: number;
          discount: number;
          gross: number;
          id: string;
          inclusions: Json | null;
          is_package: boolean;
          line_no: number;
          name: string;
          net: number;
          product_id: string;
          qty: number;
          rule_label: string;
          sale_id: string;
          sku: string;
          unit_price: number;
        };
        Insert: {
          category: string;
          charged_unit: number;
          discount: number;
          gross: number;
          id?: string;
          inclusions?: Json | null;
          is_package: boolean;
          line_no: number;
          name: string;
          net: number;
          product_id: string;
          qty: number;
          rule_label: string;
          sale_id: string;
          sku: string;
          unit_price: number;
        };
        Update: {
          category?: string;
          charged_unit?: number;
          discount?: number;
          gross?: number;
          id?: string;
          inclusions?: Json | null;
          is_package?: boolean;
          line_no?: number;
          name?: string;
          net?: number;
          product_id?: string;
          qty?: number;
          rule_label?: string;
          sale_id?: string;
          sku?: string;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey";
            columns: ["sale_id"];
            isOneToOne: false;
            referencedRelation: "sales";
            referencedColumns: ["id"];
          },
        ];
      };
      sales: {
        Row: {
          branch_id: string;
          cashier_id: string;
          change: number;
          client_ref: string;
          created_at: string;
          customer_name: string;
          customer_tier: string;
          discount_total: number;
          gross_total: number;
          id: string;
          is_cash: boolean;
          leader_name: string;
          member_tier: string | null;
          payment_method_id: string;
          payment_method_name: string;
          receipt_no: string;
          reference: string;
          request_hash: string;
          status: string;
          tendered: number;
          total_due: number;
          upline_name: string;
          void_reason: string | null;
          voided_at: string | null;
          voided_by: string | null;
        };
        Insert: {
          branch_id: string;
          cashier_id: string;
          change: number;
          client_ref: string;
          created_at?: string;
          customer_name: string;
          customer_tier: string;
          discount_total: number;
          gross_total: number;
          id?: string;
          is_cash: boolean;
          leader_name?: string;
          member_tier?: string | null;
          payment_method_id: string;
          payment_method_name: string;
          receipt_no: string;
          reference?: string;
          request_hash: string;
          status?: string;
          tendered: number;
          total_due: number;
          upline_name?: string;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          branch_id?: string;
          cashier_id?: string;
          change?: number;
          client_ref?: string;
          created_at?: string;
          customer_name?: string;
          customer_tier?: string;
          discount_total?: number;
          gross_total?: number;
          id?: string;
          is_cash?: boolean;
          leader_name?: string;
          member_tier?: string | null;
          payment_method_id?: string;
          payment_method_name?: string;
          receipt_no?: string;
          reference?: string;
          request_hash?: string;
          status?: string;
          tendered?: number;
          total_due?: number;
          upline_name?: string;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "sales_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_cashier_id_fkey";
            columns: ["cashier_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_payment_method_id_fkey";
            columns: ["payment_method_id"];
            isOneToOne: false;
            referencedRelation: "payment_methods";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_voided_by_fkey";
            columns: ["voided_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      settings: {
        Row: {
          company_details: string;
          company_name: string;
          id: boolean;
          logo: string;
          options_reviewed: boolean;
          print_layout: string;
          receipt_footer: string;
          receipt_title: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          company_details?: string;
          company_name?: string;
          id?: boolean;
          logo?: string;
          options_reviewed?: boolean;
          print_layout?: string;
          receipt_footer?: string;
          receipt_title?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          company_details?: string;
          company_name?: string;
          id?: boolean;
          logo?: string;
          options_reviewed?: boolean;
          print_layout?: string;
          receipt_footer?: string;
          receipt_title?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "settings_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_balances: {
        Row: {
          branch_id: string;
          product_id: string;
          qty: number;
          updated_at: string;
        };
        Insert: {
          branch_id: string;
          product_id: string;
          qty?: number;
          updated_at?: string;
        };
        Update: {
          branch_id?: string;
          product_id?: string;
          qty?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stock_balances_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_balances_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_ins: {
        Row: {
          branch_id: string;
          created_at: string;
          created_by: string | null;
          date: string;
          id: string;
          note: string;
          reversed: boolean;
          reversed_at: string | null;
          reversed_by: string | null;
        };
        Insert: {
          branch_id: string;
          created_at?: string;
          created_by?: string | null;
          date?: string;
          id?: string;
          note?: string;
          reversed?: boolean;
          reversed_at?: string | null;
          reversed_by?: string | null;
        };
        Update: {
          branch_id?: string;
          created_at?: string;
          created_by?: string | null;
          date?: string;
          id?: string;
          note?: string;
          reversed?: boolean;
          reversed_at?: string | null;
          reversed_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "stock_ins_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_ins_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_ins_reversed_by_fkey";
            columns: ["reversed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_ledger: {
        Row: {
          branch_id: string;
          created_at: string;
          created_by: string | null;
          delta: number;
          id: string;
          note: string;
          product_id: string;
          reason: string;
          ref_sale_id: string | null;
          ref_stock_in_id: string | null;
        };
        Insert: {
          branch_id: string;
          created_at?: string;
          created_by?: string | null;
          delta: number;
          id?: string;
          note?: string;
          product_id: string;
          reason: string;
          ref_sale_id?: string | null;
          ref_stock_in_id?: string | null;
        };
        Update: {
          branch_id?: string;
          created_at?: string;
          created_by?: string | null;
          delta?: number;
          id?: string;
          note?: string;
          product_id?: string;
          reason?: string;
          ref_sale_id?: string | null;
          ref_stock_in_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "stock_ledger_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_ledger_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_ledger_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_ledger_ref_sale_fk";
            columns: ["ref_sale_id"];
            isOneToOne: false;
            referencedRelation: "sales";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_ledger_ref_stock_in_fk";
            columns: ["ref_stock_in_id"];
            isOneToOne: false;
            referencedRelation: "stock_ins";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      commit_sale: {
        Args: { payload: Json };
        Returns: {
          branch_id: string;
          cashier_id: string;
          change: number;
          client_ref: string;
          created_at: string;
          customer_name: string;
          customer_tier: string;
          discount_total: number;
          gross_total: number;
          id: string;
          is_cash: boolean;
          leader_name: string;
          member_tier: string | null;
          payment_method_id: string;
          payment_method_name: string;
          receipt_no: string;
          reference: string;
          request_hash: string;
          status: string;
          tendered: number;
          total_due: number;
          upline_name: string;
          void_reason: string | null;
          voided_at: string | null;
          voided_by: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "sales";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      receive_stock: {
        Args: {
          branch_id: string;
          entries: Json[];
          new_products?: Json[];
          note?: string;
          stock_date?: string;
        };
        Returns: {
          branch_id: string;
          created_at: string;
          created_by: string | null;
          date: string;
          id: string;
          note: string;
          reversed: boolean;
          reversed_at: string | null;
          reversed_by: string | null;
        }[];
        SetofOptions: {
          from: "*";
          to: "stock_ins";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      reverse_stock_in: { Args: { stock_in_id: string }; Returns: undefined };
      void_sale: {
        Args: { reason: string; sale_id: string };
        Returns: {
          branch_id: string;
          cashier_id: string;
          change: number;
          client_ref: string;
          created_at: string;
          customer_name: string;
          customer_tier: string;
          discount_total: number;
          gross_total: number;
          id: string;
          is_cash: boolean;
          leader_name: string;
          member_tier: string | null;
          payment_method_id: string;
          payment_method_name: string;
          receipt_no: string;
          reference: string;
          request_hash: string;
          status: string;
          tendered: number;
          total_due: number;
          upline_name: string;
          void_reason: string | null;
          voided_at: string | null;
          voided_by: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "sales";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
