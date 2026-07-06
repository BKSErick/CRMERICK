export const localConfigKeys = {
  supabaseUrl: "crm_erick_supabase_url",
  supabaseAnonKey: "crm_erick_supabase_anon_key",
  instagramAccessToken: "crm_erick_ig_access_token",
  instagramBusinessAccountId: "crm_erick_ig_business_account_id",
  theme: "crm_erick_theme",
  emailNotifications: "crm_erick_email_notifications",
  pushNotifications: "crm_erick_push_notifications",
} as const;

export type LocalConfigKey = (typeof localConfigKeys)[keyof typeof localConfigKeys];

export type LocalCRMConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  instagramAccessToken: string;
  instagramBusinessAccountId: string;
  theme: "light" | "dark";
  emailNotifications: boolean;
  pushNotifications: boolean;
};

export const defaultLocalCRMConfig: LocalCRMConfig = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  instagramAccessToken: "",
  instagramBusinessAccountId: "",
  theme: "light",
  emailNotifications: true,
  pushNotifications: true,
};
