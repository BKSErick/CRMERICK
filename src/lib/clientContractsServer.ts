import type { SupabaseClient } from "@supabase/supabase-js";
import { mapClientContract, type ClientContract } from "@/lib/clientContracts";

export const CLIENT_CONTRACT_SELECT = `
  id, contract_number, client_id, template_key, template_version, status, title,
  draft_payload, client_snapshot, provider_snapshot, document_snapshot,
  generated_at, created_at, updated_at
`;

export async function loadClientContracts(supabase: SupabaseClient, clientId: number) {
  const result = await supabase
    .from("client_contracts")
    .select(CLIENT_CONTRACT_SELECT)
    .eq("client_id", clientId)
    .order("updated_at", { ascending: false });
  if (result.error) throw result.error;
  return (result.data ?? []).map(mapClientContract);
}

export async function loadClientContract(supabase: SupabaseClient, id: number): Promise<ClientContract | null> {
  const result = await supabase
    .from("client_contracts")
    .select(CLIENT_CONTRACT_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data ? mapClientContract(result.data) : null;
}
