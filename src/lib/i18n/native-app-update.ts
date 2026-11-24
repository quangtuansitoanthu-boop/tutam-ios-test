export const nativeAppUpdateText = {
  vi: {
    title: (version: string) => `Ứng dụng Tu tập Phật pháp có bản mới ${version}`,
    subtitle: 'Phiên bản mới đã sẵn sàng trên Cửa hàng',
    message: 'Mời bạn cập nhật để sửa các lỗi đã ghi nhận và trải nghiệm ứng dụng mượt mà, ổn định hơn.',
    later: 'Để sau',
    update: 'Cập nhật',
    storeFailed: (name: string) => `Chưa mở được ${name}. Hãy thử lại hoặc chọn Để sau.`,
  },
  en: {
    title: (version: string) => `Tu Tap Phat Phap ${version} is available`,
    subtitle: 'New version ready on the Store',
    message: 'Please update for bug fixes and a smoother, more reliable daily practice experience.',
    later: 'Later',
    update: 'Update',
    storeFailed: (name: string) => `Could not open ${name}. Try again or choose Later.`,
  },
};
