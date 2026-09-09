import type { getCrmSupabaseAdmin } from "./crmSupabase";
import type {
  EmailAutomationGraph,
  EmailAutomationSimulationInput,
  EmailAutomationTraceItem,
} from "./emailAutomationGraph";

type SupabaseAdmin = ReturnType<typeof getCrmSupabaseAdmin>;

export type EmailAutomationStatus = "draft" | "validated" | "archived";

export type EmailAutomationRow = {
  id: string;
  name: string;
  description: string;
  status: EmailAutomationStatus;
  graph: EmailAutomationGraph;
  version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type EmailAutomationRevisionRow = {
  id: number;
  automation_id: string;
  version: number;
  name: string;
  description: string;
  status: EmailAutomationStatus;
  created_by: string;
  created_at: string;
};

export type EmailAutomationTestRunRow = {
  id: number;
  automation_id: string | null;
  automation_version: number;
  status: "passed" | "failed";
  error: string | null;
  created_by: string;
  created_at: string;
};

const AUTOMATION_SELECT = "id, name, description, status, graph, version, created_by, created_at, updated_at";

function cleanQuery(value?: string | null) {
  return (value ?? "").trim().slice(0, 120).replace(/[%_\\]/g, "");
}

function firstRow<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null;
  return value && typeof value === "object" ? value as T : null;
}

export function createEmailAutomationRepository(supabase: SupabaseAdmin) {
  return {
    async listEmailAutomations(input: { query?: string; status?: EmailAutomationStatus | "all" }) {
      let request = supabase.from("email_automations").select(AUTOMATION_SELECT, { count: "exact" });
      const query = cleanQuery(input.query);
      if (query) request = request.ilike("name", `%${query}%`);
      if (input.status && input.status !== "all") request = request.eq("status", input.status);
      const result = await request.order("updated_at", { ascending: false }).order("id", { ascending: true });
      if (result.error) throw new Error(result.error.message);
      return { items: (result.data ?? []) as EmailAutomationRow[], total: result.count ?? 0 };
    },

    async createEmailAutomation(input: {
      name: string;
      description?: string;
      graph: EmailAutomationGraph;
      actor: string;
    }) {
      const result = await supabase.rpc("create_email_automation", {
        p_name: input.name,
        p_description: input.description ?? "",
        p_graph: input.graph,
        p_created_by: input.actor,
      });
      if (result.error) throw new Error(result.error.message);
      const created = firstRow<EmailAutomationRow>(result.data);
      if (!created) throw new Error("A automacao nao foi criada.");
      return created;
    },

    async getEmailAutomation(id: string) {
      const automation = await supabase.from("email_automations").select(AUTOMATION_SELECT).eq("id", id).maybeSingle();
      if (automation.error) throw new Error(automation.error.message);
      if (!automation.data) return null;

      const [revisions, testRuns] = await Promise.all([
        supabase
          .from("email_automation_revisions")
          .select("id, automation_id, version, name, description, status, created_by, created_at")
          .eq("automation_id", id)
          .order("version", { ascending: false })
          .limit(20),
        supabase
          .from("email_automation_test_runs")
          .select("id, automation_id, automation_version, status, error, created_by, created_at")
          .eq("automation_id", id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      if (revisions.error) throw new Error(revisions.error.message);
      if (testRuns.error) throw new Error(testRuns.error.message);
      return {
        automation: automation.data as EmailAutomationRow,
        revisions: (revisions.data ?? []) as EmailAutomationRevisionRow[],
        testRuns: (testRuns.data ?? []) as EmailAutomationTestRunRow[],
      };
    },

    async saveEmailAutomation(input: {
      id: string;
      expectedVersion: number;
      name: string;
      description?: string;
      status: EmailAutomationStatus;
      graph: EmailAutomationGraph;
      actor: string;
    }) {
      const result = await supabase.rpc("save_email_automation", {
        p_id: input.id,
        p_expected_version: input.expectedVersion,
        p_name: input.name,
        p_description: input.description ?? "",
        p_status: input.status,
        p_graph: input.graph,
        p_created_by: input.actor,
      });
      if (result.error) {
        if (/version_conflict/i.test(result.error.message ?? "")) throw new Error("version_conflict");
        throw new Error(result.error.message);
      }
      const saved = firstRow<EmailAutomationRow>(result.data);
      if (!saved) throw new Error("A automacao nao foi salva.");
      return saved;
    },

    async recordEmailAutomationTestRun(input: {
      automationId: string;
      automationVersion: number;
      simulationInput: EmailAutomationSimulationInput;
      trace: EmailAutomationTraceItem[];
      status: "passed" | "failed";
      error?: string | null;
      actor: string;
    }) {
      const result = await supabase.from("email_automation_test_runs").insert({
        automation_id: input.automationId,
        automation_version: input.automationVersion,
        input: input.simulationInput,
        trace: input.trace,
        status: input.status,
        error: input.error ?? null,
        created_by: input.actor,
      }).select("id, automation_id, automation_version, status, error, created_by, created_at").single();
      if (result.error) throw new Error(result.error.message);
      return result.data as EmailAutomationTestRunRow;
    },
  };
}
