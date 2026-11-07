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
      graphql: { Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json }; Returns: Json };
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
      expense_revisions: {
        Row: {
          before: NonNullable<Json>;
          created_at: string;
          edited_by: string;
          expense_id: string;
          id: string;
        };
        ComputedFields: never;
        Insert: {
          before: NonNullable<Json>;
          created_at?: string;
          edited_by: string;
          expense_id: string;
          id?: string;
        };
        Update: {
          before?: NonNullable<Json>;
          created_at?: string;
          edited_by?: string;
          expense_id?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'expense_revisions_edited_by_fkey';
            columns: ['edited_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'expense_revisions_expense_id_fkey';
            columns: ['expense_id'];
            isOneToOne: false;
            referencedRelation: 'expenses';
            referencedColumns: ['id'];
          },
        ];
      };
      expense_splits: {
        Row: {
          amount_cents: number;
          expense_id: string;
          user_id: string;
          weight: number | null;
        };
        ComputedFields: never;
        Insert: {
          amount_cents: number;
          expense_id: string;
          user_id: string;
          weight?: number | null;
        };
        Update: {
          amount_cents?: number;
          expense_id?: string;
          user_id?: string;
          weight?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'expense_splits_expense_id_fkey';
            columns: ['expense_id'];
            isOneToOne: false;
            referencedRelation: 'expenses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'expense_splits_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      expenses: {
        Row: {
          amount_cents: number;
          created_at: string;
          created_by: string;
          deleted_at: string | null;
          description: string;
          group_id: string;
          id: string;
          notes: string | null;
          occurred_at: string;
          payer_id: string;
          receipt_path: string | null;
          split_method: Database['public']['Enums']['split_method'];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          amount_cents: number;
          created_at?: string;
          created_by: string;
          deleted_at?: string | null;
          description: string;
          group_id: string;
          id?: string;
          notes?: string | null;
          occurred_at?: string;
          payer_id: string;
          receipt_path?: string | null;
          split_method: Database['public']['Enums']['split_method'];
          updated_at?: string;
        };
        Update: {
          amount_cents?: number;
          created_at?: string;
          created_by?: string;
          deleted_at?: string | null;
          description?: string;
          group_id?: string;
          id?: string;
          notes?: string | null;
          occurred_at?: string;
          payer_id?: string;
          receipt_path?: string | null;
          split_method?: Database['public']['Enums']['split_method'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'expenses_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'expenses_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'expenses_payer_id_fkey';
            columns: ['payer_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      group_invites: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          created_at: string;
          expires_at: string;
          group_id: string;
          guest_id: string | null;
          id: string;
          invited_by: string;
          token: string;
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          expires_at?: string;
          group_id: string;
          guest_id?: string | null;
          id?: string;
          invited_by: string;
          token?: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          expires_at?: string;
          group_id?: string;
          guest_id?: string | null;
          id?: string;
          invited_by?: string;
          token?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'group_invites_accepted_by_fkey';
            columns: ['accepted_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'group_invites_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'group_invites_guest_id_fkey';
            columns: ['guest_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'group_invites_invited_by_fkey';
            columns: ['invited_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      group_members: {
        Row: {
          group_id: string;
          joined_at: string;
          left_at: string | null;
          role: Database['public']['Enums']['group_role'];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          group_id: string;
          joined_at?: string;
          left_at?: string | null;
          role?: Database['public']['Enums']['group_role'];
          user_id: string;
        };
        Update: {
          group_id?: string;
          joined_at?: string;
          left_at?: string | null;
          role?: Database['public']['Enums']['group_role'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'group_members_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'group_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      groups: {
        Row: {
          archived_at: string | null;
          created_at: string;
          created_by: string;
          currency: string;
          icon: string | null;
          id: string;
          name: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          created_by: string;
          currency: string;
          icon?: string | null;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          created_by?: string;
          currency?: string;
          icon?: string | null;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'groups_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      payment_methods: {
        Row: {
          account_name: string | null;
          created_at: string;
          id: string;
          kind: string;
          payid_type: string;
          updated_at: string;
          user_id: string;
          value: string;
        };
        ComputedFields: never;
        Insert: {
          account_name?: string | null;
          created_at?: string;
          id?: string;
          kind: string;
          payid_type: string;
          updated_at?: string;
          user_id: string;
          value: string;
        };
        Update: {
          account_name?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          payid_type?: string;
          updated_at?: string;
          user_id?: string;
          value?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payment_methods_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          claimed_at: string | null;
          claimed_by: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          currency_chosen: boolean;
          guest_group_id: string | null;
          id: string;
          is_guest: boolean;
          name: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          avatar_url?: string | null;
          claimed_at?: string | null;
          claimed_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          currency_chosen?: boolean;
          guest_group_id?: string | null;
          id: string;
          is_guest?: boolean;
          name: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          claimed_at?: string | null;
          claimed_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          currency_chosen?: boolean;
          guest_group_id?: string | null;
          id?: string;
          is_guest?: boolean;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_claimed_by_fkey';
            columns: ['claimed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'profiles_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'profiles_guest_group_id_fkey';
            columns: ['guest_group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
        ];
      };
      settlements: {
        Row: {
          amount_cents: number;
          created_at: string;
          created_by: string;
          from_user_id: string;
          group_id: string;
          id: string;
          note: string | null;
          occurred_at: string;
          replaces_id: string | null;
          status: Database['public']['Enums']['settlement_status'];
          to_user_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount_cents: number;
          created_at?: string;
          created_by: string;
          from_user_id: string;
          group_id: string;
          id?: string;
          note?: string | null;
          occurred_at?: string;
          replaces_id?: string | null;
          status?: Database['public']['Enums']['settlement_status'];
          to_user_id: string;
        };
        Update: {
          amount_cents?: number;
          created_at?: string;
          created_by?: string;
          from_user_id?: string;
          group_id?: string;
          id?: string;
          note?: string | null;
          occurred_at?: string;
          replaces_id?: string | null;
          status?: Database['public']['Enums']['settlement_status'];
          to_user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'settlements_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'settlements_from_user_id_fkey';
            columns: ['from_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'settlements_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'settlements_replaces_id_fkey';
            columns: ['replaces_id'];
            isOneToOne: false;
            referencedRelation: 'settlements';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'settlements_to_user_id_fkey';
            columns: ['to_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_invite: { Args: { p_token: string }; Returns: string };
      add_guest: { Args: { p_group_id: string; p_name: string }; Returns: string };
      add_members: { Args: { p_group_id: string; p_user_ids: string[] }; Returns: undefined };
      can_see_expense: { Args: { p_created_by: string; p_group_id: string }; Returns: boolean };
      can_see_settlement: { Args: { p_created_by: string; p_from: string; p_group_id: string; p_to: string }; Returns: boolean };
      correct_settlement: {
        Args: { p_amount_cents: number; p_note?: string; p_occurred_at?: string; p_settlement_id: string };
        Returns: string;
      };
      create_expense: {
        Args: {
          p_amount_cents: number;
          p_description: string;
          p_group_id: string;
          p_notes?: string;
          p_occurred_at?: string;
          p_payer_id: string;
          p_split_method: Database['public']['Enums']['split_method'];
          p_splits: Json;
        };
        Returns: string;
      };
      create_group: {
        Args: { p_currency: string; p_icon?: string; p_name: string };
        Returns: {
          archived_at: string | null;
          created_at: string;
          created_by: string;
          currency: string;
          icon: string | null;
          id: string;
          name: string;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'groups';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_invite: { Args: { p_group_id: string; p_guest_id?: string }; Returns: string };
      delete_expense: { Args: { p_expense_id: string }; Returns: undefined };
      delete_group: { Args: { p_group_id: string }; Returns: undefined };
      expense_snapshot: { Args: { p_expense_id: string }; Returns: Json };
      group_balances: {
        Args: { p_group_id: string };
        Returns: {
          balance_cents: number;
          user_id: string;
        }[];
      };
      group_role_of: { Args: { p_group_id: string; p_user_id: string }; Returns: Database['public']['Enums']['group_role'] };
      is_group_member: { Args: { p_group_id: string }; Returns: boolean };
      is_group_owner: { Args: { p_group_id: string }; Returns: boolean };
      is_member_of: { Args: { p_group_id: string; p_user_id: string }; Returns: boolean };
      is_valid_abn: { Args: { p_abn: string }; Returns: boolean };
      leave_group: { Args: { p_group_id: string }; Returns: undefined };
      member_net_balance: { Args: { p_group_id: string; p_user_id: string }; Returns: number };
      mark_notifications_read: { Args: Record<PropertyKey, never>; Returns: undefined };
      my_group_summaries: { Args: Record<PropertyKey, never>; Returns: Json };
      my_notifications: {
        Args: Record<PropertyKey, never>;
        Returns: {
          actor_name: string | null;
          created_at: string;
          group_icon: string | null;
          group_id: string;
          group_name: string;
          id: string;
          kind: string;
          read_at: string | null;
        }[];
      };
      record_settlement: {
        Args: {
          p_amount_cents: number;
          p_from_user_id: string;
          p_group_id: string;
          p_note?: string;
          p_occurred_at?: string;
          p_to_user_id: string;
        };
        Returns: string;
      };
      remove_member: { Args: { p_group_id: string; p_user_id: string }; Returns: undefined };
      remove_payid: { Args: Record<PropertyKey, never>; Returns: undefined };
      require_user: { Args: Record<PropertyKey, never>; Returns: string };
      set_group_icon: { Args: { p_group_id: string; p_icon: string }; Returns: undefined };
      set_payid: { Args: { p_account_name?: string; p_type: string; p_value: string }; Returns: undefined };
      shares_group_with: { Args: { p_user_id: string }; Returns: boolean };
      simplified_transfers: {
        Args: { p_group_id: string };
        Returns: {
          amount_cents: number;
          from_user_id: string;
          to_user_id: string;
        }[];
      };
      split_partners: {
        Args: Record<PropertyKey, never>;
        Returns: {
          last_shared_at: string;
          name: string;
          shared_groups: number;
          user_id: string;
        }[];
      };
      transfer_ownership: { Args: { p_group_id: string; p_new_owner_id: string }; Returns: undefined };
      update_expense: {
        Args: {
          p_amount_cents: number;
          p_description: string;
          p_expense_id: string;
          p_notes?: string;
          p_occurred_at: string;
          p_payer_id: string;
          p_split_method: Database['public']['Enums']['split_method'];
          p_splits: Json;
        };
        Returns: undefined;
      };
      validate_splits: { Args: { p_amount_cents: number; p_group_id: string; p_splits: Json }; Returns: undefined };
      void_settlement: { Args: { p_settlement_id: string }; Returns: undefined };
    };
    Enums: {
      group_role: 'owner' | 'admin' | 'member';
      settlement_status: 'recorded' | 'voided';
      split_method: 'equal' | 'exact' | 'percentage' | 'shares';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema['Tables'] & DefaultSchema['Views']) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      group_role: ['owner', 'admin', 'member'],
      settlement_status: ['recorded', 'voided'],
      split_method: ['equal', 'exact', 'percentage', 'shares'],
    },
  },
} as const;
