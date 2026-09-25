import type { Message, MessageType, Reply } from './protocol';

/** Send to the service worker (or any extension page listening). */
export function sendToBackground<T extends MessageType>(msg: Message<T>): Promise<Reply<T>> {
  return browser.runtime.sendMessage(msg) as Promise<Reply<T>>;
}

/** Send to the capture script in the top frame of a tab. */
export function sendToTab<T extends MessageType>(
  tabId: number,
  msg: Message<T>,
): Promise<Reply<T>> {
  return browser.tabs.sendMessage(tabId, msg, { frameId: 0 }) as Promise<Reply<T>>;
}

type Handler<T extends MessageType> = (
  msg: Message<T>,
  sender: Browser.runtime.MessageSender,
) => Reply<T> | Promise<Reply<T>>;

export type Handlers = { [T in MessageType]?: Handler<T> };

/**
 * Registers one runtime.onMessage listener that dispatches by `type`. Uses the
 * sendResponse + `return true` form, which every supported Chrome version understands.
 */
export function createRouter(handlers: Handlers): void {
  browser.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    const type = (raw as { type?: unknown } | null)?.type;
    if (typeof type !== 'string' || !(type in handlers)) return false;
    const handler = handlers[type as MessageType] as Handler<MessageType>;
    Promise.resolve()
      .then(() => handler(raw as Message, sender))
      .then(
        (reply) => sendResponse(reply),
        (err: unknown) => {
          console.error(`[AnswerSnap] ${type} handler failed`, err);
          sendResponse(undefined);
        },
      );
    return true;
  });
}
