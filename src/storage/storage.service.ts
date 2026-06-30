import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class StorageService {
  private readonly client: SupabaseClient | null;
  private readonly bucket: string;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    this.bucket =
      process.env.SUPABASE_STORAGE_BUCKET ?? 'whiteboard_snapshots';

    if (url && serviceRoleKey) {
      this.client = createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    } else {
      this.client = null;
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  snapshotPath(whiteboardId: string): string {
    return `snapshot_${whiteboardId}.png`;
  }

  async uploadSnapshot(
    whiteboardId: string,
    buffer: Buffer,
    mimeType = 'image/png',
  ): Promise<{ storagePath: string; imageUrl: string }> {
    if (!this.client) {
      throw new InternalServerErrorException(
        'Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
      );
    }

    const storagePath = this.snapshotPath(whiteboardId);

    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(storagePath, buffer, {
        upsert: true,
        contentType: mimeType,
        cacheControl: '3600',
      });

    if (error) {
      throw new InternalServerErrorException(
        `Failed to upload snapshot: ${error.message}`,
      );
    }

    const { data } = this.client.storage
      .from(this.bucket)
      .getPublicUrl(storagePath);

    return { storagePath, imageUrl: data.publicUrl };
  }

  async deleteSnapshot(whiteboardId: string): Promise<void> {
    if (!this.client) return;

    const storagePath = this.snapshotPath(whiteboardId);
    await this.client.storage.from(this.bucket).remove([storagePath]);
  }
}
