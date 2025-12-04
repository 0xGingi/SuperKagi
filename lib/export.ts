import type { ChatMap, ChatMessage, ContentPart } from "@/types/chat";

export function exportChatAsJSON(
  chatId: string,
  messages: ChatMessage[],
): string {
  const exportData = {
    id: chatId,
    timestamp: new Date().toISOString(),
    messages: messages.map((msg, index) => ({
      index,
      role: msg.role,
      content: msg.content,
      reasoning: msg.reasoning,
      reasoningDetails: msg.reasoningDetails,
      timestamp: new Date(parseInt(chatId, 10) + index * 1000).toISOString(),
    })),
  };

  return JSON.stringify(exportData, null, 2);
}

export function exportChatAsMarkdown(
  chatId: string,
  messages: ChatMessage[],
): string {
  let markdown = `# Chat Export - ${new Date(parseInt(chatId, 10)).toLocaleDateString()}\n\n`;

  messages.forEach((msg, index) => {
    const timestamp = new Date(
      parseInt(chatId, 10) + index * 1000,
    ).toLocaleTimeString();
    markdown += `## ${msg.role.charAt(0).toUpperCase() + msg.role.slice(1)} - ${timestamp}\n\n`;

    if (Array.isArray(msg.content)) {
      msg.content.forEach((part: ContentPart) => {
        if (part.type === "text") {
          markdown += `${part.text || ""}\n\n`;
        } else if (part.type === "image_url") {
          markdown += `![Image](${part.image_url.url})\n\n`;
        }
      });
    } else {
      markdown += `${msg.content}\n\n`;
    }
    if (msg.reasoning) {
      markdown += `**Reasoning**\n\n${msg.reasoning}\n\n`;
    }

    markdown += `---\n\n`;
  });

  return markdown;
}

export function downloadFile(
  content: string,
  filename: string,
  mimeType: string,
) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportChat(
  chatId: string,
  messages: ChatMessage[],
  format: "json" | "markdown",
) {
  const timestamp = new Date(parseInt(chatId, 10)).toISOString().split("T")[0];
  const filename = `superkagi-chat-${timestamp}`;

  if (format === "json") {
    const content = exportChatAsJSON(chatId, messages);
    downloadFile(content, `${filename}.json`, "application/json");
  } else if (format === "markdown") {
    const content = exportChatAsMarkdown(chatId, messages);
    downloadFile(content, `${filename}.md`, "text/markdown");
  }
}

export function exportAllChats(chats: ChatMap, format: "json" | "markdown") {
  const timestamp = new Date().toISOString().split("T")[0];
  const filename = `superkagi-all-chats-${timestamp}`;

  if (format === "json") {
    const exportData = {
      timestamp: new Date().toISOString(),
      chats: Object.entries(chats as Record<string, ChatMessage[]>).map(
        ([id, messages]) => ({
          id,
          date: new Date(parseInt(id, 10)).toISOString(),
          messages: (messages as ChatMessage[]).map((msg, index) => ({
            index,
            role: msg.role,
            content: msg.content,
            reasoning: msg.reasoning,
            reasoningDetails: msg.reasoningDetails,
          })),
        }),
      ),
    };

    const content = JSON.stringify(exportData, null, 2);
    downloadFile(content, `${filename}.json`, "application/json");
  } else if (format === "markdown") {
    let markdown = `# All Chats Export - ${new Date().toLocaleDateString()}\n\n`;

    Object.entries(chats as Record<string, ChatMessage[]>).forEach(
      ([chatId, messages]) => {
        const chatDate = new Date(parseInt(chatId, 10)).toLocaleDateString();
        markdown += `# Chat from ${chatDate}\n\n`;
        markdown += exportChatAsMarkdown(chatId, messages as ChatMessage[]);
        markdown += `\n\n---\n\n`;
      },
    );

    downloadFile(markdown, `${filename}.md`, "text/markdown");
  }
}
