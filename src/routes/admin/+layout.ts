import { getBrowserSessionSnapshot, refreshBrowserSession } from '$lib/stores/session.svelte';
import type { LayoutLoad } from './$types';

export const ssr = false;
export const prerender = false;

export const load: LayoutLoad = async () => {
  // Khi đang điều hướng trong ứng dụng và đã có phiên đăng nhập trong bộ nhớ,
  // dùng ngay snapshot để mở trang quản trị tức thì mà không bị trễ do chờ gọi mạng.
  const snapshot = getBrowserSessionSnapshot();
  if (snapshot.authenticated && snapshot.user) {
    // Làm mới phiên ngầm trong nền mà không chặn việc chuyển trang
    void refreshBrowserSession().catch(() => undefined);
    return { session: snapshot };
  }
  // Khi người dùng truy cập trực tiếp bằng URL trên trình duyệt
  const session = await refreshBrowserSession();
  return { session };
};
