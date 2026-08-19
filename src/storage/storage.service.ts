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

  snapshotPath(whiteboardId: string, pageId?: string): string {
    return pageId
      ? `snapshot_${whiteboardId}_${pageId}.png`
      : `snapshot_${whiteboardId}.png`;
  }

  async uploadSnapshot(
    whiteboardId: string,
    pageId: string,
    buffer: Buffer,
    mimeType = 'image/png',
    previousPath?: string | null,
  ): Promise<{ storagePath: string; imageUrl: string }> {
    if (!this.client) {
      throw new InternalServerErrorException(
        'Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
      );
    }

    const storagePath = `snapshot_${whiteboardId}_${pageId}_${Date.now()}.png`;

    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(storagePath, buffer, {
        upsert: false,
        contentType: mimeType,
        cacheControl: '0',
      });

    if (error) {
      throw new InternalServerErrorException(
        `Failed to upload snapshot: ${error.message}`,
      );
    }

    const stale = new Set<string>([
      this.snapshotPath(whiteboardId),
      this.snapshotPath(whiteboardId, pageId),
    ]);
    if (previousPath) stale.add(previousPath);
    await this.client.storage.from(this.bucket).remove([...stale]);

    const { data } = this.client.storage
      .from(this.bucket)
      .getPublicUrl(storagePath);

    return {
      storagePath,
      imageUrl: `${data.publicUrl}?v=${Date.now()}`,
    };
  }

  async deleteSnapshot(
    whiteboardId: string,
    storagePath?: string | null,
    pageId?: string,
  ): Promise<void> {
    if (!this.client) return;

    const stale = new Set<string>([this.snapshotPath(whiteboardId)]);
    if (pageId) stale.add(this.snapshotPath(whiteboardId, pageId));
    if (storagePath) stale.add(storagePath);
    await this.client.storage.from(this.bucket).remove([...stale]);
  }

  async copySnapshot(
    sourcePath: string,
    whiteboardId: string,
    pageId: string,
  ): Promise<{ storagePath: string; imageUrl: string } | null> {
    if (!this.client || !sourcePath) return null;

    const { data, error } = await this.client.storage
      .from(this.bucket)
      .download(sourcePath);
    if (error || !data) return null;

    const buffer = Buffer.from(await data.arrayBuffer());
    return this.uploadSnapshot(whiteboardId, pageId, buffer);
  }

  async downloadSnapshot(storagePath: string): Promise<Buffer | null> {
    if (!this.client || !storagePath) return null;
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .download(storagePath);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }

  async deleteSnapshots(storagePaths: string[]): Promise<void> {
    if (!this.client || storagePaths.length === 0) return;
    await this.client.storage.from(this.bucket).remove(storagePaths);
  }

  async uploadAvatar(
    userId: string,
    buffer: Buffer,
    mimeType: string,
    previousUrl?: string | null,
  ): Promise<{ storagePath: string; imageUrl: string }> {
    if (!this.client) {
      throw new InternalServerErrorException(
        'Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
      );
    }

    const ext =
      mimeType === 'image/png'
        ? 'png'
        : mimeType === 'image/webp'
          ? 'webp'
          : mimeType === 'image/gif'
            ? 'gif'
            : 'jpg';
    const storagePath = `avatars/${userId}.${ext}`;

    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(storagePath, buffer, {
        upsert: true,
        contentType: mimeType,
        cacheControl: '3600',
      });

    if (error) {
      throw new InternalServerErrorException(
        `Failed to upload avatar: ${error.message}`,
      );
    }

    const previousPath = this.pathFromPublicUrl(previousUrl);
    if (previousPath && previousPath !== storagePath) {
      await this.client.storage.from(this.bucket).remove([previousPath]);
    }

    const { data } = this.client.storage
      .from(this.bucket)
      .getPublicUrl(storagePath);

    return {
      storagePath,
      imageUrl: `${data.publicUrl}?v=${Date.now()}`,
    };
  }

  async deleteAvatar(previousUrl?: string | null): Promise<void> {
    if (!this.client) return;
    const previousPath = this.pathFromPublicUrl(previousUrl);
    if (!previousPath) return;
    await this.client.storage.from(this.bucket).remove([previousPath]);
  }

  async uploadSupportAttachment(
    ticketId: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ storagePath: string; imageUrl: string }> {
    if (!this.client) {
      throw new InternalServerErrorException(
        'Supabase Storage is not configured.',
      );
    }
    const ext = mimeType === 'image/png' ? 'png' : 'jpg';
    const storagePath = `support-attachments/${ticketId}/${Date.now()}.${ext}`;
    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(storagePath, buffer, {
        upsert: false,
        contentType: mimeType,
        cacheControl: '3600',
      });
    if (error) {
      throw new InternalServerErrorException(
        `Failed to upload attachment: ${error.message}`,
      );
    }
    const { data } = this.client.storage
      .from(this.bucket)
      .getPublicUrl(storagePath);
    return { storagePath, imageUrl: data.publicUrl };
  }

  async estimateStorageBytes() {
    if (!this.client) return { configured: false, bytes: 0 };
    let bytes = 0;
    const { data } = await this.client.storage.from(this.bucket).list('', {
      limit: 1000,
    });
    for (const file of data ?? []) {
      const size = (file.metadata as { size?: number } | undefined)?.size;
      if (typeof size === 'number') bytes += size;
    }
    return { configured: true, bytes };
  }

  private pathFromPublicUrl(url?: string | null): string | null {
    if (!url) return null;
    const marker = `/object/public/${this.bucket}/`;
    const index = url.indexOf(marker);
    if (index === -1) return null;
    return decodeURIComponent(
      url.slice(index + marker.length).split('?')[0] ?? '',
    );
  }
}
