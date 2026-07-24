export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      account_deletion_requests: {
        Row: {
          cancelled_at: string | null
          completed_at: string | null
          error_code: string | null
          execute_after: string
          id: string
          profile_id: string
          requested_at: string
          society_id: string
          status: string
        }
        Insert: {
          cancelled_at?: string | null
          completed_at?: string | null
          error_code?: string | null
          execute_after: string
          id?: string
          profile_id: string
          requested_at?: string
          society_id: string
          status: string
        }
        Update: {
          cancelled_at?: string | null
          completed_at?: string | null
          error_code?: string | null
          execute_after?: string
          id?: string
          profile_id?: string
          requested_at?: string
          society_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_deletion_requests_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_events: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          after_state: Json | null
          before_state: Json | null
          correlation_id: string
          created_at: string
          id: string
          society_id: string
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          after_state?: Json | null
          before_state?: Json | null
          correlation_id: string
          created_at?: string
          id?: string
          society_id: string
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          after_state?: Json | null
          before_state?: Json | null
          correlation_id?: string
          created_at?: string
          id?: string
          society_id?: string
          target_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_events_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_capabilities: {
        Row: {
          capability: string
          created_at: string
          granted_by: string | null
          profile_id: string
          society_id: string
        }
        Insert: {
          capability: string
          created_at?: string
          granted_by?: string | null
          profile_id: string
          society_id: string
        }
        Update: {
          capability?: string
          created_at?: string
          granted_by?: string | null
          profile_id?: string
          society_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_capabilities_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_capabilities_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_capabilities_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_export_jobs: {
        Row: {
          actor_id: string
          artifact_id: string | null
          completed_at: string | null
          created_at: string
          error_code: string | null
          filters: Json
          format: string
          id: string
          society_id: string
          status: string
        }
        Insert: {
          actor_id: string
          artifact_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          filters?: Json
          format: string
          id?: string
          society_id: string
          status: string
        }
        Update: {
          actor_id?: string
          artifact_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          filters?: Json
          format?: string
          id?: string
          society_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_export_jobs_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "export_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_export_jobs_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      amenities: {
        Row: {
          blackout_dates: string[]
          cancellation_cutoff_minutes: number
          capacity: number
          checkin_grace_minutes: number
          close_time: string
          description: string | null
          id: string
          is_active: boolean
          late_cancel_penalty: number
          name: string
          no_show_penalty: number
          open_time: string
          price: number
          requires_approval: boolean
          rules: string | null
          slot_minutes: number
          society_id: string
        }
        Insert: {
          blackout_dates?: string[]
          cancellation_cutoff_minutes?: number
          capacity?: number
          checkin_grace_minutes?: number
          close_time?: string
          description?: string | null
          id?: string
          is_active?: boolean
          late_cancel_penalty?: number
          name: string
          no_show_penalty?: number
          open_time?: string
          price?: number
          requires_approval?: boolean
          rules?: string | null
          slot_minutes?: number
          society_id: string
        }
        Update: {
          blackout_dates?: string[]
          cancellation_cutoff_minutes?: number
          capacity?: number
          checkin_grace_minutes?: number
          close_time?: string
          description?: string | null
          id?: string
          is_active?: boolean
          late_cancel_penalty?: number
          name?: string
          no_show_penalty?: number
          open_time?: string
          price?: number
          requires_approval?: boolean
          rules?: string | null
          slot_minutes?: number
          society_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "amenities_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      amenity_booking_events: {
        Row: {
          actor_id: string | null
          booking_id: string
          created_at: string
          from_status: string | null
          id: string
          reason: string | null
          to_status: string
        }
        Insert: {
          actor_id?: string | null
          booking_id: string
          created_at?: string
          from_status?: string | null
          id?: string
          reason?: string | null
          to_status: string
        }
        Update: {
          actor_id?: string | null
          booking_id?: string
          created_at?: string
          from_status?: string | null
          id?: string
          reason?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "amenity_booking_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amenity_booking_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "amenity_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      amenity_bookings: {
        Row: {
          access_code: string | null
          amenity_id: string
          booked_by: string
          checked_in_at: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          ends_at: string
          flat_id: string
          id: string
          paid_at: string | null
          payment_amount: number | null
          payment_id: string | null
          payment_order_id: string | null
          series_id: string | null
          starts_at: string
          status: string
        }
        Insert: {
          access_code?: string | null
          amenity_id: string
          booked_by: string
          checked_in_at?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          ends_at: string
          flat_id: string
          id?: string
          paid_at?: string | null
          payment_amount?: number | null
          payment_id?: string | null
          payment_order_id?: string | null
          series_id?: string | null
          starts_at: string
          status?: string
        }
        Update: {
          access_code?: string | null
          amenity_id?: string
          booked_by?: string
          checked_in_at?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          ends_at?: string
          flat_id?: string
          id?: string
          paid_at?: string | null
          payment_amount?: number | null
          payment_id?: string | null
          payment_order_id?: string | null
          series_id?: string | null
          starts_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "amenity_bookings_amenity_id_fkey"
            columns: ["amenity_id"]
            isOneToOne: false
            referencedRelation: "amenities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amenity_bookings_booked_by_fkey"
            columns: ["booked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amenity_bookings_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amenity_bookings_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amenity_bookings_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "amenity_recurring_series"
            referencedColumns: ["id"]
          },
        ]
      }
      amenity_penalties: {
        Row: {
          amount: number
          booking_id: string | null
          created_at: string
          flat_id: string
          id: string
          kind: string
          note: string | null
          society_id: string
          status: string
        }
        Insert: {
          amount: number
          booking_id?: string | null
          created_at?: string
          flat_id: string
          id?: string
          kind: string
          note?: string | null
          society_id: string
          status?: string
        }
        Update: {
          amount?: number
          booking_id?: string | null
          created_at?: string
          flat_id?: string
          id?: string
          kind?: string
          note?: string | null
          society_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "amenity_penalties_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "amenity_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amenity_penalties_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amenity_penalties_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      amenity_recurring_series: {
        Row: {
          amenity_id: string
          booked_by: string
          created_at: string
          flat_id: string
          id: string
          slot_minutes: number
          society_id: string
          start_minute: number
          status: string
          weekday: number
          weeks: number
        }
        Insert: {
          amenity_id: string
          booked_by: string
          created_at?: string
          flat_id: string
          id?: string
          slot_minutes: number
          society_id: string
          start_minute: number
          status?: string
          weekday: number
          weeks: number
        }
        Update: {
          amenity_id?: string
          booked_by?: string
          created_at?: string
          flat_id?: string
          id?: string
          slot_minutes?: number
          society_id?: string
          start_minute?: number
          status?: string
          weekday?: number
          weeks?: number
        }
        Relationships: [
          {
            foreignKeyName: "amenity_recurring_series_amenity_id_fkey"
            columns: ["amenity_id"]
            isOneToOne: false
            referencedRelation: "amenities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amenity_recurring_series_booked_by_fkey"
            columns: ["booked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amenity_recurring_series_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amenity_recurring_series_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      amenity_waitlist: {
        Row: {
          amenity_id: string
          created_at: string
          ends_at: string
          flat_id: string
          id: string
          promoted_booking_id: string | null
          requested_by: string
          society_id: string
          starts_at: string
          status: string
        }
        Insert: {
          amenity_id: string
          created_at?: string
          ends_at: string
          flat_id: string
          id?: string
          promoted_booking_id?: string | null
          requested_by: string
          society_id: string
          starts_at: string
          status?: string
        }
        Update: {
          amenity_id?: string
          created_at?: string
          ends_at?: string
          flat_id?: string
          id?: string
          promoted_booking_id?: string | null
          requested_by?: string
          society_id?: string
          starts_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "amenity_waitlist_amenity_id_fkey"
            columns: ["amenity_id"]
            isOneToOne: false
            referencedRelation: "amenities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amenity_waitlist_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amenity_waitlist_promoted_booking_id_fkey"
            columns: ["promoted_booking_id"]
            isOneToOne: false
            referencedRelation: "amenity_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amenity_waitlist_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amenity_waitlist_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      carpool_claims: {
        Row: {
          created_at: string
          flat_id: string
          id: string
          ride_id: string
          rider_id: string
          seats: number
          society_id: string
          status: string
        }
        Insert: {
          created_at?: string
          flat_id: string
          id?: string
          ride_id: string
          rider_id: string
          seats?: number
          society_id: string
          status?: string
        }
        Update: {
          created_at?: string
          flat_id?: string
          id?: string
          ride_id?: string
          rider_id?: string
          seats?: number
          society_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "carpool_claims_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carpool_claims_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "carpool_rides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carpool_claims_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carpool_claims_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      carpool_rides: {
        Row: {
          created_at: string
          created_by: string
          depart_at: string
          destination: string
          flat_id: string | null
          id: string
          notes: string | null
          origin: string
          seats_taken: number
          seats_total: number
          society_id: string
          status: string
          vehicle_label: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          depart_at: string
          destination: string
          flat_id?: string | null
          id?: string
          notes?: string | null
          origin: string
          seats_taken?: number
          seats_total: number
          society_id: string
          status?: string
          vehicle_label?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          depart_at?: string
          destination?: string
          flat_id?: string | null
          id?: string
          notes?: string | null
          origin?: string
          seats_taken?: number
          seats_total?: number
          society_id?: string
          status?: string
          vehicle_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "carpool_rides_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carpool_rides_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carpool_rides_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      cctv_cameras: {
        Row: {
          created_at: string
          created_by: string
          gate_id: string | null
          id: string
          is_active: boolean
          name: string
          society_id: string
          stream_kind: string
          stream_url: string
        }
        Insert: {
          created_at?: string
          created_by: string
          gate_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          society_id: string
          stream_kind?: string
          stream_url: string
        }
        Update: {
          created_at?: string
          created_by?: string
          gate_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          society_id?: string
          stream_kind?: string
          stream_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "cctv_cameras_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cctv_cameras_gate_id_fkey"
            columns: ["gate_id"]
            isOneToOne: false
            referencedRelation: "gates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cctv_cameras_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      cleanup_job_runs: {
        Row: {
          affected_count: number
          completed_at: string
          dry_run: boolean
          evidence: Json
          id: string
          job_type: string
          scanned_count: number
          started_at: string
        }
        Insert: {
          affected_count: number
          completed_at?: string
          dry_run: boolean
          evidence?: Json
          id?: string
          job_type: string
          scanned_count: number
          started_at?: string
        }
        Update: {
          affected_count?: number
          completed_at?: string
          dry_run?: boolean
          evidence?: Json
          id?: string
          job_type?: string
          scanned_count?: number
          started_at?: string
        }
        Relationships: []
      }
      communication_dispatches: {
        Row: {
          dispatched_at: string
          entity_id: string
          entity_type: string
        }
        Insert: {
          dispatched_at?: string
          entity_id: string
          entity_type: string
        }
        Update: {
          dispatched_at?: string
          entity_id?: string
          entity_type?: string
        }
        Relationships: []
      }
      delivery_partner_keys: {
        Row: {
          created_at: string
          created_by: string | null
          hmac_secret: string
          id: string
          is_active: boolean
          label: string | null
          partner_slug: string
          society_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          hmac_secret: string
          id?: string
          is_active?: boolean
          label?: string | null
          partner_slug: string
          society_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          hmac_secret?: string
          id?: string
          is_active?: boolean
          label?: string | null
          partner_slug?: string
          society_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_partner_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_partner_keys_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      domestic_attendance: {
        Row: {
          checked_in_at: string
          checked_in_by: string | null
          checked_out_at: string | null
          checked_out_by: string | null
          created_at: string
          flat_id: string
          helper_id: string
          id: string
          method: string
          society_id: string
        }
        Insert: {
          checked_in_at?: string
          checked_in_by?: string | null
          checked_out_at?: string | null
          checked_out_by?: string | null
          created_at?: string
          flat_id: string
          helper_id: string
          id?: string
          method?: string
          society_id: string
        }
        Update: {
          checked_in_at?: string
          checked_in_by?: string | null
          checked_out_at?: string | null
          checked_out_by?: string | null
          created_at?: string
          flat_id?: string
          helper_id?: string
          id?: string
          method?: string
          society_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "domestic_attendance_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domestic_attendance_checked_out_by_fkey"
            columns: ["checked_out_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domestic_attendance_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domestic_attendance_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "domestic_helpers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domestic_attendance_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      domestic_helpers: {
        Row: {
          checkin_code: string
          created_at: string
          created_by: string
          flat_id: string
          id: string
          is_active: boolean
          name: string
          phone: string | null
          role: string
          society_id: string
        }
        Insert: {
          checkin_code: string
          created_at?: string
          created_by: string
          flat_id: string
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          role?: string
          society_id: string
        }
        Update: {
          checkin_code?: string
          created_at?: string
          created_by?: string
          flat_id?: string
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          role?: string
          society_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "domestic_helpers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domestic_helpers_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domestic_helpers_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      event_rsvps: {
        Row: {
          created_at: string
          event_id: string
          flat_id: string | null
          id: string
          profile_id: string
          response: string
          society_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          flat_id?: string | null
          id?: string
          profile_id: string
          response: string
          society_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          flat_id?: string | null
          id?: string
          profile_id?: string
          response?: string
          society_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "society_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_rsvps_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_rsvps_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_rsvps_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      export_artifacts: {
        Row: {
          byte_size: number | null
          completed_at: string | null
          created_at: string
          error_code: string | null
          expires_at: string | null
          id: string
          kind: string
          owner_id: string | null
          sha256: string | null
          society_id: string
          status: string
          storage_path: string | null
        }
        Insert: {
          byte_size?: number | null
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          expires_at?: string | null
          id?: string
          kind: string
          owner_id?: string | null
          sha256?: string | null
          society_id: string
          status: string
          storage_path?: string | null
        }
        Update: {
          byte_size?: number | null
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          owner_id?: string | null
          sha256?: string | null
          society_id?: string
          status?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "export_artifacts_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      favorite_visitors: {
        Row: {
          created_at: string
          created_by: string
          flat_id: string
          id: string
          name: string
          phone: string | null
          society_id: string
          type: string
          vehicle_no: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          flat_id: string
          id?: string
          name: string
          phone?: string | null
          society_id: string
          type: string
          vehicle_no?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          flat_id?: string
          id?: string
          name?: string
          phone?: string | null
          society_id?: string
          type?: string
          vehicle_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "favorite_visitors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorite_visitors_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorite_visitors_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      flat_defaulter_flags: {
        Row: {
          cleared_at: string | null
          due_id: string | null
          flagged_at: string
          flat_id: string
          id: string
          period: string
          reason: string
          society_id: string
        }
        Insert: {
          cleared_at?: string | null
          due_id?: string | null
          flagged_at?: string
          flat_id: string
          id?: string
          period: string
          reason?: string
          society_id: string
        }
        Update: {
          cleared_at?: string | null
          due_id?: string | null
          flagged_at?: string
          flat_id?: string
          id?: string
          period?: string
          reason?: string
          society_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flat_defaulter_flags_due_id_fkey"
            columns: ["due_id"]
            isOneToOne: false
            referencedRelation: "maintenance_dues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flat_defaulter_flags_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flat_defaulter_flags_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      flat_import_jobs: {
        Row: {
          actor_id: string
          all_or_nothing: boolean
          completed_at: string
          created_at: string
          dry_run: boolean
          failure_count: number
          id: string
          idempotency_key: string
          report: Json
          row_count: number
          society_id: string
          status: string
          success_count: number
        }
        Insert: {
          actor_id: string
          all_or_nothing: boolean
          completed_at?: string
          created_at?: string
          dry_run: boolean
          failure_count: number
          id?: string
          idempotency_key: string
          report: Json
          row_count: number
          society_id: string
          status: string
          success_count: number
        }
        Update: {
          actor_id?: string
          all_or_nothing?: boolean
          completed_at?: string
          created_at?: string
          dry_run?: boolean
          failure_count?: number
          id?: string
          idempotency_key?: string
          report?: Json
          row_count?: number
          society_id?: string
          status?: string
          success_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "flat_import_jobs_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      flats: {
        Row: {
          id: string
          number: string
          occupancy_status: string
          settings: Json
          society_id: string
          tower_id: string
        }
        Insert: {
          id?: string
          number: string
          occupancy_status?: string
          settings?: Json
          society_id: string
          tower_id: string
        }
        Update: {
          id?: string
          number?: string
          occupancy_status?: string
          settings?: Json
          society_id?: string
          tower_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flats_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flats_tower_id_fkey"
            columns: ["tower_id"]
            isOneToOne: false
            referencedRelation: "towers"
            referencedColumns: ["id"]
          },
        ]
      }
      gate_audit_events: {
        Row: {
          actor_id: string
          created_at: string
          event_type: string
          gate_log_id: string
          id: string
          reason: string
          society_id: string
          visitor_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          event_type: string
          gate_log_id: string
          id?: string
          reason: string
          society_id: string
          visitor_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          event_type?: string
          gate_log_id?: string
          id?: string
          reason?: string
          society_id?: string
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gate_audit_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_audit_events_gate_log_id_fkey"
            columns: ["gate_log_id"]
            isOneToOne: true
            referencedRelation: "gate_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_audit_events_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_audit_events_visitor_id_fkey"
            columns: ["visitor_id"]
            isOneToOne: false
            referencedRelation: "visitors"
            referencedColumns: ["id"]
          },
        ]
      }
      gate_code_attempts: {
        Row: {
          attempted_at: string
          guard_id: string
          id: string
          success: boolean
        }
        Insert: {
          attempted_at?: string
          guard_id: string
          id?: string
          success: boolean
        }
        Update: {
          attempted_at?: string
          guard_id?: string
          id?: string
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "gate_code_attempts_guard_id_fkey"
            columns: ["guard_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gate_iot_devices: {
        Row: {
          created_at: string
          created_by: string
          external_id: string | null
          gate_id: string
          id: string
          is_active: boolean
          label: string
          last_status: string
          last_status_at: string | null
          provider: string
          society_id: string
          webhook_url: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          external_id?: string | null
          gate_id: string
          id?: string
          is_active?: boolean
          label: string
          last_status?: string
          last_status_at?: string | null
          provider: string
          society_id: string
          webhook_url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          external_id?: string | null
          gate_id?: string
          id?: string
          is_active?: boolean
          label?: string
          last_status?: string
          last_status_at?: string | null
          provider?: string
          society_id?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gate_iot_devices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_iot_devices_gate_id_fkey"
            columns: ["gate_id"]
            isOneToOne: true
            referencedRelation: "gates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_iot_devices_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      gate_logs: {
        Row: {
          entry_at: string
          entry_guard_id: string | null
          exit_at: string | null
          exit_guard_id: string | null
          expected_exit_at: string | null
          id: string
          method: string
          override_reason: string | null
          visitor_id: string
        }
        Insert: {
          entry_at: string
          entry_guard_id?: string | null
          exit_at?: string | null
          exit_guard_id?: string | null
          expected_exit_at?: string | null
          id?: string
          method?: string
          override_reason?: string | null
          visitor_id: string
        }
        Update: {
          entry_at?: string
          entry_guard_id?: string | null
          exit_at?: string | null
          exit_guard_id?: string | null
          expected_exit_at?: string | null
          id?: string
          method?: string
          override_reason?: string | null
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gate_logs_entry_guard_id_fkey"
            columns: ["entry_guard_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_logs_exit_guard_id_fkey"
            columns: ["exit_guard_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_logs_visitor_id_fkey"
            columns: ["visitor_id"]
            isOneToOne: false
            referencedRelation: "visitors"
            referencedColumns: ["id"]
          },
        ]
      }
      gate_open_commands: {
        Row: {
          completed_at: string | null
          created_at: string
          device_id: string
          gate_id: string
          id: string
          provider_response: string | null
          reason: string
          requested_by: string
          society_id: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          device_id: string
          gate_id: string
          id?: string
          provider_response?: string | null
          reason: string
          requested_by: string
          society_id: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          device_id?: string
          gate_id?: string
          id?: string
          provider_response?: string | null
          reason?: string
          requested_by?: string
          society_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "gate_open_commands_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "gate_iot_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_open_commands_gate_id_fkey"
            columns: ["gate_id"]
            isOneToOne: false
            referencedRelation: "gates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_open_commands_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_open_commands_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      gate_operations: {
        Row: {
          actor_id: string
          completed_at: string | null
          created_at: string
          id: string
          idempotency_key: string
          operation: string
          result: Json | null
          society_id: string
        }
        Insert: {
          actor_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          operation: string
          result?: Json | null
          society_id: string
        }
        Update: {
          actor_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          operation?: string
          result?: Json | null
          society_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gate_operations_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_operations_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      gates: {
        Row: {
          id: string
          is_active: boolean
          name: string
          society_id: string
        }
        Insert: {
          id?: string
          is_active?: boolean
          name: string
          society_id: string
        }
        Update: {
          id?: string
          is_active?: boolean
          name?: string
          society_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gates_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      group_passes: {
        Row: {
          code: string
          created_at: string
          created_by: string
          flat_id: string
          id: string
          label: string
          max_uses: number
          society_id: string
          type: string
          uses: number
          valid_from: string
          valid_to: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          flat_id: string
          id?: string
          label: string
          max_uses: number
          society_id: string
          type?: string
          uses?: number
          valid_from: string
          valid_to: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          flat_id?: string
          id?: string
          label?: string
          max_uses?: number
          society_id?: string
          type?: string
          uses?: number
          valid_from?: string
          valid_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_passes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_passes_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_passes_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      guard_device_sessions: {
        Row: {
          created_at: string
          device_id: string
          device_name: string | null
          gate_id: string | null
          guard_id: string
          id: string
          last_seen_at: string
          push_token: string | null
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          society_id: string
          status: string
        }
        Insert: {
          created_at?: string
          device_id: string
          device_name?: string | null
          gate_id?: string | null
          guard_id: string
          id?: string
          last_seen_at?: string
          push_token?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          society_id: string
          status?: string
        }
        Update: {
          created_at?: string
          device_id?: string
          device_name?: string | null
          gate_id?: string | null
          guard_id?: string
          id?: string
          last_seen_at?: string
          push_token?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          society_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "guard_device_sessions_gate_id_fkey"
            columns: ["gate_id"]
            isOneToOne: false
            referencedRelation: "gates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guard_device_sessions_guard_id_fkey"
            columns: ["guard_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guard_device_sessions_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guard_device_sessions_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      guard_shifts: {
        Row: {
          checked_in_at: string | null
          checked_out_at: string | null
          created_at: string
          ends_at: string
          gate_id: string | null
          guard_id: string
          handover_at: string | null
          handover_note: string | null
          id: string
          society_id: string
          starts_at: string
          status: string
        }
        Insert: {
          checked_in_at?: string | null
          checked_out_at?: string | null
          created_at?: string
          ends_at: string
          gate_id?: string | null
          guard_id: string
          handover_at?: string | null
          handover_note?: string | null
          id?: string
          society_id: string
          starts_at: string
          status?: string
        }
        Update: {
          checked_in_at?: string | null
          checked_out_at?: string | null
          created_at?: string
          ends_at?: string
          gate_id?: string | null
          guard_id?: string
          handover_at?: string | null
          handover_note?: string | null
          id?: string
          society_id?: string
          starts_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "guard_shifts_gate_id_fkey"
            columns: ["gate_id"]
            isOneToOne: false
            referencedRelation: "gates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guard_shifts_guard_id_fkey"
            columns: ["guard_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guard_shifts_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          created_by: string
          email: string | null
          expires_at: string
          flat_id: string | null
          id: string
          identity_type: string | null
          identity_value: string | null
          name: string | null
          phone: string | null
          role: string
          society_id: string
        }
        Insert: {
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          created_by: string
          email?: string | null
          expires_at?: string
          flat_id?: string | null
          id?: string
          identity_type?: string | null
          identity_value?: string | null
          name?: string | null
          phone?: string | null
          role?: string
          society_id: string
        }
        Update: {
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          created_by?: string
          email?: string | null
          expires_at?: string
          flat_id?: string | null
          id?: string
          identity_type?: string | null
          identity_value?: string | null
          name?: string | null
          phone?: string | null
          role?: string
          society_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      lost_found_items: {
        Row: {
          contact_note: string | null
          created_at: string
          created_by: string
          description: string | null
          flat_id: string | null
          id: string
          kind: string
          location_note: string | null
          photo_ref: string | null
          society_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          contact_note?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          flat_id?: string | null
          id?: string
          kind: string
          location_note?: string | null
          photo_ref?: string | null
          society_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          contact_note?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          flat_id?: string | null
          id?: string
          kind?: string
          location_note?: string | null
          photo_ref?: string | null
          society_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lost_found_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lost_found_items_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lost_found_items_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_dues: {
        Row: {
          amount: number
          claimed_at: string | null
          claimed_by: string | null
          confirmed_by: string | null
          created_at: string
          due_on: string | null
          flat_id: string
          id: string
          late_fee_amount: number
          late_fee_applied_at: string | null
          late_fee_waived_at: string | null
          paid_at: string | null
          payment_note: string | null
          period: string
          society_id: string
          status: string
        }
        Insert: {
          amount: number
          claimed_at?: string | null
          claimed_by?: string | null
          confirmed_by?: string | null
          created_at?: string
          due_on?: string | null
          flat_id: string
          id?: string
          late_fee_amount?: number
          late_fee_applied_at?: string | null
          late_fee_waived_at?: string | null
          paid_at?: string | null
          payment_note?: string | null
          period: string
          society_id: string
          status?: string
        }
        Update: {
          amount?: number
          claimed_at?: string | null
          claimed_by?: string | null
          confirmed_by?: string | null
          created_at?: string
          due_on?: string | null
          flat_id?: string
          id?: string
          late_fee_amount?: number
          late_fee_applied_at?: string | null
          late_fee_waived_at?: string | null
          paid_at?: string | null
          payment_note?: string | null
          period?: string
          society_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_dues_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_dues_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_dues_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_dues_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_listings: {
        Row: {
          category: string
          created_at: string
          created_by: string
          description: string | null
          flat_id: string | null
          id: string
          photo_ref: string | null
          price: number | null
          society_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by: string
          description?: string | null
          flat_id?: string | null
          id?: string
          photo_ref?: string | null
          price?: number | null
          society_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string
          description?: string | null
          flat_id?: string | null
          id?: string
          photo_ref?: string | null
          price?: number | null
          society_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_listings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_listings_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_listings_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      notice_reads: {
        Row: {
          notice_id: string
          profile_id: string
          read_at: string
        }
        Insert: {
          notice_id: string
          profile_id: string
          read_at?: string
        }
        Update: {
          notice_id?: string
          profile_id?: string
          read_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notice_reads_notice_id_fkey"
            columns: ["notice_id"]
            isOneToOne: false
            referencedRelation: "notices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notice_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notices: {
        Row: {
          attachment_url: string | null
          attachments: string[]
          audience: string
          body: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          idempotency_key: string | null
          notified_at: string | null
          pinned_at: string | null
          published_at: string | null
          society_id: string
          target_flat_ids: string[]
          target_tower_ids: string[]
          title: string
          updated_at: string
        }
        Insert: {
          attachment_url?: string | null
          attachments?: string[]
          audience?: string
          body: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          idempotency_key?: string | null
          notified_at?: string | null
          pinned_at?: string | null
          published_at?: string | null
          society_id: string
          target_flat_ids?: string[]
          target_tower_ids?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          attachment_url?: string | null
          attachments?: string[]
          audience?: string
          body?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          idempotency_key?: string | null
          notified_at?: string | null
          pinned_at?: string | null
          published_at?: string | null
          society_id?: string
          target_flat_ids?: string[]
          target_tower_ids?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notices_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          payload: Json
          read_at: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          read_at?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          read_at?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parcels: {
        Row: {
          collected_at: string | null
          collected_by: string | null
          created_at: string
          description: string
          flat_id: string
          id: string
          logged_by: string
          photo_ref: string | null
          shelf_label: string | null
          society_id: string
          status: string
        }
        Insert: {
          collected_at?: string | null
          collected_by?: string | null
          created_at?: string
          description: string
          flat_id: string
          id?: string
          logged_by: string
          photo_ref?: string | null
          shelf_label?: string | null
          society_id: string
          status?: string
        }
        Update: {
          collected_at?: string | null
          collected_by?: string | null
          created_at?: string
          description?: string
          flat_id?: string
          id?: string
          logged_by?: string
          photo_ref?: string | null
          shelf_label?: string | null
          society_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "parcels_collected_by_fkey"
            columns: ["collected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcels_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcels_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcels_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_delivery_events: {
        Row: {
          created_at: string
          external_id: string
          id: string
          partner_slug: string
          payload: Json
          pre_approval_id: string | null
          society_id: string
        }
        Insert: {
          created_at?: string
          external_id: string
          id?: string
          partner_slug: string
          payload?: Json
          pre_approval_id?: string | null
          society_id: string
        }
        Update: {
          created_at?: string
          external_id?: string
          id?: string
          partner_slug?: string
          payload?: Json
          pre_approval_id?: string | null
          society_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_delivery_events_pre_approval_id_fkey"
            columns: ["pre_approval_id"]
            isOneToOne: false
            referencedRelation: "pre_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_delivery_events_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_data_export_requests: {
        Row: {
          artifact_id: string | null
          completed_at: string | null
          error_code: string | null
          id: string
          profile_id: string
          requested_at: string
          society_id: string
          status: string
        }
        Insert: {
          artifact_id?: string | null
          completed_at?: string | null
          error_code?: string | null
          id?: string
          profile_id: string
          requested_at?: string
          society_id: string
          status: string
        }
        Update: {
          artifact_id?: string | null
          completed_at?: string | null
          error_code?: string | null
          id?: string
          profile_id?: string
          requested_at?: string
          society_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_data_export_requests_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "export_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_data_export_requests_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_vote_audit: {
        Row: {
          created_at: string
          flat_id: string
          id: string
          option_index: number
          poll_id: string
          society_id: string
          voter_id: string
        }
        Insert: {
          created_at?: string
          flat_id: string
          id?: string
          option_index: number
          poll_id: string
          society_id: string
          voter_id: string
        }
        Update: {
          created_at?: string
          flat_id?: string
          id?: string
          option_index?: number
          poll_id?: string
          society_id?: string
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_vote_audit_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_vote_audit_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_vote_audit_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_vote_audit_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_votes: {
        Row: {
          created_at: string
          flat_id: string
          option_index: number
          poll_id: string
          voter_id: string
        }
        Insert: {
          created_at?: string
          flat_id: string
          option_index: number
          poll_id: string
          voter_id: string
        }
        Update: {
          created_at?: string
          flat_id?: string
          option_index?: number
          poll_id?: string
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_votes_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      polls: {
        Row: {
          attachments: string[]
          closed_at: string | null
          closed_by: string | null
          closes_at: string
          created_at: string
          created_by: string
          id: string
          is_anonymous: boolean
          notified_at: string | null
          opens_at: string
          options: Json
          question: string
          quorum_percent: number
          society_id: string
          target_flat_ids: string[]
          target_tower_ids: string[]
        }
        Insert: {
          attachments?: string[]
          closed_at?: string | null
          closed_by?: string | null
          closes_at: string
          created_at?: string
          created_by: string
          id?: string
          is_anonymous?: boolean
          notified_at?: string | null
          opens_at?: string
          options: Json
          question: string
          quorum_percent?: number
          society_id: string
          target_flat_ids?: string[]
          target_tower_ids?: string[]
        }
        Update: {
          attachments?: string[]
          closed_at?: string | null
          closed_by?: string | null
          closes_at?: string
          created_at?: string
          created_by?: string
          id?: string
          is_anonymous?: boolean
          notified_at?: string | null
          opens_at?: string
          options?: Json
          question?: string
          quorum_percent?: number
          society_id?: string
          target_flat_ids?: string[]
          target_tower_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "polls_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polls_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polls_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      pre_approval_events: {
        Row: {
          actor_id: string | null
          created_at: string
          detail: string | null
          event: string
          id: string
          pre_approval_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          detail?: string | null
          event: string
          id?: string
          pre_approval_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          detail?: string | null
          event?: string
          id?: string
          pre_approval_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pre_approval_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_approval_events_pre_approval_id_fkey"
            columns: ["pre_approval_id"]
            isOneToOne: false
            referencedRelation: "pre_approvals"
            referencedColumns: ["id"]
          },
        ]
      }
      pre_approvals: {
        Row: {
          code: string
          created_at: string
          created_by: string
          flat_id: string
          id: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          type: string
          used_at: string | null
          valid_from: string
          valid_to: string
          visitor_name: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          flat_id: string
          id?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          type: string
          used_at?: string | null
          valid_from: string
          valid_to: string
          visitor_name: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          flat_id?: string
          id?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          type?: string
          used_at?: string | null
          valid_from?: string
          valid_to?: string
          visitor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "pre_approvals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_approvals_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_approvals_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      privacy_legal_holds: {
        Row: {
          id: string
          placed_at: string
          placed_by: string
          profile_id: string | null
          reason_code: string
          released_at: string | null
          released_by: string | null
          scope: string
          society_id: string
        }
        Insert: {
          id?: string
          placed_at?: string
          placed_by: string
          profile_id?: string | null
          reason_code: string
          released_at?: string | null
          released_by?: string | null
          scope: string
          society_id: string
        }
        Update: {
          id?: string
          placed_at?: string
          placed_by?: string
          profile_id?: string | null
          reason_code?: string
          released_at?: string | null
          released_by?: string | null
          scope?: string
          society_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "privacy_legal_holds_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          expo_push_token: string | null
          flat_id: string | null
          id: string
          name: string
          phone: string | null
          resident_id_code: string | null
          role: string
          society_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          expo_push_token?: string | null
          flat_id?: string | null
          id: string
          name: string
          phone?: string | null
          resident_id_code?: string | null
          role: string
          society_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          expo_push_token?: string | null
          flat_id?: string | null
          id?: string
          name?: string
          phone?: string | null
          resident_id_code?: string | null
          role?: string
          society_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      push_outbox: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          error_class: string | null
          error_code: string | null
          error_message: string | null
          expo_push_token: string
          expo_ticket_id: string | null
          id: string
          lease_expires_at: string | null
          lease_owner: string | null
          next_attempt_at: string
          notification_id: string
          payload: Json
          payload_identity: string
          push_token_id: string | null
          recipient_user_id: string
          state: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          error_class?: string | null
          error_code?: string | null
          error_message?: string | null
          expo_push_token: string
          expo_ticket_id?: string | null
          id?: string
          lease_expires_at?: string | null
          lease_owner?: string | null
          next_attempt_at?: string
          notification_id: string
          payload: Json
          payload_identity: string
          push_token_id?: string | null
          recipient_user_id: string
          state?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          error_class?: string | null
          error_code?: string | null
          error_message?: string | null
          expo_push_token?: string
          expo_ticket_id?: string | null
          id?: string
          lease_expires_at?: string | null
          lease_owner?: string | null
          next_attempt_at?: string
          notification_id?: string
          payload?: Json
          payload_identity?: string
          push_token_id?: string | null
          recipient_user_id?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_outbox_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_outbox_push_token_id_fkey"
            columns: ["push_token_id"]
            isOneToOne: false
            referencedRelation: "push_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_outbox_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tickets: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          error_class: string | null
          expo_push_token: string
          lease_expires_at: string | null
          lease_owner: string | null
          next_attempt_at: string
          outbox_id: string | null
          receipt_error: string | null
          status: string
          ticket_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          error_class?: string | null
          expo_push_token: string
          lease_expires_at?: string | null
          lease_owner?: string | null
          next_attempt_at?: string
          outbox_id?: string | null
          receipt_error?: string | null
          status?: string
          ticket_id: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          error_class?: string | null
          expo_push_token?: string
          lease_expires_at?: string | null
          lease_owner?: string | null
          next_attempt_at?: string
          outbox_id?: string | null
          receipt_error?: string | null
          status?: string
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tickets_outbox_id_fkey"
            columns: ["outbox_id"]
            isOneToOne: false
            referencedRelation: "push_outbox"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          last_seen_at: string
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_seen_at?: string
          platform: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_seen_at?: string
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_passes: {
        Row: {
          active: boolean
          created_at: string
          created_by: string
          days_of_week: number[]
          end_minute: number
          flat_id: string
          id: string
          name: string
          society_id: string
          start_minute: number
          type: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by: string
          days_of_week?: number[]
          end_minute: number
          flat_id: string
          id?: string
          name: string
          society_id: string
          start_minute: number
          type: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string
          days_of_week?: number[]
          end_minute?: number
          flat_id?: string
          id?: string
          name?: string
          society_id?: string
          start_minute?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_passes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_passes_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_passes_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      resident_kudos: {
        Row: {
          created_at: string
          from_profile_id: string
          id: string
          reason: string
          ref_id: string | null
          society_id: string
          to_profile_id: string
        }
        Insert: {
          created_at?: string
          from_profile_id: string
          id?: string
          reason?: string
          ref_id?: string | null
          society_id: string
          to_profile_id: string
        }
        Update: {
          created_at?: string
          from_profile_id?: string
          id?: string
          reason?: string
          ref_id?: string | null
          society_id?: string
          to_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resident_kudos_from_profile_id_fkey"
            columns: ["from_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resident_kudos_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resident_kudos_to_profile_id_fkey"
            columns: ["to_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      resident_vehicles: {
        Row: {
          auto_approve: boolean
          created_at: string
          created_by: string
          flat_id: string
          id: string
          label: string | null
          plate: string
          society_id: string
        }
        Insert: {
          auto_approve?: boolean
          created_at?: string
          created_by: string
          flat_id: string
          id?: string
          label?: string | null
          plate: string
          society_id: string
        }
        Update: {
          auto_approve?: boolean
          created_at?: string
          created_by?: string
          flat_id?: string
          id?: string
          label?: string | null
          plate?: string
          society_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resident_vehicles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resident_vehicles_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resident_vehicles_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      service_provider_ratings: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          profile_id: string
          provider_id: string
          rating: number
          society_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          profile_id: string
          provider_id: string
          rating: number
          society_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          profile_id?: string
          provider_id?: string
          rating?: number
          society_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_provider_ratings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_provider_ratings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_provider_ratings_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      service_providers: {
        Row: {
          availability_text: string | null
          category: string
          created_at: string
          description: string | null
          id: string
          is_available: boolean
          is_verified: boolean
          name: string
          phone: string | null
          photo_url: string | null
          society_id: string
        }
        Insert: {
          availability_text?: string | null
          category: string
          created_at?: string
          description?: string | null
          id?: string
          is_available?: boolean
          is_verified?: boolean
          name: string
          phone?: string | null
          photo_url?: string | null
          society_id: string
        }
        Update: {
          availability_text?: string | null
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_available?: boolean
          is_verified?: boolean
          name?: string
          phone?: string | null
          photo_url?: string | null
          society_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_providers_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      societies: {
        Row: {
          address: string | null
          calendar_feed_token: string
          created_at: string
          id: string
          name: string
          settings: Json
        }
        Insert: {
          address?: string | null
          calendar_feed_token?: string
          created_at?: string
          id?: string
          name: string
          settings?: Json
        }
        Update: {
          address?: string | null
          calendar_feed_token?: string
          created_at?: string
          id?: string
          name?: string
          settings?: Json
        }
        Relationships: []
      }
      society_activity: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          entity_id: string | null
          id: string
          kind: string
          society_id: string
          title: string
          url: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          id?: string
          kind: string
          society_id: string
          title: string
          url?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          id?: string
          kind?: string
          society_id?: string
          title?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "society_activity_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "society_activity_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      society_documents: {
        Row: {
          archived_at: string | null
          category: string
          created_at: string
          description: string | null
          file_name: string | null
          id: string
          mime_type: string | null
          society_id: string
          storage_ref: string
          title: string
          uploaded_by: string
          visibility: string
        }
        Insert: {
          archived_at?: string | null
          category?: string
          created_at?: string
          description?: string | null
          file_name?: string | null
          id?: string
          mime_type?: string | null
          society_id: string
          storage_ref: string
          title: string
          uploaded_by: string
          visibility?: string
        }
        Update: {
          archived_at?: string | null
          category?: string
          created_at?: string
          description?: string | null
          file_name?: string | null
          id?: string
          mime_type?: string | null
          society_id?: string
          storage_ref?: string
          title?: string
          uploaded_by?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "society_documents_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "society_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      society_events: {
        Row: {
          capacity: number | null
          cover_photo: string | null
          created_at: string
          created_by: string
          description: string | null
          ends_at: string
          id: string
          location: string | null
          society_id: string
          starts_at: string
          status: string
          title: string
        }
        Insert: {
          capacity?: number | null
          cover_photo?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          ends_at: string
          id?: string
          location?: string | null
          society_id: string
          starts_at: string
          status?: string
          title: string
        }
        Update: {
          capacity?: number | null
          cover_photo?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          ends_at?: string
          id?: string
          location?: string | null
          society_id?: string
          starts_at?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "society_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "society_events_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      sos_alerts: {
        Row: {
          created_at: string
          flat_id: string | null
          id: string
          kind: string
          note: string | null
          raised_by: string
          resolved_at: string | null
          resolved_by: string | null
          society_id: string
          status: string
        }
        Insert: {
          created_at?: string
          flat_id?: string | null
          id?: string
          kind: string
          note?: string | null
          raised_by: string
          resolved_at?: string | null
          resolved_by?: string | null
          society_id: string
          status?: string
        }
        Update: {
          created_at?: string
          flat_id?: string | null
          id?: string
          kind?: string
          note?: string | null
          raised_by?: string
          resolved_at?: string | null
          resolved_by?: string | null
          society_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sos_alerts_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sos_alerts_raised_by_fkey"
            columns: ["raised_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sos_alerts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sos_alerts_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          category: string
          checkin_code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          phone: string | null
          photo_url: string | null
          society_id: string
        }
        Insert: {
          category: string
          checkin_code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          photo_url?: string | null
          society_id: string
        }
        Update: {
          category?: string
          checkin_code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          photo_url?: string | null
          society_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_attendance: {
        Row: {
          checked_in_at: string
          checked_in_by: string | null
          checked_out_at: string | null
          checked_out_by: string | null
          created_at: string
          id: string
          method: string
          society_id: string
          staff_id: string
        }
        Insert: {
          checked_in_at?: string
          checked_in_by?: string | null
          checked_out_at?: string | null
          checked_out_by?: string | null
          created_at?: string
          id?: string
          method?: string
          society_id: string
          staff_id: string
        }
        Update: {
          checked_in_at?: string
          checked_in_by?: string | null
          checked_out_at?: string | null
          checked_out_by?: string | null
          created_at?: string
          id?: string
          method?: string
          society_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_attendance_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_attendance_checked_out_by_fkey"
            columns: ["checked_out_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_attendance_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_attendance_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          ticket_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          ticket_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_status_history: {
        Row: {
          actor_id: string | null
          assigned_staff_id: string | null
          created_at: string
          from_status: string | null
          id: string
          ticket_id: string
          to_status: string
        }
        Insert: {
          actor_id?: string | null
          assigned_staff_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          ticket_id: string
          to_status: string
        }
        Update: {
          actor_id?: string | null
          assigned_staff_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          ticket_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_status_history_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_status_history_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_status_history_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assigned_staff_id: string | null
          assigned_to: string | null
          category: string
          closed_at: string | null
          created_at: string
          description: string | null
          first_response_at: string | null
          flat_id: string
          id: string
          photos: string[]
          resolved_at: string | null
          response_due_at: string | null
          status: string
          title: string
        }
        Insert: {
          assigned_staff_id?: string | null
          assigned_to?: string | null
          category: string
          closed_at?: string | null
          created_at?: string
          description?: string | null
          first_response_at?: string | null
          flat_id: string
          id?: string
          photos?: string[]
          resolved_at?: string | null
          response_due_at?: string | null
          status?: string
          title: string
        }
        Update: {
          assigned_staff_id?: string | null
          assigned_to?: string | null
          category?: string
          closed_at?: string | null
          created_at?: string
          description?: string | null
          first_response_at?: string | null
          flat_id?: string
          id?: string
          photos?: string[]
          resolved_at?: string | null
          response_due_at?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
        ]
      }
      towers: {
        Row: {
          id: string
          name: string
          society_id: string
        }
        Insert: {
          id?: string
          name: string
          society_id: string
        }
        Update: {
          id?: string
          name?: string
          society_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "towers_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      visitor_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          handling: string | null
          id: string
          raised_by: string
          status: string
          visitor_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          handling?: string | null
          id?: string
          raised_by: string
          status?: string
          visitor_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          handling?: string | null
          id?: string
          raised_by?: string
          status?: string
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visitor_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitor_requests_raised_by_fkey"
            columns: ["raised_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitor_requests_visitor_id_fkey"
            columns: ["visitor_id"]
            isOneToOne: false
            referencedRelation: "visitors"
            referencedColumns: ["id"]
          },
        ]
      }
      visitor_watchlist: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          kind: string
          name: string | null
          phone: string | null
          reason: string
          society_id: string
          updated_at: string
          vehicle_no: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          kind: string
          name?: string | null
          phone?: string | null
          reason: string
          society_id: string
          updated_at?: string
          vehicle_no?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          kind?: string
          name?: string | null
          phone?: string | null
          reason?: string
          society_id?: string
          updated_at?: string
          vehicle_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visitor_watchlist_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitor_watchlist_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      visitors: {
        Row: {
          created_at: string
          flat_id: string
          id: string
          name: string
          phone: string | null
          photo_url: string | null
          society_id: string
          type: string
          vehicle_no: string | null
        }
        Insert: {
          created_at?: string
          flat_id: string
          id?: string
          name: string
          phone?: string | null
          photo_url?: string | null
          society_id: string
          type: string
          vehicle_no?: string | null
        }
        Update: {
          created_at?: string
          flat_id?: string
          id?: string
          name?: string
          phone?: string | null
          photo_url?: string | null
          society_id?: string
          type?: string
          vehicle_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visitors_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitors_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_audit_page: {
        Args: {
          p_action?: string
          p_after?: Json
          p_limit?: number
          p_search?: string
          p_target_type?: string
        }
        Returns: Json
      }
      admin_dataset_page: {
        Args: {
          p_after?: Json
          p_dataset: string
          p_filters?: Json
          p_limit?: number
          p_search?: string
        }
        Returns: Json
      }
      admin_override_entry: {
        Args: {
          p_idempotency_key: string
          p_reason: string
          p_request_id: string
        }
        Returns: Json
      }
      amenity_capacity_statuses: { Args: never; Returns: string[] }
      amenity_generate_access_code: { Args: never; Returns: string }
      amenity_issue_access_if_confirmed: {
        Args: { p_booking_id: string }
        Returns: undefined
      }
      amenity_usage_stats: { Args: { p_days?: number }; Returns: Json }
      apply_maintenance_late_fees: { Args: { p_limit?: number }; Returns: Json }
      approval_time_stats: { Args: { p_days?: number }; Returns: Json }
      book_amenity: {
        Args: { p_amenity_id: string; p_ends_at: string; p_starts_at: string }
        Returns: string
      }
      book_amenity_series: {
        Args: { p_amenity_id: string; p_starts_at: string; p_weeks?: number }
        Returns: Json
      }
      build_personal_export_snapshot: {
        Args: { p_profile_id: string }
        Returns: Json
      }
      cancel_account_deletion: { Args: never; Returns: boolean }
      cancel_household_invite: {
        Args: { p_invite_id: string }
        Returns: undefined
      }
      cancel_my_amenity_booking: {
        Args: { p_accept_penalty?: boolean; p_booking_id: string }
        Returns: Json
      }
      cast_poll_vote: {
        Args: { p_option_index: number; p_poll_id: string }
        Returns: undefined
      }
      check_in_domestic_helper: {
        Args: { p_code?: string; p_helper_id?: string; p_method?: string }
        Returns: Json
      }
      check_in_staff: {
        Args: { p_code?: string; p_method?: string; p_staff_id?: string }
        Returns: Json
      }
      check_out_domestic_helper: {
        Args: { p_attendance_id: string }
        Returns: undefined
      }
      check_out_staff: { Args: { p_attendance_id: string }; Returns: undefined }
      claim_carpool_seat: {
        Args: { p_ride_id: string; p_seats?: number }
        Returns: string
      }
      claim_invite: {
        Args: {
          p_identity_type: string
          p_identity_value: string
          p_name?: string
        }
        Returns: Json
      }
      claim_push_outbox: {
        Args: { p_lease_seconds?: number; p_limit?: number; p_worker: string }
        Returns: {
          attempts: number
          completed_at: string | null
          created_at: string
          error_class: string | null
          error_code: string | null
          error_message: string | null
          expo_push_token: string
          expo_ticket_id: string | null
          id: string
          lease_expires_at: string | null
          lease_owner: string | null
          next_attempt_at: string
          notification_id: string
          payload: Json
          payload_identity: string
          push_token_id: string | null
          recipient_user_id: string
          state: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "push_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_push_receipts: {
        Args: { p_lease_seconds?: number; p_limit?: number; p_worker: string }
        Returns: {
          attempts: number
          completed_at: string | null
          created_at: string
          error_class: string | null
          expo_push_token: string
          lease_expires_at: string | null
          lease_owner: string | null
          next_attempt_at: string
          outbox_id: string | null
          receipt_error: string | null
          status: string
          ticket_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "push_tickets"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      clerk_uid: { Args: never; Returns: string }
      complete_gate_open_command: {
        Args: {
          p_command_id: string
          p_provider_response?: string
          p_status: string
        }
        Returns: undefined
      }
      complete_push_outbox: {
        Args: { p_outbox_id: string; p_ticket_id: string; p_worker: string }
        Returns: boolean
      }
      complete_push_receipt: {
        Args: {
          p_error_class?: string
          p_error_code?: string
          p_error_message?: string
          p_status: string
          p_ticket_id: string
          p_worker: string
        }
        Returns: boolean
      }
      confirm_amenity_booking_payment: {
        Args: { p_booking_id: string; p_order_id: string; p_payment_id: string }
        Returns: Json
      }
      create_admin_audit_export: {
        Args: { p_filters?: Json; p_format: string }
        Returns: string
      }
      decide_amenity_booking: {
        Args: { p_booking_id: string; p_decision: string; p_reason?: string }
        Returns: Json
      }
      decide_visitor_request: {
        Args: {
          p_decision: string
          p_idempotency_key: string
          p_request_id: string
        }
        Returns: Json
      }
      domestic_on_duty: { Args: { p_flat_id?: string }; Returns: Json }
      due_payable_amount: {
        Args: {
          p_amount: number
          p_late_fee_amount: number
          p_late_fee_waived_at: string
        }
        Returns: number
      }
      emit_society_activity: {
        Args: {
          p_body?: string
          p_created_by?: string
          p_entity_id?: string
          p_kind: string
          p_society_id: string
          p_title: string
          p_url?: string
        }
        Returns: string
      }
      ensure_my_resident_id: { Args: never; Returns: string }
      expire_stale_requests: { Args: never; Returns: number }
      find_watchlist_matches: {
        Args: {
          p_name?: string
          p_phone?: string
          p_society_id: string
          p_vehicle_no?: string
        }
        Returns: {
          id: string
          kind: string
          name: string
          phone: string
          reason: string
          vehicle_no: string
        }[]
      }
      flag_maintenance_defaulters: { Args: { p_limit?: number }; Returns: Json }
      generate_helper_checkin_code: { Args: never; Returns: string }
      generate_resident_id_code: { Args: never; Returns: string }
      generate_staff_checkin_code: { Args: never; Returns: string }
      give_resident_kudos: {
        Args: { p_reason?: string; p_ref_id?: string; p_to_profile_id: string }
        Returns: Json
      }
      has_admin_capability: { Args: { p_capability: string }; Returns: boolean }
      heartbeat_guard_device: {
        Args: { p_device_id: string }
        Returns: boolean
      }
      import_flats_transactional: {
        Args: {
          p_all_or_nothing?: boolean
          p_dry_run?: boolean
          p_idempotency_key: string
          p_rows: Json
        }
        Returns: Json
      }
      insert_partner_delivery_preapproval: {
        Args: {
          p_external_id: string
          p_flat_number: string
          p_partner_slug: string
          p_society_id: string
          p_tower: string
          p_valid_minutes?: number
          p_visitor_name: string
        }
        Returns: Json
      }
      invalidate_push_token: {
        Args: { p_expected_token: string; p_outbox_id: string }
        Returns: boolean
      }
      join_amenity_waitlist: {
        Args: { p_amenity_id: string; p_ends_at: string; p_starts_at: string }
        Returns: string
      }
      list_admin_capability_grants: { Args: never; Returns: Json }
      list_orphan_media: { Args: { p_limit?: number }; Returns: Json }
      lookup_vehicle: { Args: { p_plate: string }; Returns: Json }
      lookup_watchlist: {
        Args: { p_name?: string; p_phone?: string; p_vehicle_no?: string }
        Returns: Json
      }
      mark_amenity_no_shows: { Args: { p_limit?: number }; Returns: number }
      mark_visitor_entry: {
        Args: { p_idempotency_key: string; p_request_id: string }
        Returns: Json
      }
      mark_visitor_exit: {
        Args: { p_idempotency_key: string; p_log_id: string }
        Returns: Json
      }
      my_admin_capabilities: { Args: never; Returns: Json }
      my_flat: { Args: never; Returns: string }
      my_flat_members: { Args: never; Returns: Json }
      my_role: { Args: never; Returns: string }
      my_society: { Args: never; Returns: string }
      my_society_calendar_token: { Args: never; Returns: string }
      notice_readers: { Args: { p_notice_id: string }; Returns: Json }
      notify_flat_residents: {
        Args: { p_flat_id: string; p_payload: Json; p_type: string }
        Returns: undefined
      }
      notify_society_role: {
        Args: {
          p_payload: Json
          p_role: string
          p_society_id: string
          p_type: string
        }
        Returns: undefined
      }
      notify_user: {
        Args: { p_payload: Json; p_type: string; p_user_id: string }
        Returns: undefined
      }
      poll_tallies: { Args: { p_poll_id: string }; Returns: Json }
      process_due_communications: { Args: { p_limit?: number }; Returns: Json }
      profile_badges: { Args: { p_profile_id?: string }; Returns: Json }
      promote_amenity_waitlist: {
        Args: { p_amenity_id: string; p_ends_at: string; p_starts_at: string }
        Returns: string
      }
      provider_rating_summary: {
        Args: { p_provider_id: string }
        Returns: Json
      }
      raise_dues_for_all_flats: {
        Args: { p_amount: number; p_period: string }
        Returns: number
      }
      raise_sos_alert: {
        Args: { p_kind: string; p_note?: string }
        Returns: string
      }
      raise_visitor_request: {
        Args: {
          p_flat_id: string
          p_idempotency_key: string
          p_name: string
          p_phone?: string
          p_photo_url?: string
          p_type: string
          p_vehicle_no?: string
        }
        Returns: Json
      }
      recurring_pass_matches: {
        Args: { p_flat_id: string; p_name: string }
        Returns: boolean
      }
      redeem_amenity_access: { Args: { p_code: string }; Returns: Json }
      redeem_gate_code: { Args: { p_code: string }; Returns: Json }
      redeem_group_code: {
        Args: { p_code: string; p_guest_name?: string }
        Returns: Json
      }
      register_guard_device: {
        Args: {
          p_device_id: string
          p_device_name?: string
          p_gate_id?: string
          p_push_token?: string
        }
        Returns: string
      }
      register_push_token: {
        Args: { p_platform: string; p_token: string }
        Returns: undefined
      }
      remove_flat_member: { Args: { p_profile_id: string }; Returns: undefined }
      request_account_deletion: { Args: never; Returns: string }
      request_account_deletion_for: {
        Args: { p_default_grace_days: number; p_profile_id: string }
        Returns: string
      }
      request_account_deletion_internal: {
        Args: { p_default_grace_days: number; p_profile_id: string }
        Returns: string
      }
      request_gate_open: {
        Args: { p_gate_id: string; p_reason: string }
        Returns: Json
      }
      request_personal_data_export: { Args: never; Returns: string }
      resolve_sos_alert: { Args: { p_id: string }; Returns: undefined }
      retry_push_outbox: {
        Args: {
          p_dead?: boolean
          p_error_class: string
          p_error_code: string
          p_error_message: string
          p_next_attempt_at: string
          p_outbox_id: string
          p_worker: string
        }
        Returns: boolean
      }
      retry_push_receipt: {
        Args: {
          p_dead?: boolean
          p_error_class: string
          p_error_message: string
          p_next_attempt_at: string
          p_ticket_id: string
          p_worker: string
        }
        Returns: boolean
      }
      retry_visitor_request: {
        Args: { p_idempotency_key: string; p_visitor_id: string }
        Returns: Json
      }
      revoke_guard_device: {
        Args: { p_reason: string; p_session_id: string }
        Returns: boolean
      }
      revoke_pre_approval: {
        Args: { p_id: string; p_reason?: string }
        Returns: undefined
      }
      rotate_calendar_feed_token: { Args: never; Returns: string }
      run_privacy_retention_cleanup: {
        Args: { p_dry_run?: boolean; p_limit?: number }
        Returns: Json
      }
      sanitized_audit_state: {
        Args: { p_row: Json; p_table: string }
        Returns: Json
      }
      set_admin_capabilities: {
        Args: { p_capabilities: string[]; p_profile_id: string }
        Returns: undefined
      }
      set_guard_shift_handover: {
        Args: { p_note: string; p_shift_id: string }
        Returns: undefined
      }
      set_my_flat_auto_approve_optout: {
        Args: { p_types: string[] }
        Returns: Json
      }
      set_notice_pinned: {
        Args: { p_notice_id: string; p_pinned: boolean }
        Returns: undefined
      }
      set_privacy_legal_hold: {
        Args: {
          p_hold: boolean
          p_profile_id: string
          p_reason_code: string
          p_scope: string
        }
        Returns: string
      }
      set_request_handling: {
        Args: { p_handling: string; p_request_id: string }
        Returns: undefined
      }
      sign_out_guard_device: { Args: { p_device_id: string }; Returns: boolean }
      society_analytics_bundle: { Args: { p_days?: number }; Returns: Json }
      society_events_for_calendar_token: {
        Args: { p_token: string }
        Returns: Json
      }
      society_guard_attendance_summary: {
        Args: { p_from?: string; p_to?: string }
        Returns: Json
      }
      society_guards_on_duty: { Args: never; Returns: Json }
      society_late_fee_config: { Args: { p_society: string }; Returns: Json }
      society_staff_attendance_summary: {
        Args: { p_from?: string; p_to?: string }
        Returns: Json
      }
      society_staff_on_duty: { Args: never; Returns: Json }
      unregister_push_token: { Args: { p_token: string }; Returns: boolean }
      update_my_guard_shift_status: {
        Args: { p_shift_id: string; p_status: string }
        Returns: undefined
      }
      update_my_profile: {
        Args: {
          p_expo_push_token?: string
          p_name?: string
          p_phone?: string
        }
        Returns: Json
      }
      upsert_event_rsvp: {
        Args: { p_event_id: string; p_response: string }
        Returns: string
      }
      verify_resident_id: { Args: { p_code: string }; Returns: Json }
      visitor_expiry_minutes: { Args: { p_society: string }; Returns: number }
      visitor_insights: { Args: { p_phone: string }; Returns: Json }
      waive_due_late_fee: { Args: { p_due_id: string }; Returns: undefined }
      watchlist_phone_digits: { Args: { p_phone: string }; Returns: string }
      watchlist_plate_key: { Args: { p_plate: string }; Returns: string }
      workflow_target_profiles: {
        Args: {
          p_flat_ids: string[]
          p_society_id: string
          p_tower_ids: string[]
        }
        Returns: string[]
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
