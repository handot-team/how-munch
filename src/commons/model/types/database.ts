export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: number;
          user_id: string;
          email: string;
          nickname: string;
          household_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          email: string;
          nickname: string;
          household_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          email?: string;
          nickname?: string;
          household_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      households: {
        Row: {
          id: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      household_members: {
        Row: {
          id: string;
          household_id: string;
          user_id: string;
          role: 'owner' | 'member';
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          user_id: string;
          role?: 'owner' | 'member';
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          user_id?: string;
          role?: 'owner' | 'member';
          created_at?: string;
        };
        Relationships: [];
      };
      household_invites: {
        Row: {
          id: string;
          household_id: string;
          code: string;
          created_by: string;
          expires_at: string;
          max_uses: number;
          use_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          code: string;
          created_by: string;
          expires_at: string;
          max_uses?: number;
          use_count?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          code?: string;
          created_by?: string;
          expires_at?: string;
          max_uses?: number;
          use_count?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      ingredient_categories: {
        Row: {
          id: string;
          household_id: string | null;
          code: string;
          name: string;
          emoji_unicode: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id?: string | null;
          code: string;
          name: string;
          emoji_unicode: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string | null;
          code?: string;
          name?: string;
          emoji_unicode?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ingredient_categories_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ];
      };
      ingredients: {
        Row: {
          id: string;
          household_id: string;
          user_id: string;
          date: string;
          name: string;
          brand: string | null;
          price: number;
          store: string | null;
          category_id: string;
          count: number;
          unit: 'count' | 'g' | 'kg' | 'ml' | 'l';
          linked_fridge_item_id: string | null;
          linked_fridge_batch_id: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          user_id: string;
          date: string;
          name: string;
          brand?: string | null;
          price?: number;
          store?: string | null;
          category_id?: string;
          count?: number;
          unit?: 'count' | 'g' | 'kg' | 'ml' | 'l';
          linked_fridge_item_id?: string | null;
          linked_fridge_batch_id?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          user_id?: string;
          date?: string;
          name?: string;
          brand?: string | null;
          price?: number;
          store?: string | null;
          category_id?: string;
          count?: number;
          unit?: 'count' | 'g' | 'kg' | 'ml' | 'l';
          linked_fridge_item_id?: string | null;
          linked_fridge_batch_id?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ingredients_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'ingredient_categories';
            referencedColumns: ['id'];
          },
        ];
      };
      budgets: {
        Row: {
          id: string;
          household_id: string;
          year_month: string;
          scope: 'total' | 'grocery' | 'restaurant' | 'delivery';
          amount: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          year_month: string;
          scope: 'total' | 'grocery' | 'restaurant' | 'delivery';
          amount?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          year_month?: string;
          scope?: 'total' | 'grocery' | 'restaurant' | 'delivery';
          amount?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      fridge_batch_end_records: {
        Row: {
          id: string;
          household_id: string;
          fridge_item_id: string;
          batch_id: string;
          kind: 'eaten' | 'discarded';
          amount: number;
          price_amount: number | null;
          ended_on: string;
          created_by: string | null;
          created_at: string;
          undone_at: string | null;
        };
        Insert: {
          id?: string;
          household_id: string;
          fridge_item_id: string;
          batch_id: string;
          kind: 'eaten' | 'discarded';
          amount: number;
          price_amount?: number | null;
          ended_on?: string;
          created_by?: string | null;
          created_at?: string;
          undone_at?: string | null;
        };
        Update: {
          id?: string;
          household_id?: string;
          fridge_item_id?: string;
          batch_id?: string;
          kind?: 'eaten' | 'discarded';
          amount?: number;
          price_amount?: number | null;
          ended_on?: string;
          created_by?: string | null;
          created_at?: string;
          undone_at?: string | null;
        };
        Relationships: [];
      };
      dining_expenses: {
        Row: {
          id: string;
          household_id: string;
          user_id: string | null;
          date: string;
          kind: 'restaurant' | 'delivery';
          name: string | null;
          brand: string;
          store: string | null;
          price: number;
          memo: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          user_id?: string | null;
          date: string;
          kind: 'restaurant' | 'delivery';
          name?: string | null;
          brand: string;
          store?: string | null;
          price?: number;
          memo?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          user_id?: string | null;
          date?: string;
          kind?: 'restaurant' | 'delivery';
          name?: string | null;
          brand?: string;
          store?: string | null;
          price?: number;
          memo?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      fridge_items: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          brand: string | null;
          total_count: number;
          max_count: number;
          unit: 'count' | 'g' | 'kg' | 'ml' | 'l';
          is_subdivided: boolean;
          category_id: string;
          from_grocery: boolean;
          created_by: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          brand?: string | null;
          total_count?: number;
          max_count?: number;
          unit?: 'count' | 'g' | 'kg' | 'ml' | 'l';
          is_subdivided?: boolean;
          category_id?: string;
          from_grocery?: boolean;
          created_by?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          brand?: string | null;
          total_count?: number;
          max_count?: number;
          unit?: 'count' | 'g' | 'kg' | 'ml' | 'l';
          is_subdivided?: boolean;
          category_id?: string;
          from_grocery?: boolean;
          created_by?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'fridge_item_batches_fridge_item_id_fkey';
            columns: ['id'];
            isOneToOne: false;
            referencedRelation: 'fridge_item_batches';
            referencedColumns: ['fridge_item_id'];
          },
          {
            foreignKeyName: 'fridge_items_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'ingredient_categories';
            referencedColumns: ['id'];
          },
        ];
      };
      fridge_item_batches: {
        Row: {
          id: string;
          fridge_item_id: string;
          quantity: number;
          expiry_date: string | null;
          purchased_date: string;
          memo: string | null;
          created_by: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          fridge_item_id: string;
          quantity: number;
          expiry_date?: string | null;
          purchased_date?: string;
          memo?: string | null;
          created_by?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          fridge_item_id?: string;
          quantity?: number;
          expiry_date?: string | null;
          purchased_date?: string;
          memo?: string | null;
          created_by?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'fridge_item_batches_fridge_item_id_fkey';
            columns: ['fridge_item_id'];
            isOneToOne: false;
            referencedRelation: 'fridge_items';
            referencedColumns: ['id'];
          },
        ];
      };
      meals: {
        Row: {
          id: string;
          household_id: string;
          date: string;
          type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          date: string;
          type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          date?: string;
          type?: 'breakfast' | 'lunch' | 'dinner' | 'snack';
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'meals_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ];
      };
      dishes: {
        Row: {
          id: string;
          meal_id: string;
          name: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          meal_id: string;
          name?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          meal_id?: string;
          name?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'dishes_meal_id_fkey';
            columns: ['meal_id'];
            isOneToOne: false;
            referencedRelation: 'meals';
            referencedColumns: ['id'];
          },
        ];
      };
      dish_ingredients: {
        Row: {
          id: string;
          dish_id: string;
          fridge_item_id: string;
          batch_id: string | null;
          amount: number | null;
          usage_status: 'used' | 'depleted';
          consumption_mode: 'quantity' | 'toggle';
          created_at: string;
        };
        Insert: {
          id?: string;
          dish_id: string;
          fridge_item_id: string;
          batch_id?: string | null;
          amount?: number | null;
          usage_status?: 'used' | 'depleted';
          consumption_mode?: 'quantity' | 'toggle';
          created_at?: string;
        };
        Update: {
          id?: string;
          dish_id?: string;
          fridge_item_id?: string;
          batch_id?: string | null;
          amount?: number | null;
          usage_status?: 'used' | 'depleted';
          consumption_mode?: 'quantity' | 'toggle';
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'dish_ingredients_dish_id_fkey';
            columns: ['dish_id'];
            isOneToOne: false;
            referencedRelation: 'dishes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'dish_ingredients_fridge_item_id_fkey';
            columns: ['fridge_item_id'];
            isOneToOne: false;
            referencedRelation: 'fridge_items';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'dish_ingredients_batch_id_fkey';
            columns: ['batch_id'];
            isOneToOne: false;
            referencedRelation: 'fridge_item_batches';
            referencedColumns: ['id'];
          },
        ];
      };
      meal_batch_usages: {
        Row: {
          id: string;
          meal_id: string;
          fridge_item_id: string;
          batch_id: string;
          amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          meal_id: string;
          fridge_item_id: string;
          batch_id: string;
          amount?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          meal_id?: string;
          fridge_item_id?: string;
          batch_id?: string;
          amount?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          household_id: string;
          type: string;
          title: string;
          description: string;
          payload: Json;
          scheduled_at: string | null;
          sent_at: string;
          push_sent_at: string | null;
          read_at: string | null;
          status: 'pending' | 'sent' | 'read' | 'canceled';
          dedupe_key: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          household_id: string;
          type?: string;
          title: string;
          description: string;
          payload?: Json;
          scheduled_at?: string | null;
          sent_at?: string;
          push_sent_at?: string | null;
          read_at?: string | null;
          status?: 'pending' | 'sent' | 'read' | 'canceled';
          dedupe_key: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          household_id?: string;
          type?: string;
          title?: string;
          description?: string;
          payload?: Json;
          scheduled_at?: string | null;
          sent_at?: string;
          push_sent_at?: string | null;
          read_at?: string | null;
          status?: 'pending' | 'sent' | 'read' | 'canceled';
          dedupe_key?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      notification_push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          endpoint?: string;
          p256dh?: string;
          auth?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      notification_preferences: {
        Row: {
          user_id: string;
          expiry_soon_enabled: boolean;
          expiry_remind_days: number[];
          is_permission_asked: boolean;
          quiet_hours_start: string | null;
          quiet_hours_end: string | null;
          fridge_item_added_enabled: boolean;
          meal_added_enabled: boolean;
          dining_expense_added_enabled: boolean;
          budget_exceeded_enabled: boolean;
          weekly_expense_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          expiry_soon_enabled?: boolean;
          expiry_remind_days?: number[];
          is_permission_asked?: boolean;
          quiet_hours_start?: string | null;
          quiet_hours_end?: string | null;
          fridge_item_added_enabled?: boolean;
          meal_added_enabled?: boolean;
          dining_expense_added_enabled?: boolean;
          budget_exceeded_enabled?: boolean;
          weekly_expense_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          expiry_soon_enabled?: boolean;
          expiry_remind_days?: number[];
          is_permission_asked?: boolean;
          quiet_hours_start?: string | null;
          quiet_hours_end?: string | null;
          fridge_item_added_enabled?: boolean;
          meal_added_enabled?: boolean;
          dining_expense_added_enabled?: boolean;
          budget_exceeded_enabled?: boolean;
          weekly_expense_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      fridge_preferences: {
        Row: {
          user_id: string;
          hide_depleted_fridge_items: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          hide_depleted_fridge_items?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          hide_depleted_fridge_items?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      search_synonym_terms: {
        Row: {
          id: string;
          household_id: string;
          group_key: string;
          term: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          group_key: string;
          term: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          group_key?: string;
          term?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'search_synonym_terms_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ];
      };
      fridge_category_expiry_defaults: {
        Row: {
          id: string;
          household_id: string;
          category_id: string;
          default_expiry_days: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          category_id: string;
          default_expiry_days: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          category_id?: string;
          default_expiry_days?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      v_food_expenses: {
        Row: {
          id: string;
          household_id: string;
          user_id: string | null;
          kind: 'grocery' | 'restaurant' | 'delivery';
          date: string;
          name: string | null;
          brand: string | null;
          store: string | null;
          price: number;
          category_id: string | null;
          count: number | null;
          unit: 'count' | 'g' | 'kg' | 'ml' | 'l' | null;
          linked_fridge_item_id: string | null;
          linked_fridge_batch_id: string | null;
          memo: string | null;
          created_at: string;
          updated_at: string;
        };
        Relationships: [];
      };
    };
    Functions: {
      create_budget_exceeded_notifications: {
        Args: { p_household_id: string; p_year_month: string };
        Returns: number;
      };
      generate_weekly_expense_notifications: {
        Args: { p_target_date?: string };
        Returns: number;
      };
      upsert_household_budgets_guarded: {
        Args: { p_household_id: string; p_year_month: string; p_budgets: Json };
        Returns: Json;
      };
      get_food_expense_daily_series: {
        Args: { p_household_id: string; p_year_month: string };
        Returns: { year_month: string; expense_date: string; kind: string; total: number }[];
      };
      get_discarded_food_expense_summary: {
        Args: { p_household_id: string; p_year_month: string };
        Returns: { known_amount: number; unknown_count: number }[];
      };
      record_fridge_batch_end: {
        Args: { p_batch_id: string; p_kind: 'eaten' | 'discarded'; p_amount: number };
        Returns: string;
      };
      undo_fridge_batch_end_record: {
        Args: { p_record_id: string };
        Returns: undefined;
      };
      add_ingredient_with_fridge: {
        Args: {
          p_household_id: string;
          p_name: string;
          p_brand?: string | null;
          p_price?: number;
          p_store?: string | null;
          p_category_id?: string;
          p_count?: number;
          p_unit?: string;
          p_date?: string;
        };
        Returns: {
          id: string;
          household_id: string;
          user_id: string;
          date: string;
          name: string;
          brand: string | null;
          price: number;
          store: string | null;
          category_id: string;
          count: number;
          unit: 'count' | 'g' | 'kg' | 'ml' | 'l';
          linked_fridge_item_id: string | null;
          linked_fridge_batch_id: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      create_household_with_owner: {
        Args: { p_name: string };
        Returns: string;
      };
      generate_default_search_synonyms: {
        Args: { p_household_id: string };
        Returns: number;
      };
      upsert_search_synonym_guarded: {
        Args: { p_household_id: string; p_base_term: string; p_terms: string[] };
        Returns: string;
      };
      create_fridge_item_with_batch: {
        Args: {
          p_household_id: string;
          p_name: string;
          p_brand?: string | null;
          p_category_id?: string;
          p_unit?: string;
          p_is_subdivided?: boolean;
          p_from_grocery?: boolean;
          p_quantity?: number;
          p_purchased_date?: string;
          p_expiry_date?: string | null;
          p_memo?: string | null;
        };
        Returns: {
          id: string;
          household_id: string;
          name: string;
          brand: string | null;
          total_count: number;
          max_count: number;
          unit: 'count' | 'g' | 'kg' | 'ml' | 'l';
          is_subdivided: boolean;
          category_id: string;
          from_grocery: boolean;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      delete_ingredient_with_cleanup: {
        Args: { p_ingredient_id: string };
        Returns: undefined;
      };
      delete_meal_with_usage_restore: {
        Args: { p_meal_id: string };
        Returns: undefined;
      };
      delete_my_account: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      ensure_current_user_household_member: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
      deactivate_push_subscription_by_endpoint: {
        Args: { p_endpoint: string };
        Returns: boolean;
      };
      get_fridge_items_with_active_batches: {
        Args: { p_household_id: string; p_search_keywords?: string[] | null };
        Returns: Json[];
      };
      get_pending_push_notifications: {
        Args: { p_limit?: number };
        Returns: {
          notification_id: string;
          user_id: string;
          title: string;
          description: string;
          endpoint: string;
          p256dh: string;
          auth: string;
        }[];
      };
      get_invite_household: {
        Args: { invite_code: string };
        Returns: {
          household_id: string;
          household_name: string;
          expires_at: string;
          max_uses: number;
          use_count: number;
          is_valid: boolean;
        }[];
      };
      generate_expiry_soon_notifications: {
        Args: { p_target_date?: string };
        Returns: number;
      };
      join_household: {
        Args: { invite_code: string };
        Returns: string;
      };
      leave_household: {
        Args: { p_household_id: string };
        Returns: undefined;
      };
      mark_notifications_push_sent: {
        Args: { p_ids: string[] };
        Returns: number;
      };
      resolve_ingredient_category_id: {
        Args: { p_household_id: string | null; p_category_code: string };
        Returns: string;
      };
      discard_fridge_batch: {
        Args: { p_batch_id: string };
        Returns: undefined;
      };
      discard_fridge_item: {
        Args: { p_fridge_item_id: string };
        Returns: undefined;
      };
      soft_delete_fridge_item: {
        Args: { p_fridge_item_id: string };
        Returns: undefined;
      };
      soft_delete_fridge_batch: {
        Args: { p_batch_id: string };
        Returns: undefined;
      };
      soft_delete_ingredient: {
        Args: { p_ingredient_id: string };
        Returns: undefined;
      };
      update_ingredient_with_fridge: {
        Args: { p_ingredient_id: string; p_updates?: Json };
        Returns: {
          id: string;
          household_id: string;
          user_id: string;
          date: string;
          name: string;
          brand: string | null;
          price: number;
          store: string | null;
          category_id: string;
          count: number;
          unit: 'count' | 'g' | 'kg' | 'ml' | 'l';
          linked_fridge_item_id: string | null;
          linked_fridge_batch_id: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      update_fridge_item_guarded: {
        Args: { p_fridge_item_id: string; p_updates?: Json };
        Returns: {
          id: string;
          household_id: string;
          name: string;
          brand: string | null;
          total_count: number;
          max_count: number;
          unit: 'count' | 'g' | 'kg' | 'ml' | 'l';
          is_subdivided: boolean;
          category_id: string;
          from_grocery: boolean;
          created_by: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      resolve_orphan_ingredient_names: {
        Args: { p_fridge_item_ids: string[] };
        Returns: {
          id: string;
          name: string;
          unit: 'count' | 'g' | 'kg' | 'ml' | 'l';
          category_id: string;
        }[];
      };
      update_fridge_batch_guarded: {
        Args: { p_batch_id: string; p_updates?: Json };
        Returns: {
          id: string;
          fridge_item_id: string;
          quantity: number;
          expiry_date: string | null;
          purchased_date: string;
          memo: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      upsert_meal_with_usage: {
        Args: { p_household_id: string; p_date: string; p_type: string; p_dishes?: Json };
        Returns: string;
      };
      upsert_push_subscription_by_user: {
        Args: { p_user_id: string; p_endpoint: string; p_p256dh: string; p_auth: string };
        Returns: void;
      };
      move_dish_to_meal: {
        Args: {
          p_dish_id: string;
          p_target_meal_type: string;
          p_household_id: string;
          p_date: string;
        };
        Returns: void;
      };
      reorder_dishes: {
        Args: {
          p_household_id: string;
          p_updates: Json;
        };
        Returns: void;
      };
      subdivide_fridge_item: {
        Args: {
          p_source_item_id: string;
          p_consume_amount: number;
          p_new_item_name: string;
          p_new_item_quantity: number;
          p_new_expiry_date?: string | null;
        };
        Returns: {
          id: string;
          household_id: string;
          name: string;
          brand: string | null;
          total_count: number;
          max_count: number;
          unit: 'count' | 'g' | 'kg' | 'ml' | 'l';
          is_subdivided: boolean;
          category_id: string;
          from_grocery: boolean;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
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
}
