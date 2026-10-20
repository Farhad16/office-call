/**
 * Plays items one at a time, in arrival order. The same id is never queued twice,
 * so a request received both live and again after a reconnect is spoken once.
 */
export class AnnouncementQueue<T extends { id: number }> {
  private items: T[] = [];
  private seen = new Set<number>();
  private running = false;

  constructor(private readonly handle: (item: T) => Promise<void>) {}

  /** Returns false if this id was already queued or played. */
  add(item: T): boolean {
    if (this.seen.has(item.id)) return false;
    this.seen.add(item.id);
    this.items.push(item);
    void this.run();
    return true;
  }

  has(id: number): boolean {
    return this.seen.has(id);
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.items.length) {
        const item = this.items.shift()!;
        try {
          await this.handle(item);
        } catch (err) {
          console.error('Announcement failed', err);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
