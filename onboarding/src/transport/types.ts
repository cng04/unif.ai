/** One inbound message, normalized across transports. `text` is null for non-text content. */
export interface Inbound {
  chatId: string;
  platform: string;
  senderHandle?: string;
  text: string | null;
}

/** How the bot answers within the chat an inbound message came from. */
export interface Reply {
  send(text: string): Promise<void>;
  typing(on: boolean): Promise<void>;
}
