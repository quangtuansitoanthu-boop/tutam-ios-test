export const GOOGLE_IOS_CONFIGURATION_REQUIRED = 'Bản iOS chưa được cấu hình đăng nhập Google. Vui lòng cập nhật bản ứng dụng đã được cấu hình đầy đủ.';

export const FACEBOOK_BROWSER_ERRORS = {
  invalid: 'Kết quả đăng nhập Facebook không hợp lệ. Vui lòng thử lại.',
  busy: 'Đang đăng nhập Facebook. Vui lòng hoàn tất hoặc đóng cửa sổ đăng nhập.',
  stale: 'Phiên đăng nhập đã thay đổi. Vui lòng thử lại.',
  cancelled: 'Đã hủy đăng nhập.',
} as const;

export const SESSION_VERIFICATION_UNAVAILABLE = {
  vi: 'Chưa thể xác minh phiên đăng nhập. Vui lòng thử lại.',
  en: 'Could not verify your session. Please try again.',
} as const;

export const APPLE_SIGN_IN_UNAVAILABLE = {
  vi: 'Chưa thể đăng nhập bằng Apple. Vui lòng thử lại hoặc chọn đăng nhập bằng Google.',
  en: 'Could not sign in with Apple. Please try again or sign in with Google.',
} as const;

export const NATIVE_SESSION_RECOVERY = {
  vi: {
    action: 'Đăng nhập lại',
    chooseAccount: 'Chọn tài khoản bạn đã dùng để đồng bộ tiến độ trên máy này.',
    online: 'Bạn vẫn có thể tu tập ngoại tuyến. Hãy đăng nhập lại để tiếp tục đồng bộ tiến độ.',
    offline: 'Bạn vẫn có thể tu tập ngoại tuyến. Khi có mạng, hãy đăng nhập lại để tiếp tục đồng bộ.',
  },
  en: {
    action: 'Sign in again',
    chooseAccount: 'Choose the account you used to sync your progress on this device.',
    online: 'You can keep practicing offline. Sign in again to resume syncing your progress.',
    offline: 'You can keep practicing offline. Sign in again when you are online to resume syncing.',
  },
} as const;
