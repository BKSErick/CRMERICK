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
