export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      commodity_price_series: {
        Row: {
          commodity_code: string
          commodity_label: string
          created_at: string
          id: string
          period_date: string
          region: string
          source: string
          unit: string
          value: number
        }
        Insert: {
          commodity_code: string
          commodity_label: string
          created_at?: string
          id?: string
          period_date: string
          region?: string
          source: string
          unit: string
          value: number
        }
        Update: {
          commodity_code?: string
          commodity_label?: string
          created_at?: string
          id?: string
          period_date?: string
          region?: string
          source?: string
          unit?: string
          value?: number
        }
        Relationships: []
      }
      ingredient_price_history: {
        Row: {
          created_at: string
          effective_date: string
          id: string
          ingredient_id: string
          invoice_id: string | null
          org_id: string
          quantity: number | null
          source: string
          unit: string
          unit_cost: number
          vendor_id: string | null
        }
        Insert: {
          created_at?: string
          effective_date?: string
          id?: string
          ingredient_id: string
          invoice_id?: string | null
          org_id: string
          quantity?: number | null
          source?: string
          unit: string
          unit_cost: number
          vendor_id?: string | null
        }
        Update: {
          created_at?: string
          effective_date?: string
          id?: string
          ingredient_id?: string
          invoice_id?: string | null
          org_id?: string
          quantity?: number | null
          source?: string
          unit?: string
          unit_cost?: number
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_price_history_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_price_history_invoice_fk"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_price_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_price_history_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredients: {
        Row: {
          base_unit: string
          category: string | null
          commodity_code: string | null
          created_at: string
          current_unit_cost: number | null
          current_unit_cost_updated_at: string | null
          embedding: string | null
          id: string
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          base_unit: string
          category?: string | null
          commodity_code?: string | null
          created_at?: string
          current_unit_cost?: number | null
          current_unit_cost_updated_at?: string | null
          embedding?: string | null
          id?: string
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          base_unit?: string
          category?: string | null
          commodity_code?: string | null
          created_at?: string
          current_unit_cost?: number | null
          current_unit_cost_updated_at?: string | null
          embedding?: string | null
          id?: string
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          base_unit_cost: number | null
          candidate_matches: Json | null
          created_at: string
          embedding: string | null
          entry_method: string
          id: string
          invoice_id: string
          match_confidence: number | null
          match_status: string
          matched_ingredient_id: string | null
          org_id: string
          parsed_item_name: string | null
          parsed_line_total: number | null
          parsed_pack_quantity: number | null
          parsed_pack_unit: string | null
          parsed_quantity: number | null
          parsed_unit: string | null
          parsed_unit_cost: number | null
          position: number | null
          price_applied_at: string | null
          price_note: string | null
          raw_text: string
          updated_at: string
        }
        Insert: {
          base_unit_cost?: number | null
          candidate_matches?: Json | null
          created_at?: string
          embedding?: string | null
          entry_method?: string
          id?: string
          invoice_id: string
          match_confidence?: number | null
          match_status?: string
          matched_ingredient_id?: string | null
          org_id: string
          parsed_item_name?: string | null
          parsed_line_total?: number | null
          parsed_pack_quantity?: number | null
          parsed_pack_unit?: string | null
          parsed_quantity?: number | null
          parsed_unit?: string | null
          parsed_unit_cost?: number | null
          position?: number | null
          price_applied_at?: string | null
          price_note?: string | null
          raw_text: string
          updated_at?: string
        }
        Update: {
          base_unit_cost?: number | null
          candidate_matches?: Json | null
          created_at?: string
          embedding?: string | null
          entry_method?: string
          id?: string
          invoice_id?: string
          match_confidence?: number | null
          match_status?: string
          matched_ingredient_id?: string | null
          org_id?: string
          parsed_item_name?: string | null
          parsed_line_total?: number | null
          parsed_pack_quantity?: number | null
          parsed_pack_unit?: string | null
          parsed_quantity?: number | null
          parsed_unit?: string | null
          parsed_unit_cost?: number | null
          position?: number | null
          price_applied_at?: string | null
          price_note?: string | null
          raw_text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_matched_ingredient_id_fkey"
            columns: ["matched_ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          error_message: string | null
          file_storage_path: string
          file_type: string
          id: string
          invoice_date: string | null
          invoice_number: string | null
          org_id: string
          raw_extraction: Json | null
          source_type: string
          status: string
          total_amount: number | null
          updated_at: string
          uploaded_by: string | null
          vendor_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          file_storage_path: string
          file_type?: string
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          org_id: string
          raw_extraction?: Json | null
          source_type?: string
          status?: string
          total_amount?: number | null
          updated_at?: string
          uploaded_by?: string | null
          vendor_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          file_storage_path?: string
          file_type?: string
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          org_id?: string
          raw_extraction?: Json | null
          source_type?: string
          status?: string
          total_amount?: number | null
          updated_at?: string
          uploaded_by?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_margin_impacts: {
        Row: {
          created_at: string
          id: string
          margin_pct_delta: number | null
          menu_item_id: string
          new_margin_amount: number | null
          new_margin_pct: number | null
          org_id: string
          previous_margin_amount: number | null
          previous_margin_pct: number | null
          price_alert_id: string
          recipe_id: string
          resolution: string | null
          resolution_notes: string | null
          resolved_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          margin_pct_delta?: number | null
          menu_item_id: string
          new_margin_amount?: number | null
          new_margin_pct?: number | null
          org_id: string
          previous_margin_amount?: number | null
          previous_margin_pct?: number | null
          price_alert_id: string
          recipe_id: string
          resolution?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          margin_pct_delta?: number | null
          menu_item_id?: string
          new_margin_amount?: number | null
          new_margin_pct?: number | null
          org_id?: string
          previous_margin_amount?: number | null
          previous_margin_pct?: number | null
          price_alert_id?: string
          recipe_id?: string
          resolution?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_margin_impacts_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_item_margins"
            referencedColumns: ["menu_item_id"]
          },
          {
            foreignKeyName: "menu_item_margin_impacts_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_margin_impacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_margin_impacts_price_alert_id_fkey"
            columns: ["price_alert_id"]
            isOneToOne: false
            referencedRelation: "price_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_margin_impacts_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe_costs"
            referencedColumns: ["recipe_id"]
          },
          {
            foreignKeyName: "menu_item_margin_impacts_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          org_id: string
          recipe_id: string | null
          selling_price: number
          servings_per_batch: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          recipe_id?: string | null
          selling_price: number
          servings_per_batch?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          recipe_id?: string | null
          selling_price?: number
          servings_per_batch?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe_costs"
            referencedColumns: ["recipe_id"]
          },
          {
            foreignKeyName: "menu_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          business_type: string | null
          created_at: string
          id: string
          max_unreviewed_line_items: number
          name: string
          price_alert_threshold_pct: number
          stripe_customer_id: string | null
          subscription_tier: string
          target_margin_pct: number
          updated_at: string
        }
        Insert: {
          business_type?: string | null
          created_at?: string
          id?: string
          max_unreviewed_line_items?: number
          name: string
          price_alert_threshold_pct?: number
          stripe_customer_id?: string | null
          subscription_tier?: string
          target_margin_pct?: number
          updated_at?: string
        }
        Update: {
          business_type?: string | null
          created_at?: string
          id?: string
          max_unreviewed_line_items?: number
          name?: string
          price_alert_threshold_pct?: number
          stripe_customer_id?: string | null
          subscription_tier?: string
          target_margin_pct?: number
          updated_at?: string
        }
        Relationships: []
      }
      price_alerts: {
        Row: {
          acknowledged: boolean
          ai_narrative: string | null
          ai_narrative_generated_at: string | null
          ai_narrative_model: string | null
          created_at: string
          id: string
          ingredient_id: string
          invoice_id: string | null
          new_unit_cost: number
          org_id: string
          pct_change: number
          previous_unit_cost: number
        }
        Insert: {
          acknowledged?: boolean
          ai_narrative?: string | null
          ai_narrative_generated_at?: string | null
          ai_narrative_model?: string | null
          created_at?: string
          id?: string
          ingredient_id: string
          invoice_id?: string | null
          new_unit_cost: number
          org_id: string
          pct_change: number
          previous_unit_cost: number
        }
        Update: {
          acknowledged?: boolean
          ai_narrative?: string | null
          ai_narrative_generated_at?: string | null
          ai_narrative_model?: string | null
          created_at?: string
          id?: string
          ingredient_id?: string
          invoice_id?: string | null
          new_unit_cost?: number
          org_id?: string
          pct_change?: number
          previous_unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "price_alerts_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_alerts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_alerts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          org_id: string
          role: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          org_id: string
          role?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          org_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          org_id: string
          quantity: number
          recipe_id: string
          unit: string
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id: string
          org_id: string
          quantity: number
          recipe_id: string
          unit: string
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          org_id?: string
          quantity?: number
          recipe_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe_costs"
            referencedColumns: ["recipe_id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          batch_yield_qty: number
          batch_yield_unit: string
          created_at: string
          id: string
          name: string
          notes: string | null
          org_id: string
          updated_at: string
        }
        Insert: {
          batch_yield_qty: number
          batch_yield_unit: string
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          org_id: string
          updated_at?: string
        }
        Update: {
          batch_yield_qty?: number
          batch_yield_unit?: string
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_ingredient_aliases: {
        Row: {
          confirmed_by: string | null
          created_at: string
          id: string
          ingredient_id: string
          org_id: string
          raw_text_normalized: string
          times_used: number
          vendor_id: string | null
        }
        Insert: {
          confirmed_by?: string | null
          created_at?: string
          id?: string
          ingredient_id: string
          org_id: string
          raw_text_normalized: string
          times_used?: number
          vendor_id?: string | null
        }
        Update: {
          confirmed_by?: string | null
          created_at?: string
          id?: string
          ingredient_id?: string
          org_id?: string
          raw_text_normalized?: string
          times_used?: number
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_ingredient_aliases_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_ingredient_aliases_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_ingredient_aliases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_ingredient_aliases_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          created_at: string
          id: string
          name: string
          normalized_name: string | null
          org_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          normalized_name?: string | null
          org_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          normalized_name?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      menu_item_margins: {
        Row: {
          cost_per_serving: number | null
          margin_amount: number | null
          margin_pct: number | null
          menu_item_id: string | null
          name: string | null
          org_id: string | null
          selling_price: number | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_costs: {
        Row: {
          batch_total_cost: number | null
          batch_yield_qty: number | null
          batch_yield_unit: string | null
          cost_per_serving: number | null
          name: string | null
          org_id: string | null
          recipe_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apply_line_item_price: {
        Args: { p_base_unit_cost: number; p_line_item_id: string }
        Returns: Json
      }
      current_org_id: { Args: never; Returns: string }
      match_ingredients: {
        Args: { match_count?: number; query_embedding: string }
        Returns: {
          ingredient_id: string
          name: string
          similarity: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
