import { Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type NoteLiveMessage =
  | { kind: 'saved'; note: Record<string, unknown> }
  | { kind: 'deleted'; id: string };

@Injectable()
export class NotesRealtime {
  private readonly logger = new Logger(NotesRealtime.name);
  private readonly client: SupabaseClient | null;
  private readonly channels = new Map<string, Promise<RealtimeChannel | null>>();

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    this.client =
      url && key
        ? createClient(url, key, {
            auth: { persistSession: false, autoRefreshToken: false },
          })
        : null;
  }

  publish(userId: string, message: NoteLiveMessage) {
    if (!this.client) return;
    void this.channelFor(userId)
      .then((channel) =>
        channel?.send({ type: 'broadcast', event: 'note', payload: message }),
      )
      .catch((error: unknown) => {
        this.logger.warn(
          `Note live update failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        this.channels.delete(userId);
      });
  }

  private channelFor(userId: string) {
    const existing = this.channels.get(userId);
    if (existing) return existing;
    const pending = this.openChannel(userId);
    this.channels.set(userId, pending);
    return pending;
  }

  private openChannel(userId: string) {
    const client = this.client;
    if (!client) return Promise.resolve(null);
    const channel = client.channel(`notes:${userId}`);
    return new Promise<RealtimeChannel | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), 8000);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timer);
          resolve(channel);
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timer);
          resolve(null);
        }
      });
    });
  }
}
