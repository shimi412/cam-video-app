/** An error whose text is written for the client and may be shown as is. Never carries a provider
 * error: the software reformulates internally (Shimi, 2026-10-22). */
export class ClientMessage extends Error{}
