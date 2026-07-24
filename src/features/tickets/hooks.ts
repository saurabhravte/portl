import { useSupabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryState";
import {
  parseInput,
  ticketAssignmentSchema,
  ticketCommentSchema,
  ticketSchema,
  ticketStatusSchema,
} from "@/lib/validation";
import { useSessionStore } from "@/stores/session";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";

export interface TicketRow {
  id: string;
  category: string;
  title: string;
  description: string | null;
  photos: string[];
  status: TicketStatus;
  created_at: string;
  first_response_at: string | null;
  response_due_at: string | null;
  resolved_at: string | null;
  closed_at?: string | null;
  assigned_staff_id: string | null;
  assigned_staff?: { id: string; name: string; category: string } | null;
  flat?: { number: string } | null;
}

export interface TicketCommentRow {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  author?: { name: string; role: string } | null;
}

const TICKET_SELECT =
  "id,category,title,description,photos,status,created_at,first_response_at,response_due_at,resolved_at,closed_at,assigned_staff_id,assigned_staff:staff(id,name,category),flat:flats(number)";

export function useMyTickets(statusFilter?: TicketStatus | "all") {
  const supabase = useSupabase();
  const profile = useSessionStore((s) => s.profile);
  return useQuery({
    queryKey: queryKeys.tickets(
      profile?.role,
      profile?.flat_id,
      statusFilter ?? "all",
    ),
    enabled: !!profile,
    queryFn: async () => {
      let q = supabase
        .from("tickets")
        .select(TICKET_SELECT)
        .order("created_at", { ascending: false });
      if (profile!.role === "resident") q = q.eq("flat_id", profile!.flat_id!);
      if (statusFilter && statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as TicketRow[];
    },
  });
}

export function useTicketStatusHistory(ticketId: string | null) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["ticket-status-history", ticketId],
    enabled: !!ticketId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_status_history")
        .select("id,from_status,to_status,created_at,assigned_staff:staff(name)")
        .eq("ticket_id", ticketId!)
        .order("created_at");
      if (error) throw error;
      return data as unknown as {
        id: string;
        from_status: string | null;
        to_status: string;
        created_at: string;
        assigned_staff?: { name: string } | null;
      }[];
    },
  });
}

/** Comment thread on a ticket (sprint ticket #9). */
export function useTicketComments(ticketId: string | null) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["ticket-comments", ticketId],
    enabled: !!ticketId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_comments")
        .select("id,body,created_at,author_id,author:profiles(name,role)")
        .eq("ticket_id", ticketId!)
        .order("created_at");
      if (error) throw error;
      return data as unknown as TicketCommentRow[];
    },
  });
}

export function useAddTicketComment() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profile = useSessionStore((s) => s.profile);
  return useMutation({
    mutationFn: async ({ ticketId, body }: { ticketId: string; body: string }) => {
      ({ ticketId, body } = parseInput(ticketCommentSchema, { ticketId, body }));
      const { error } = await supabase.from("ticket_comments").insert({
        ticket_id: ticketId,
        author_id: profile!.id,
        body,
      });
      if (error) throw error;
    },
    onSettled: (_d, _e, { ticketId }) => {
      qc.invalidateQueries({ queryKey: ["ticket-comments", ticketId] });
      qc.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
}

export function useRaiseTicket() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profile = useSessionStore((s) => s.profile);
  return useMutation({
    mutationFn: async (input: {
      category: string;
      title: string;
      description: string;
      photos?: string[];
    }) => {
      const parsed = parseInput(ticketSchema, input);
      if (!profile?.flat_id) {
        throw new Error("A linked flat is required to raise a ticket.");
      }
      const { error } = await supabase.from("tickets").insert({
        flat_id: profile.flat_id,
        category: parsed.category,
        title: parsed.title,
        description: parsed.description,
        photos: parsed.photos,
        status: "open",
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tickets"] }),
  });
}

/** Status transitions. Residents use this to confirm resolution
 *  (resolved → closed) or reopen (resolved → open); admins move
 *  open → in_progress → resolved. */
export function useUpdateTicketStatus() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: TicketStatus;
    }) => {
      ({ id, status } = parseInput(ticketStatusSchema, { id, status }));
      const { error } = await supabase
        .from("tickets")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tickets"] }),
  });
}

/** Admin: assign a ticket to a staff member (column existed, now used). */
export function useAssignTicket() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, staffId }: { id: string; staffId: string | null }) => {
      ({ id, staffId } = parseInput(ticketAssignmentSchema, { id, staffId }));
      const { error } = await supabase
        .from("tickets")
        .update({ assigned_staff_id: staffId })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tickets"] }),
  });
}
