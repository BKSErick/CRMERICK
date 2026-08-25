export interface MydrionEmailMessage {
  from?: string;
  to: string | string[];
  subject: string;
  html: string;
}

export interface PreparedMydrionEmail {
  from: string;
  to: string[];
  subject: string;
  html: string;
}

export interface ResendSendResult {
  data?: { id?: string } | null;
  error?: {
    name?: string;
    statusCode?: number;
    message?: string;
  } | null;
}

export interface MydrionResendClient {
  emails: {
    send(payload: PreparedMydrionEmail): Promise<ResendSendResult>;
  };
}

export interface MydrionEmailService {
  prepare(message: MydrionEmailMessage): PreparedMydrionEmail;
  send(message: MydrionEmailMessage): Promise<{ id: string }>;
}

export const DEFAULT_MYDRION_EMAIL_FROM: string;

export function createMydrionEmailService(options?: {
  apiKey?: string;
  client?: MydrionResendClient;
}): MydrionEmailService;

export function createMydrionEmailServiceFromEnv(
  env?: Record<string, string | undefined>,
): MydrionEmailService;
