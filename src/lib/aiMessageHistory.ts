type RetryMessage = {
  role: "user" | "assistant";
  status: string;
  content: string;
};

export function collapseRetryMessages<T extends RetryMessage>(messages: readonly T[]) {
  const visible: T[] = [];
  for (const message of messages) {
    if (message.role === "user" && visible.length >= 2) {
      const previousAssistant = visible[visible.length - 1];
      const previousUser = visible[visible.length - 2];
      const repeatsFailedAttempt = previousAssistant.role === "assistant"
        && previousAssistant.status === "failed"
        && previousUser.role === "user"
        && previousUser.content.trim() === message.content.trim();
      if (repeatsFailedAttempt) {
        visible.pop();
        continue;
      }
    }
    visible.push(message);
  }
  return visible;
}

export function boundMessageHistory<T extends { role: string; content: string }>(
  messages: readonly T[],
  options: { maxMessages?: number; maxCharacters?: number } = {},
) {
  const maxMessages = Math.max(1, Math.min(options.maxMessages ?? 12, 50));
  const maxCharacters = Math.max(100, Math.min(options.maxCharacters ?? 6000, 20000));
  const recent = messages.slice(-maxMessages);
  const bounded: T[] = [];
  let characters = 0;
  let truncated = messages.length > recent.length;
  for (let index = recent.length - 1; index >= 0; index -= 1) {
    const message = recent[index];
    const remaining = maxCharacters - characters;
    if (remaining <= 0) { truncated = true; break; }
    const content = String(message.content ?? "");
    const kept = content.length > remaining ? content.slice(content.length - remaining) : content;
    if (kept.length < content.length) truncated = true;
    bounded.unshift({ ...message, content: kept });
    characters += kept.length;
  }
  return { messages: bounded, characters, truncated };
}
