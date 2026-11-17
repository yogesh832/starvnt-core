type Input = Record<string, unknown>;
type Sender = (route: string, body: Input) => Promise<unknown>;

// A timeout can occur after the server committed an append-only receipt. Keep
// its request identity and revision until the identical request is reconciled.
export class ExternalMutation {
  private pending: { signature: string; route: string; body: Input } | null = null;
  private key: () => string;
  constructor(key: () => string) { this.key = key; }
  get unresolved() { return this.pending !== null; }
  async submit(route: string, input: Input, revision: number, send: Sender) {
    const signature = JSON.stringify({ route, input });
    if (this.pending && this.pending.signature !== signature) throw new Error('The previous action may have been saved. Retry that action before recording different details.');
    this.pending ||= { signature, route, body: { ...input, revision, idempotencyKey: this.key() } };
    return this.retry(send);
  }
  async retry(send: Sender) {
    if (!this.pending) throw new Error('There is no unresolved action to retry.');
    try {
      const result = await send(this.pending.route, this.pending.body);
      this.pending = null; return result;
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status && status >= 400 && status < 500) this.pending = null;
      throw error;
    }
  }
}
