import { ServerInputError } from '../errors';

export async function checkRateLimit(binding: { limit?: (input: { key: string }) => Promise<{ success?: boolean }> } | null | undefined, key: string): Promise<boolean> {
  if (!binding || typeof binding.limit !== 'function') return true;
  try {
    const result = await binding.limit({ key });
    return result.success !== false;
  } catch {
    throw new ServerInputError(503, 'service_unavailable', 'Hệ thống tạm thời chưa sẵn sàng. Vui lòng thử lại sau.');
  }
}
