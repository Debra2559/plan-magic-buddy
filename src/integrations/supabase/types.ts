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
  public: {
    Tables: {
      ai_news: {
        Row: {
          decided_at: string | null
          discovered_at: string
          id: string
          published_at: string | null
          raw: Json | null
          source: string
          status: string
          summary: string | null
          tags: string[] | null
          title: string
          url: string
        }
        Insert: {
          decided_at?: string | null
          discovered_at?: string
          id?: string
          published_at?: string | null
          raw?: Json | null
          source: string
          status?: string
          summary?: string | null
          tags?: string[] | null
          title: string
          url: string
        }
        Update: {
          decided_at?: string | null
          discovered_at?: string
          id?: string
          published_at?: string | null
          raw?: Json | null
          source?: string
          status?: string
          summary?: string | null
          tags?: string[] | null
          title?: string
          url?: string
        }
        Relationships: []
      }
      ai_news_settings: {
        Row: {
          created_at: string
          enabled: boolean
          exclude_keywords: string[]
          id: string
          include_keywords: string[]
          last_scan_result: Json | null
          last_scanned_at: string | null
          per_source_limit: number
          scan_interval_hours: number
          sources: Json
          tag_filters: string[]
          time_window: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          exclude_keywords?: string[]
          id?: string
          include_keywords?: string[]
          last_scan_result?: Json | null
          last_scanned_at?: string | null
          per_source_limit?: number
          scan_interval_hours?: number
          sources?: Json
          tag_filters?: string[]
          time_window?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          exclude_keywords?: string[]
          id?: string
          include_keywords?: string[]
          last_scan_result?: Json | null
          last_scanned_at?: string | null
          per_source_limit?: number
          scan_interval_hours?: number
          sources?: Json
          tag_filters?: string[]
          time_window?: string
          updated_at?: string
        }
        Relationships: []
      }
      daily_recaps: {
        Row: {
          created_at: string
          date: string
          diary: string | null
          id: string
          mood: string | null
          source: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          diary?: string | null
          id?: string
          mood?: string | null
          source?: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          diary?: string | null
          id?: string
          mood?: string | null
          source?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      feishu_event_map: {
        Row: {
          calendar_id: string
          feishu_event_id: string
          id: string
          last_pushed_at: string
          local_id: string
        }
        Insert: {
          calendar_id: string
          feishu_event_id: string
          id?: string
          last_pushed_at?: string
          local_id: string
        }
        Update: {
          calendar_id?: string
          feishu_event_id?: string
          id?: string
          last_pushed_at?: string
          local_id?: string
        }
        Relationships: []
      }
      feishu_settings: {
        Row: {
          created_at: string
          daily_recap_done_dates: string[]
          daily_recap_enabled: boolean
          daily_recap_hour: number
          daily_recap_last_followup_date: string | null
          daily_recap_last_sent_date: string | null
          daily_recap_timezone: string
          direction: string
          id: string
          last_sync_at: string | null
          notify_on_accept: boolean
          notify_on_discover: boolean
          notify_receive_id: string | null
          notify_receive_id_type: string
          page_token: string | null
          selected_calendar_id: string | null
          selected_calendar_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          daily_recap_done_dates?: string[]
          daily_recap_enabled?: boolean
          daily_recap_hour?: number
          daily_recap_last_followup_date?: string | null
          daily_recap_last_sent_date?: string | null
          daily_recap_timezone?: string
          direction?: string
          id?: string
          last_sync_at?: string | null
          notify_on_accept?: boolean
          notify_on_discover?: boolean
          notify_receive_id?: string | null
          notify_receive_id_type?: string
          page_token?: string | null
          selected_calendar_id?: string | null
          selected_calendar_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          daily_recap_done_dates?: string[]
          daily_recap_enabled?: boolean
          daily_recap_hour?: number
          daily_recap_last_followup_date?: string | null
          daily_recap_last_sent_date?: string | null
          daily_recap_timezone?: string
          direction?: string
          id?: string
          last_sync_at?: string | null
          notify_on_accept?: boolean
          notify_on_discover?: boolean
          notify_receive_id?: string | null
          notify_receive_id_type?: string
          page_token?: string | null
          selected_calendar_id?: string | null
          selected_calendar_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      feishu_webhook_dedup: {
        Row: {
          received_at: string
          uuid: string
        }
        Insert: {
          received_at?: string
          uuid: string
        }
        Update: {
          received_at?: string
          uuid?: string
        }
        Relationships: []
      }
      hackathon_settings: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          last_scan_result: Json | null
          last_scanned_at: string | null
          scan_interval_hours: number
          sources: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          last_scan_result?: Json | null
          last_scanned_at?: string | null
          scan_interval_hours?: number
          sources?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          last_scan_result?: Json | null
          last_scanned_at?: string | null
          scan_interval_hours?: number
          sources?: Json
          updated_at?: string
        }
        Relationships: []
      }
      hackathons: {
        Row: {
          deadline: string | null
          decided_at: string | null
          discovered_at: string
          id: string
          location: string | null
          prize: string | null
          raw: Json | null
          source: string
          starts_at: string | null
          status: string
          summary: string | null
          tags: string[] | null
          title: string
          url: string
        }
        Insert: {
          deadline?: string | null
          decided_at?: string | null
          discovered_at?: string
          id?: string
          location?: string | null
          prize?: string | null
          raw?: Json | null
          source: string
          starts_at?: string | null
          status?: string
          summary?: string | null
          tags?: string[] | null
          title: string
          url: string
        }
        Update: {
          deadline?: string | null
          decided_at?: string | null
          discovered_at?: string
          id?: string
          location?: string | null
          prize?: string | null
          raw?: Json | null
          source?: string
          starts_at?: string | null
          status?: string
          summary?: string | null
          tags?: string[] | null
          title?: string
          url?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
