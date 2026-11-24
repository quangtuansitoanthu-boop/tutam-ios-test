export type GuideEditorialStatus = 'verified-software' | 'verified' | 'pending-doctrinal-review';

export interface GuideItem {
  title: string;
  text: string;
}

export type GuideBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'steps'; items: GuideItem[] }
  | { type: 'cards'; items: GuideItem[] }
  | { type: 'bullets'; title?: string; items: string[] }
  | { type: 'callout'; tone: 'note' | 'warning'; title: string; text: string }
  | { type: 'quote'; title: string; lines: string[] }
  | { type: 'link'; href: string; label: string; text: string; buttonLabel?: string; externalActions?: boolean };

export interface GuideTopic {
  id: string;
  title: string;
  keywords: string[];
  blocks: GuideBlock[];
}

export interface GuideFaq {
  id: string;
  question: string;
  keywords: string[];
  answer: string[];
  editorialStatus: GuideEditorialStatus;
}

export interface GuideSection {
  id: string;
  icon: string;
  title: string;
  shortTitle: string;
  keywords: string[];
  editorialStatus: GuideEditorialStatus;
  introduction: string[];
  topics: GuideTopic[];
  faqs?: GuideFaq[];
}

export interface GuideSearchTarget {
  id: string;
  sectionId: string;
  kind: 'section' | 'topic' | 'faq';
  title: string;
  context: string;
  keywords: string[];
}

export const guideInstallTarget: GuideSearchTarget = {
  id: 'cai-app',
  sectionId: 'cai-app',
  kind: 'section',
  title: 'Cài đặt ứng dụng lên màn hình',
  context: 'Cài App',
  keywords: ['cài app', 'pwa', 'màn hình chính', 'offline', 'quên cài app', 'ios', 'android'],
};

export const softwareGuideSections: GuideSection[] = [
  {
    "id": "dung-web",
    "icon": "📱",
    "title": "Hướng dẫn chung",
    "shortTitle": "Hướng dẫn chung",
    "keywords": [
      "trang chủ",
      "kinh sách",
      "tu tập",
      "pháp thoại",
      "cá nhân",
      "offline",
      "ngoại tuyến",
      "công phu",
      "đại tạng kinh",
      "nghi thức",
      "sách nhân quả",
      "dark mode",
      "chế độ tối",
      "widget",
      "chuông mõ"
    ],
    "editorialStatus": "verified-software",
    "introduction": [
      "Dùng năm mục Trang chủ, Kinh sách, Tu tập, Pháp thoại và Cá nhân để tìm đúng chức năng. Các bước bên dưới mô tả giao diện hiện tại; một số nút chỉ xuất hiện khi nội dung hoặc tài khoản có hỗ trợ."
    ],
    "topics": [
      {
        "id": "trang-chu-va-tim-kiem",
        "title": "Trang chủ và tìm kinh sách",
        "keywords": [
          "trang chủ",
          "kinh sách",
          "tìm kiếm",
          "đọc tiếp",
          "mục lục",
          "đại tạng kinh",
          "kinh điển",
          "nhân quả",
          "tổ sư",
          "chương hồi",
          "Trang chủ và tìm kinh sách",
          "Home and the reading library"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Đi từ thanh điều hướng",
                "text": "Dùng Trang chủ, Kinh sách, Tu tập, Pháp thoại và Cá nhân để chuyển khu vực. Trang chủ có lịch âm dương, lời nhắc trong ngày, ngày lễ cá nhân và lối vào lịch ăn chay."
              },
              {
                "title": "Tìm và mở sách",
                "text": "Vào Kinh sách, nhập tên vào ô tìm kiếm hoặc mở Lọc. Chọn sách, mở mục lục rồi chọn chương. Thư viện của bạn giúp tìm lại sách đang đọc và nội dung đã lưu."
              },
              {
                "title": "Tiếp tục đọc",
                "text": "Mở sách đang đọc hoặc dấu trang để trở về chương và vị trí đã lưu. Danh mục có thể khác nhau giữa iOS, Android và web; một số nội dung chỉ có tiếng Việt."
              }
            ]
          }
        ]
      },
      {
        "id": "tu-tap-tren-web",
        "title": "Tìm công cụ trong trang Tu tập",
        "keywords": [
          "bắt đầu công phu",
          "lễ phật",
          "thiền định",
          "lần hạt",
          "khóa tụng",
          "chép kinh",
          "chép danh hiệu",
          "mõ",
          "nhạc thiền",
          "tự động cuộn",
          "hồi hướng",
          "Tìm công cụ trong trang Tu tập",
          "Find a practice tool"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Chọn việc muốn thực hành",
                "text": "Trong Tu tập, phần Đồng Hành Tu Tập có Tiếp tục công phu, Lịch ăn chay đủ dinh dưỡng, Thời khóa tu tập, Công phu của tôi, Quán chiếu và lối vào cộng đồng."
              },
              {
                "title": "Mở Chế Độ Hành Trì",
                "text": "Cuộn xuống để chọn thiền, lần tràng hạt, lễ Phật, chép kinh, chép danh hiệu, giữ giới, Bát quan trai, tiết dục, tụng kinh, trì chú hoặc nghi thức. Đọc hướng dẫn của công cụ trước khi bắt đầu."
              },
              {
                "title": "Chọn bài cụ thể",
                "text": "Ở Tụng, đọc kinh, Trì chú hoặc Nghi thức khác, chọn bài và phẩm cần thực hành. Đọc phần lưu ý nếu bài có hiển thị; không phải mọi nội dung đều có audio hoặc bản dịch."
              }
            ]
          }
        ]
      },
      {
        "id": "giao-dien-va-chuyen-dong",
        "title": "Giao diện, ngôn ngữ và cỡ chữ",
        "keywords": [
          "giao diện",
          "dark mode",
          "chế độ tối",
          "cỡ chữ",
          "phông chữ",
          "hiệu ứng chuyển động",
          "giảm chuyển động",
          "thị lực",
          "Giao diện, ngôn ngữ và cỡ chữ",
          "Appearance, language and text size"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Mở cài đặt",
                "text": "Vào Cá nhân → Cài đặt ứng dụng → Giao diện & ngôn ngữ. Chọn nền Tự động, Trắng, Be nhạt, Xám, Tím nhạt hoặc Tối; dùng cỡ chữ giao diện để điều chỉnh các màn và nút."
              },
              {
                "title": "Đổi ngôn ngữ",
                "text": "Chọn Tiếng Việt hoặc English. Khi chuyển sang tiếng Anh, chờ gói sách tiếng Anh tải xong; nếu bị gián đoạn, kiểm tra mạng và dung lượng rồi bấm Retry. Ngôn ngữ giao diện không bảo đảm mọi bản ghi âm, bìa sách hay công thức đều đã dịch."
              },
              {
                "title": "Phân biệt hai cỡ chữ",
                "text": "Cỡ chữ giao diện khác với cỡ chữ nội dung đọc. Mở Đọc kinh sách hoặc công cụ trong trình đọc để chỉnh phông, cỡ chữ và nền giấy. Hiệu ứng chuyển động có thể tắt; tùy chọn giảm chuyển động của hệ thống vẫn được tôn trọng."
              }
            ]
          }
        ]
      },
      {
        "id": "widget-man-hinh-chinh",
        "title": "Thêm widget lên màn hình chính",
        "keywords": [
          "widget",
          "tiện ích",
          "màn hình chính",
          "lịch âm",
          "thập trai",
          "ngày chay",
          "pháp thoại",
          "tu tập",
          "android",
          "ios",
          "Thêm widget lên màn hình chính",
          "Add a home-screen widget"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Chọn widget",
                "text": "Trên Android, nhấn giữ vùng trống ở màn hình chính rồi mở Widget. Trên iPhone/iPad, mở chế độ sửa màn hình chính và bảng thêm tiện ích. Tìm Tu Tập Phật Pháp, chọn Lịch, Tu tập hoặc Pháp thoại và kích cỡ được hệ điều hành hỗ trợ."
              },
              {
                "title": "Mở đúng nội dung",
                "text": "Chạm nội dung hoặc hành động trên widget để vào phần tương ứng trong app. Widget sử dụng dữ liệu đã có; khi chưa có dữ liệu, mở app để thiết lập hoặc thực hành. Chạm mở công cụ không tự ghi nhận hoàn thành."
              },
              {
                "title": "Hiểu thời điểm cập nhật",
                "text": "Hệ điều hành quyết định lịch làm mới. Widget có thể chưa phản ánh ngay thay đổi khi app đóng; không dùng widget thay cho báo thức hoặc bằng chứng dữ liệu đã đồng bộ."
              }
            ]
          }
        ]
      },
      {
        "id": "dong-bo-nut-quay-lai-android",
        "title": "Quay lại và đóng bảng đang mở",
        "keywords": [
          "nút quay lại",
          "nút back",
          "cử chỉ vuốt",
          "android",
          "ios",
          "bảo vệ công phu",
          "chốt sổ",
          "thoát an toàn",
          "Quay lại và đóng bảng đang mở",
          "Back navigation and closing panels"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Đóng lớp đang mở trước",
                "text": "Dùng nút đóng hoặc Quay lại để đóng bảng chọn, hộp công cụ hay hộp thoại trước khi rời màn. Trên Android, nút Back cũng được dùng trong luồng này; trên iOS dùng nút quay lại trong ứng dụng."
              },
              {
                "title": "Kết thúc phiên có chủ ý",
                "text": "Trong lần hạt, thiền, lễ Phật hoặc thời khóa, phân biệt tạm dừng với kết thúc. Đọc hộp xác nhận và tình trạng lưu; nếu báo lỗi lưu, xử lý trước khi xóa dữ liệu hoặc gỡ app."
              }
            ]
          }
        ]
      },
      {
        "id": "doc-offline-khong-can-mang",
        "title": "Nội dung nào dùng được khi ngoại tuyến?",
        "keywords": [
          "offline",
          "ngoại tuyến",
          "không cần mạng",
          "không có internet",
          "đóng gói sẵn",
          "tải pdf",
          "tải audio",
          "chế độ máy bay",
          "Nội dung nào dùng được khi ngoại tuyến?",
          "What works offline?"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Sách và nghi thức đóng sẵn",
                "text": "Các bài có trong gói app có thể mở mà không cần mạng. Danh mục phụ thuộc nền tảng và phiên bản; không phải mọi sách, ảnh, PDF, bản dịch hoặc video đều được đóng sẵn."
              },
              {
                "title": "Tải trước phần cần dùng",
                "text": "Khi còn mạng, dùng nút tải của tài liệu hoặc album được hỗ trợ, chờ hoàn tất rồi mở lại để kiểm tra. PDF, audio và video chưa tải xong vẫn cần mạng. Gói tiếng Anh tải riêng, trừ các nghi thức được đóng sẵn."
              },
              {
                "title": "Giữ dữ liệu trên máy",
                "text": "Không xóa dữ liệu ứng dụng để xử lý lỗi tải. Bản chép, ghi chú hoặc công phu chưa đồng bộ có thể chỉ nằm trên thiết bị; gỡ app hoặc xóa dữ liệu trình duyệt có thể làm mất chúng."
              }
            ]
          }
        ]
      },
      {
        "id": "cap-nhat-noi-dung",
        "title": "Kiểm tra và tải cập nhật nội dung",
        "keywords": [
          "cập nhật nội dung",
          "sách mới",
          "hiệu đính",
          "bản in mới",
          "đồng bộ kinh sách",
          "dung lượng tải",
          "Kiểm tra và tải cập nhật nội dung",
          "Check and download content updates"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Mở từ Trang chủ",
                "text": "Tìm Cập nhật nội dung ở Trang chủ rồi bấm để kiểm tra. Cần kết nối mạng; ứng dụng cho xem nội dung và dung lượng trước khi tải."
              },
              {
                "title": "Theo dõi tải",
                "text": "Chọn cập nhật cần dùng và chờ thông báo hoàn tất. Nếu mạng gián đoạn hoặc thiếu bộ nhớ, khôi phục điều kiện rồi thử lại. Đừng coi việc đã bấm tải là đã có nội dung ngoại tuyến."
              },
              {
                "title": "Phân biệt nội dung với phiên bản app",
                "text": "Cập nhật nội dung không thay thế bản cập nhật trên App Store hoặc Google Play. Các chức năng và sửa lỗi mới cần cài phiên bản ứng dụng tương ứng."
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "id": "doc-sach",
    "icon": "📖",
    "title": "Đọc sách, PDF và trích dẫn",
    "shortTitle": "Đọc Sách",
    "keywords": [
      "pdf",
      "hai trang",
      "thumbnail",
      "mục lục",
      "sepia",
      "highlight",
      "ghi chú",
      "tts",
      "offline",
      "cỡ chữ",
      "phông chữ",
      "nền giấy",
      "dấu trang",
      "epub",
      "trích dẫn"
    ],
    "editorialStatus": "verified-software",
    "introduction": [
      "Phân biệt sách văn bản, PDF và bản ghi âm để dùng đúng công cụ. Nội dung đóng sẵn mở ngoại tuyến được; các tệp chưa có trên máy cần tải trước."
    ],
    "topics": [
      {
        "id": "doc-pdf",
        "title": "Mở sách văn bản và PDF",
        "keywords": [
          "two page",
          "hai trang song song",
          "outline",
          "thumbnail",
          "zoom",
          "vừa màn hình",
          "sepia",
          "pdf",
          "mục lục",
          "thanh công cụ",
          "dấu trang",
          "đọc sách",
          "Mở sách văn bản và PDF",
          "Open text books and PDFs"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Sách văn bản",
                "text": "Chọn sách trong Kinh sách, mở mục lục rồi chọn chương. Dùng Công cụ để chỉnh cách đọc. Khi quay lại từ sách đang đọc hoặc dấu trang, app khôi phục vị trí đã lưu khi dữ liệu còn sẵn."
              },
              {
                "title": "Tài liệu PDF",
                "text": "Mở tài liệu có nhãn PDF và chờ tải. Dùng điều khiển trang, thu/phóng phù hợp; cỡ chữ và phông của sách văn bản không làm thay đổi chữ in trong trang PDF."
              }
            ]
          }
        ]
      },
      {
        "id": "chi-tiet-thanh-cong-cu-doc",
        "title": "Tùy chỉnh công cụ đọc",
        "keywords": [
          "công cụ đọc",
          "cỡ chữ",
          "phông chữ",
          "chữ đậm",
          "khoảng cách dòng",
          "nền giấy",
          "đánh dấu",
          "nghe bài",
          "chia sẻ",
          "tải về",
          "cuộn tự động",
          "tts",
          "epub",
          "bookerly",
          "merriweather",
          "literata",
          "san francisco",
          "Tùy chỉnh công cụ đọc",
          "Use the reading tools"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Chữ và nền",
                "text": "Mở Công cụ đọc để chỉnh A−/A+, phông, chữ đậm, giãn dòng và nền giấy theo những lựa chọn đang hiện. Các tùy chọn này dành cho nội dung văn bản; PDF dùng điều khiển riêng."
              },
              {
                "title": "Điều hướng và lưu vị trí",
                "text": "Dùng mục lục để đổi chương; dùng dấu trang và danh sách dấu trang để đánh dấu, mở lại vị trí. Trong màn thực hành kinh/chú có menu nổi, ↑ Đầu và ↓ Cuối đưa về đầu hoặc cuối nội dung đang mở."
              },
              {
                "title": "Nghe, cuộn và chia sẻ",
                "text": "Dùng Đọc thành tiếng hoặc cuộn tự động nếu nội dung có hỗ trợ. Giọng đọc phụ thuộc thiết bị, ngôn ngữ và dữ liệu văn bản, không thay cho bản thu pháp thoại. Chia sẻ liên kết hoặc xuất EPUB khi nút tương ứng có sẵn."
              }
            ]
          }
        ]
      },
      {
        "id": "ghi-chu-va-trich-dan",
        "title": "Ghi chú và trích dẫn đã lưu",
        "keywords": [
          "highlight",
          "annotation",
          "ghi chú cá nhân",
          "my quotes",
          "trích dẫn của tôi",
          "trích dẫn đã lưu",
          "bôi đen",
          "tô sáng",
          "lời phật dạy",
          "Ghi chú và trích dẫn đã lưu",
          "Notes and saved quotes"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Chọn đoạn muốn lưu",
                "text": "Trong sách văn bản hỗ trợ chọn chữ, chọn một đoạn rồi dùng hành động tô sáng, ghi chú hoặc lưu trích dẫn đang hiện. Kiểm tra lại nội dung và nơi lưu trước khi rời màn."
              },
              {
                "title": "Tìm lại và chia sẻ",
                "text": "Vào Cá nhân → Trích dẫn đã lưu để mở lại. Với chức năng tạo ảnh trích dẫn, xem ảnh trước khi lưu hoặc chia sẻ. Lưu trên thiết bị và đồng bộ tài khoản là hai trạng thái khác nhau; xem thông báo thực tế của app."
              }
            ]
          }
        ]
      },
      {
        "id": "pdf-nghe-va-offline",
        "title": "Tải PDF và dùng đọc thành tiếng",
        "keywords": [
          "tts",
          "đọc thành tiếng",
          "nghe trang này",
          "indexeddb",
          "mất mạng",
          "lưu offline",
          "80 mb",
          "pdf offline",
          "tài liệu scan",
          "không cần mạng",
          "Tải PDF và dùng đọc thành tiếng",
          "PDF downloads and text-to-speech"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Tải bản ngoại tuyến",
                "text": "Ở tài liệu PDF có hỗ trợ, bấm tải và chờ hoàn tất. Mở lại khi không có mạng để kiểm tra. Nếu tệp bị gián đoạn, dùng thử lại thay vì xóa dữ liệu ứng dụng."
              },
              {
                "title": "Hiểu giới hạn giọng đọc",
                "text": "Đọc thành tiếng cần nội dung chữ và giọng phù hợp trên thiết bị. PDF dạng ảnh quét có thể không có chữ để đọc; không phải mọi tài liệu đều nghe được. Audio pháp thoại cần phát hoặc tải từ phần Pháp thoại."
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "id": "cong-cu-tu-tap",
    "icon": "📿",
    "title": "Công cụ và tiến độ tu tập",
    "shortTitle": "Tu Tập",
    "keywords": [
      "lễ phật",
      "sám hối",
      "lạy phật",
      "chiêm bái",
      "chư phật",
      "đếm lạy",
      "108 lạy",
      "tràng hạt",
      "rosary",
      "tọa thiền",
      "timer",
      "mục tiêu",
      "gợi ý",
      "heatmap",
      "cộng tu"
    ],
    "editorialStatus": "verified-software",
    "introduction": [
      "Chọn công cụ phù hợp, đọc hướng dẫn và ghi nhận đúng phần đã thực hành. Thời khóa kết hợp nhiều hoạt động; món chay hỗ trợ thực đơn và chuẩn bị bữa ăn."
    ],
    "topics": [
      {
        "id": "che-do-le-phat",
        "title": "Chế độ Lễ Phật & Sám Hối (Chiêm bái & Đếm lạy thông minh)",
        "keywords": [
          "lễ phật",
          "sám hối",
          "lạy phật",
          "đếm lạy",
          "chiêm bái",
          "chư phật",
          "bồ tát",
          "chuông lễ phật",
          "mõ gõ",
          "nhạc thiền",
          "wake lock",
          "sổ công phu",
          "108 lạy",
          "21 lạy",
          "tam quy",
          "thích ca",
          "a di đà",
          "quán thế âm",
          "địa tạng",
          "dược sư",
          "chuẩn đề",
          "đại thế chí",
          "hộ pháp vi đà"
        ],
        "blocks": [
          {
            "type": "callout",
            "tone": "note",
            "title": "Ý nghĩa thù thắng của Lễ Phật Sám Hối",
            "text": "Kinh điển Phật giáo dạy rằng đảnh lễ Tam Bảo là pháp môn đệ nhất để hàng phục bản ngã, tiêu trừ túc nghiệp nhiều đời, phát khởi tâm chí thành khiêm hạ và tích lũy vô lượng phước đức. Chế độ Lễ Phật & Sám Hối trên ứng dụng Tu Tập Phật Pháp trợ duyên quý đạo hữu đối trước tôn tượng chư Phật và Bồ Tát trang nghiêm để nhiếp trọn ba nghiệp Thân - Khẩu - Ý thanh tịnh, chí thành sám hối dù ở tư gia, phòng trọ, chốn tha hương hay nơi chưa tiện thiết lập bàn thờ trang nghiêm."
          },
          {
            "type": "steps",
            "items": [
              {
                "title": "Chọn tôn tượng và mục tiêu",
                "text": "Vào Tu tập → Lễ Phật & Sám Hối. Quý đạo hữu nhẹ nhàng vuốt chọn hoặc bấm mũi tên để chiêm bái 14 tôn tượng Phật và Bồ Tát trang nghiêm cúng dường đạo tràng: Đức Bổn Sư Thích Ca Mâu Ni Phật, Phật A Di Đà, Bồ Tát Quán Thế Âm, Bồ Tát Địa Tạng Vương, Phật Dược Sư Lưu Ly Quang, Phật Mẫu Chuẩn Đề, Bồ Tát Đại Thế Chí, Hộ Pháp Vi Đà Tôn Thiên... Chạm vào biểu tượng thông tin để mở hồ sơ 6 mục tìm hiểu sự tích và đại nguyện cứu độ chúng sinh thù thắng của từng đấng Từ Phụ."
              },
              {
                "title": "Thiết lập mục tiêu số lạy theo thời khóa",
                "text": "Tùy theo hoàn cảnh và đạo lực, quý Phật tử có thể phát nguyện các mốc công phu định sẵn: 3 lạy (chí tâm nương tựa Tam quy: Phật - Pháp - Tăng), 21 lạy (tiêu trừ nghiệp chướng, tật bệnh), 49 lạy (kỳ an, kỳ siêu cửu huyền thất tổ), hoặc 108 lạy sám hối đại thừa hồng danh dứt trừ 108 phiền não trần lao; hoặc chọn chế độ Tự do để tùy duyên đảnh lễ theo sức khỏe và nhịp thở."
              },
              {
                "title": "Hòa cùng tiếng Chuông ngân, Mõ đệm & Nhạc thiền",
                "text": "Trợ duyên cho đạo tràng thanh tịnh, ứng dụng hỗ trợ tiếng chuông gia trì ngân vang, tiếng mõ đệm nhịp nhàng và các khúc nhạc thiền thiêng liêng trầm bổng. Quý Phật tử hãy chọn âm thanh phù hợp và điều chỉnh âm lượng vừa đủ nghe để thân tâm lắng dịu trước khi chính thức bước vào thời khóa."
              },
              {
                "title": "Bắt đầu và đếm lạy",
                "text": "Khởi tâm chí thành cung kính, bấm BẮT ĐẦU ĐẢNH LỄ. Sau mỗi lạy cúi đầu sát đất xả bỏ ngã mạn, chạm nhẹ vào nút “Chạm để đảnh lễ một lạy” ở cuối màn hình. Mỗi lần bấm tăng một lạy, kèm âm chuông mõ trầm hùng dẫn dắt chánh niệm. Tính năng giữ sáng màn hình hoạt động tự động nhưng phụ thuộc hỗ trợ và trạng thái thiết bị của quý vị."
              },
              {
                "title": "Kiểm tra trước khi lưu",
                "text": "Khi hoàn nguyện thời khóa, bấm Hoàn tất để xem lại tổng số lạy đã thành tâm phụng hiến. Quý đạo hữu có thể điều chỉnh lại số lạy thực tế nếu có sơ sót, chọn Tiếp tục lễ Phật để lạy thêm mà vẫn giữ nguyên số đếm, hoặc Thoát không lưu nếu chỉ muốn thử nghiệm."
              },
              {
                "title": "Ghi vào Sổ công phu",
                "text": "Bấm xác nhận hoàn thành để ghi nhận trọn vẹn số lạy, thời gian và tôn tượng chiêm bái vào Sổ công phu cá nhân. Thời khóa khép lại trong niềm hỷ lạc thanh tịnh, từng giọt mồ hôi sám hối biến thành hoa sen thơm ngát dâng lên Tam Bảo mười phương."
              }
            ]
          },
          {
            "type": "link",
            "href": "/tu-tap?mode=le-phat",
            "label": "Mở Chế độ Lễ Phật & Sám Hối ngay",
            "text": "Bắt đầu thời khóa chiêm bái tôn tượng Phật, cài đặt số lạy và tiếng chuông mõ để đảnh lễ sám hối thanh tịnh thân tâm.",
            "buttonLabel": "Vào Lễ Phật"
          },
          {
            "type": "paragraph",
            "text": "Trong thời khóa, khi kết thúc bước Lễ Phật, app tiếp tục sang bước sau kể cả chưa đủ mục tiêu; chỉ giữ số lạy thực tế. Kiểm tra tình trạng lưu trước khi rời phiên."
          }
        ]
      },
      {
        "id": "trang-hat-ao",
        "title": "Lần tràng hạt: đếm tay và nhịp tự động",
        "keywords": [
          "digital rosary",
          "vuốt hạt",
          "rung",
          "haptic",
          "18 hạt",
          "27 hạt",
          "54 hạt",
          "108 hạt",
          "tràng hạt ảo",
          "lần hạt",
          "chuỗi hạt",
          "gõ mõ tự động",
          "bất niệm tự niệm",
          "xả niệm",
          "Lần tràng hạt: đếm tay và nhịp tự động",
          "Rosary beads: manual and automatic counting"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Mở phiên",
                "text": "Vào Tu tập → Lần tràng hạt, đọc giới thiệu rồi bấm Bắt đầu. Trong Tùy chọn, chọn danh hiệu hoặc câu niệm, số hạt, mục tiêu và âm thanh theo các lựa chọn đang có."
              },
              {
                "title": "Đếm thủ công",
                "text": "Chạm hoặc vuốt chuỗi hạt, hoặc bấm Niệm một hạt. Trên máy có bàn phím, dùng phím được chỉ dẫn. Kiểm tra số đang lần, số hạt trong chuỗi và số chuỗi hoàn tất."
              },
              {
                "title": "Dùng nhịp tự động",
                "text": "Mở tùy chọn nhịp tự động, đặt nhịp rồi bật khi cần. Phân biệt tạm dừng nhịp, dừng nhịp, đặt lại và kết thúc phiên; đọc xác nhận trước khi đặt lại số đếm. Kết thúc theo số thực tế, không tự coi đủ mục tiêu."
              }
            ]
          }
        ]
      },
      {
        "id": "so-quan-chieu-ca-nhan",
        "title": "Quán chiếu và ghi chép riêng tư",
        "keywords": [
          "sổ soi tâm",
          "sổ quán chiếu",
          "nhật ký riêng tư",
          "việc thiện lành",
          "biệt danh",
          "thân khẩu ý",
          "nhìn lại mình",
          "sám hối lỗi lầm",
          "Quán chiếu và ghi chép riêng tư",
          "Daily reflection and private writing"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Mở quán chiếu",
                "text": "Trong Tu tập, chọn Quán chiếu việc thiện ác trong ngày. Đọc hướng dẫn rồi nhìn lại việc đã làm, điều cần sửa và điều muốn thực hành tiếp."
              },
              {
                "title": "Chọn đúng nơi lưu",
                "text": "Lưu riêng tư và chia sẻ cộng đồng là những lựa chọn khác nhau. Chỉ dùng nút chia sẻ khi muốn công khai phần nội dung đó. Không ghi thông tin nhạy cảm của người khác; nhật ký riêng không mặc nhiên được đăng lên cộng đồng."
              }
            ]
          }
        ]
      },
      {
        "id": "cong-dong-sam-hoi-tuy-hy",
        "title": "Cộng đồng và quyền riêng tư",
        "keywords": [
          "cộng đồng",
          "phát lồ",
          "tùy hỷ",
          "cầu nguyện",
          "động viên",
          "bài của tôi",
          "sám hối cộng đồng",
          "tùy hỷ thiện lành",
          "phước đức ngang bằng",
          "Cộng đồng và quyền riêng tư",
          "Community and privacy"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Chọn tham gia",
                "text": "Mở Tham gia cộng đồng hoặc Cùng nhau tinh tấn để xem mục tiêu chung. Đọc điều kiện, chọn tham gia và dùng công cụ tương ứng. Chỉ phiên hợp lệ mới được tính theo điều kiện của từng mục tiêu."
              },
              {
                "title": "Quản lý hiển thị",
                "text": "Kiểm tra lựa chọn chia sẻ, bảng xếp hạng và trạng thái đang tu tập trong phần quyền riêng tư. Bình luận hoặc hồ sơ đang chờ duyệt chưa chắc đã công khai. Có thể báo cáo hoặc chặn qua menu của nội dung hoặc thành viên."
              }
            ]
          }
        ]
      },
      {
        "id": "khoa-le-hang-ngay",
        "title": "Tạo và thực hành thời khóa",
        "keywords": [
          "khóa lễ",
          "thời khóa",
          "lễ phật",
          "tọa thiền",
          "niệm phật",
          "hồi hướng tùy chỉnh",
          "thời khóa sáng tối",
          "chú đại bi",
          "lăng nghiêm",
          "địa tạng",
          "cầu an cầu siêu",
          "Tạo và thực hành thời khóa",
          "Create and follow a practice routine"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Tạo thời khóa",
                "text": "Vào Tu tập → Thời khóa tu tập → Tạo thời khóa mới. Đặt tên rồi dùng Thêm bước; cần ít nhất hai bước. Có thể thêm phát nguyện sám hối, thiền, lần hạt, lễ Phật, hai công cụ chép, giữ giới, Bát quan trai, tiết dục, kinh, chú, nghi thức và hồi hướng."
              },
              {
                "title": "Chỉnh từng bước",
                "text": "Mở bước để chọn nội dung và mục tiêu phù hợp. Dùng nút lên/xuống để đổi thứ tự, hoặc bỏ bước. Với kinh/chú/nghi thức và bản chép, chọn đúng nội dung muốn dùng rồi lưu thời khóa."
              },
              {
                "title": "Thực hành theo thứ tự",
                "text": "Mở thời khóa đã lưu và bắt đầu. Tạm dừng khi cần; khi kết thúc một bước, app tiếp tục sang bước sau dù chưa đạt mục tiêu. Dữ liệu giữ số lượng, thời gian thực tế; không tự tăng thành đủ mục tiêu. Kiểm tra thông báo lưu trước khi rời phiên."
              }
            ]
          }
        ]
      },
      {
        "id": "dong-bo-ca-nhan-48-gio",
        "title": "Hiểu trạng thái lưu và đồng bộ công phu",
        "keywords": [
          "48 giờ",
          "48 tiếng",
          "đồng bộ cá nhân",
          "lời hồi hướng",
          "tiết kiệm dữ liệu",
          "khôi phục thời khóa",
          "đồng bộ đám mây",
          "đổi thiết bị",
          "bảo tồn dữ liệu",
          "Hiểu trạng thái lưu và đồng bộ công phu",
          "Understand practice saving and synchronization"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Lưu trên thiết bị",
                "text": "App giữ dữ liệu thực hành theo từng công cụ. Xem Công phu của tôi hoặc tiến độ để kiểm tra. Bản chép, nhật ký riêng, tệp tải về và công phu không dùng cùng một cơ chế lưu."
              },
              {
                "title": "Đồng bộ tài khoản",
                "text": "Đăng nhập cùng tài khoản và có mạng để đồng bộ phần dữ liệu được hỗ trợ. Có dữ liệu được gom hoặc chờ gửi; không coi mốc 48 giờ là cam kết mọi dữ liệu đã lên máy chủ. Kiểm tra trạng thái và thử lại nếu app báo lỗi."
              },
              {
                "title": "Trước khi đổi máy",
                "text": "Bản chép cần dùng Lưu lên hệ thống nếu muốn lưu vào tài khoản. Không xóa dữ liệu máy cũ trước khi kiểm tra phần cần giữ đã lưu thành công; tệp ngoại tuyến và nhật ký riêng có thể không được khôi phục trên máy mới."
              }
            ]
          }
        ]
      },
      {
        "id": "toa-thien-hen-gio",
        "title": "Thiền có hướng dẫn và chế độ Tập trung",
        "keywords": [
          "meditation timer",
          "15 phút",
          "30 phút",
          "45 phút",
          "60 phút",
          "chuông",
          "đệm 30 giây",
          "tọa thiền",
          "chuông bát nhã",
          "xả thiền",
          "điều thân điều tức",
          "Thiền có hướng dẫn và chế độ Tập trung",
          "Guided meditation and Focus mode"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Thiết lập trước khi bắt đầu",
                "text": "Vào Tu tập → Thiền định. Chọn thời lượng ở Thời gian; xem các thẻ Nhạc thiền, Âm thanh và Ảnh nền để chọn theo nhu cầu. Cảm biến chuyển động là tùy chọn, không bắt buộc để ghi nhận phiên thiền."
              },
              {
                "title": "Bắt đầu phiên",
                "text": "Bấm Bắt đầu thiền; màn thiết lập cho biết thời gian chuẩn bị và chuông mở/kết phiên. Kiểm tra âm lượng, chế độ im lặng và quyền của thiết bị nếu không nghe được. Theo dõi thời gian trong phiên, không coi chuông là báo thức chắc chắn khi hệ điều hành hạn chế app."
              },
              {
                "title": "Vào và thoát Tập trung",
                "text": "Trong phiên, bấm Tập trung để chỉ xem hoa sen và lời hướng dẫn hít thở. Bấm Thoát tập trung phía trên hoặc dùng thao tác quay lại được hỗ trợ để trở về điều khiển; đồng hồ phiên vẫn tiếp tục. Tạm dừng và kết thúc là thao tác riêng."
              }
            ]
          }
        ]
      },
      {
        "id": "goi-y-va-tien-do",
        "title": "Lịch, công phu và danh hiệu tu tập",
        "keywords": [
          "lịch âm",
          "ngày vía",
          "thập trai",
          "recommendations",
          "mục tiêu ngày",
          "heatmap",
          "huy hiệu",
          "bản đồ nhiệt",
          "chuỗi ngày tinh tấn",
          "chiến dịch cộng tu",
          "thiệp hồi hướng",
          "Lịch, công phu và danh hiệu tu tập",
          "Calendar, practice records and titles"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Xem lịch",
                "text": "Trang chủ hiển thị ngày âm/dương, dải tuần và nút Xem lịch tháng. Chọn ngày để đọc thông tin tương ứng; các lời nhắc hôm nay không phải xác nhận bạn đã thực hành."
              },
              {
                "title": "Xem công phu",
                "text": "Mở Công phu của tôi hoặc Cá nhân → Tiến độ tu tập để xem theo ngày, tuần, tháng, năm và chi tiết tên công phu, số lượng, đơn vị. Dùng ghi nhận thủ công cho phần thực hành ngoài app nếu chức năng đó đang có."
              },
              {
                "title": "Huy hiệu và danh hiệu",
                "text": "Trang chủ và Tài khoản hiển thị huy hiệu/danh hiệu theo dữ liệu tu tập của tài khoản. Tài khoản có nhãn Danh hiệu tu tập. Trạng thái chưa có dữ liệu khác với đã đạt một bậc; khi đồng bộ chưa xong, kiểm tra lại kết nối và tài khoản."
              }
            ]
          }
        ]
      },
      {
        "id": "che-do-thanh-tinh",
        "title": "Tiết dục bảo thân và nhật ký riêng",
        "keywords": [
          "tiết dục bảo thân",
          "thanh tịnh tâm",
          "thanh tịnh",
          "niệm phật",
          "trì chú",
          "tiếng mõ",
          "chuông bát nhã",
          "nhân quả",
          "ấn quang",
          "thọ khang bảo giám",
          "điểm danh thanh tịnh",
          "chuyển hóa dục niệm",
          "Tiết dục bảo thân và nhật ký riêng",
          "Restraint practice and private journal"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Mở công cụ",
                "text": "Vào Tu tập → Tiết dục bảo thân, đọc hướng dẫn rồi chọn việc muốn theo dõi. Công cụ hỗ trợ tự nhìn lại và duy trì thói quen; không thay thế tư vấn chuyên môn khi bạn cần hỗ trợ sức khỏe."
              },
              {
                "title": "Hiểu nơi lưu",
                "text": "Theo dõi chuỗi ngày, các lần vượt qua thôi thúc và ghi chép theo nút đang hiện. Nhật ký riêng lưu trên thiết bị, không mặc nhiên đồng bộ như số liệu tiến độ. Kiểm tra tùy chọn chia sẻ trước khi gửi bất kỳ nội dung nào."
              }
            ]
          }
        ]
      },
      {
        "id": "cai-dat-nhac-nho-tu-tap",
        "title": "Cài lời nhắc và ngày lễ cá nhân",
        "keywords": [
          "nhắc nhở",
          "thọ khang bảo giám",
          "kiêng hành dâm",
          "thập trai",
          "ngày vía",
          "thời khóa",
          "công phu sáng",
          "công phu tối",
          "cài đặt app",
          "thông báo",
          "android",
          "ios",
          "Cài lời nhắc và ngày lễ cá nhân",
          "Set reminders and personal observances"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Mở cài đặt nhắc",
                "text": "Vào Cá nhân → Cài đặt ứng dụng. Mở Lịch âm & giới hạnh để chọn Thập Trai, Thọ Khang Bảo Giám và ngày vía; chọn giờ, nhắc trước và trong ngày theo các tùy chọn có sẵn."
              },
              {
                "title": "Thêm ngày riêng",
                "text": "Dùng Ngày lễ cá nhân ở Trang chủ hoặc Cài đặt để nhập tên ngày, chọn âm lịch/dương lịch và cách nhắc. Kiểm tra ngày quy đổi theo năm hiện tại, nhất là ngày âm hoặc tháng nhuận."
              },
              {
                "title": "Kiểm tra quyền hệ thống",
                "text": "Chỉ cấp quyền khi cần dùng thông báo. iOS kiểm tra trong Cài đặt hệ thống → Thông báo; Android có thể cần thêm quyền Báo thức và lời nhắc khi app yêu cầu. Tiết kiệm pin, chế độ tập trung và cài đặt hệ thống có thể làm trễ hoặc ẩn thông báo; không bảo đảm chuông đúng phút trong mọi trường hợp."
              }
            ]
          }
        ]
      },
      {
        "id": "chep-kinh-tren-app",
        "title": "Chép kinh: chọn nguồn, tự gõ và lưu",
        "keywords": [
          "chép kinh",
          "gõ kinh",
          "bản nháp",
          "định lực",
          "chánh niệm",
          "kinh mẫu",
          "chữ mờ",
          "lưu lên hệ thống",
          "Chép kinh: chọn nguồn, tự gõ và lưu",
          "Sutra copying: choose, type and save"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Chọn bộ kinh",
                "text": "Vào Tu tập → Chép kinh. Chọn Kinh Địa Tạng Bồ Tát Bổn Nguyện, Kinh Diệu Pháp Liên Hoa hoặc Kinh Thủ Lăng Nghiêm, rồi chọn phẩm/quyển. Bấm Xem hướng dẫn và tiếp tục, đọc hướng dẫn rồi bấm Tôi đã đọc, tiếp tục chép."
              },
              {
                "title": "Dùng kinh mẫu",
                "text": "Chọn đoạn ở Kinh mẫu; dùng đoạn trước/sau, tùy chọn cỡ chữ hoặc thu gọn phần điều khiển. Kinh mẫu theo vị trí đang gõ ở chế độ được hỗ trợ. Bật Chữ mờ nếu muốn nhìn mẫu trong vùng viết; tự gõ vào Bản chép của bạn."
              },
              {
                "title": "Rà soát và lưu",
                "text": "Bấm Rà soát để xem phần cần kiểm tra; rà soát là tham khảo, không tự sửa toàn bộ bản chép. Bản nháp tự lưu trên thiết bị. Muốn lưu vào tài khoản, đăng nhập rồi dùng Lưu lên hệ thống và kiểm tra kết quả. Gỡ app/xóa dữ liệu có thể làm mất phần chỉ lưu trên máy."
              }
            ]
          }
        ]
      },
      {
        "id": "an-chay-thuc-don-cong-thuc",
        "keywords": [
          "Ăn chay: thực đơn, công thức và đi chợ",
          "Vegan meals, recipes and shopping"
        ],
        "title": "Ăn chay: thực đơn, công thức và đi chợ",
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Mở và chọn thực đơn",
                "text": "Từ Trang chủ hoặc Tu tập, mở Lịch ăn chay đủ dinh dưỡng. Ở Hôm nay, chỉnh số người và chọn ưu tiên Tất cả, Bắc, Trung hoặc Nam. Đổi vùng có thể đổi món gợi ý."
              },
              {
                "title": "Xem công thức",
                "text": "Bấm Xem cạnh món. Kiểm tra thời gian, nguyên liệu và Cách nấu; dùng nút số người để đổi lượng, A−/A+ để chỉnh chữ. Thời gian hấp, ủ, ngâm không nhất thiết tăng theo số người. Tên món và công thức có thể còn bằng tiếng Việt khi giao diện là English."
              },
              {
                "title": "Lập danh sách đi chợ",
                "text": "Mở Lịch tuần & Đi chợ để xem theo ngày và phần mua sắm; Nguyên liệu hôm nay tổng hợp phần của ngày đang xem. Menu món dùng để tìm món ngoài danh sách gợi ý. Kiểm tra lại nguyên liệu thực tế, dị ứng và khẩu phần của gia đình; dinh dưỡng là thông tin tham khảo."
              },
              {
                "title": "Dùng ngoại tuyến",
                "text": "Thực đơn và công thức đã đóng sẵn hoặc tải về dùng được khi mất mạng. Nội dung tuần mới cần kiểm tra và tải khi có kết nối. Không phải mọi công thức đều có ảnh hoặc video."
              }
            ]
          }
        ]
      },
      {
        "id": "chep-danh-hieu-tren-app",
        "keywords": [
          "Chép danh hiệu Phật, Bồ Tát",
          "Copy Buddha and Bodhisattva names",
          "chép danh hiệu",
          "sacred names",
          "sacred-name copying"
        ],
        "title": "Chép danh hiệu Phật, Bồ Tát",
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Chọn danh hiệu",
                "text": "Trong Tu tập, mở Chép danh hiệu Phật, Bồ Tát. Chọn danh hiệu và đọc hướng dẫn; nhập trong vùng chép theo mẫu, theo dõi số câu thực tế."
              },
              {
                "title": "Lưu và quay lại thời khóa",
                "text": "Kiểm tra trạng thái lưu bản chép và dùng chức năng lưu tài khoản nếu được hỗ trợ/yêu cầu. Khi mở từ thời khóa, dùng điều khiển quay lại của luồng đó để tiếp tục. Không xem mục tiêu 108 câu là số đã hoàn thành."
              }
            ]
          }
        ]
      },
      {
        "id": "giu-gioi-va-bat-quan-trai",
        "keywords": [
          "Giữ giới và Thọ Bát quan trai",
          "Precept Practice and Eight Precepts"
        ],
        "title": "Giữ giới và Thọ Bát quan trai",
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Giữ giới thanh tịnh",
                "text": "Vào Tu tập → Giữ giới thanh tịnh để đọc và tự nhìn lại Ngũ giới, Thập thiện nghiệp. Dùng phần ghi nhận theo hướng dẫn đang hiện; đánh dấu là tự ghi nhận, không phải chứng nhận từ người hướng dẫn."
              },
              {
                "title": "Bát quan trai",
                "text": "Mở Thọ Bát quan trai giới, đọc hướng dẫn và nghi thức, kiểm tra thời gian rồi tự phát nguyện khi sẵn sàng. Theo dõi việc thực hành một ngày một đêm theo hướng dẫn; ứng dụng không thay thế sự hướng dẫn của chư Tăng hoặc người có trách nhiệm."
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "id": "phap-thoai",
    "icon": "🎧",
    "title": "Pháp thoại và thư viện nghe",
    "shortTitle": "Pháp Thoại",
    "keywords": [
      "audio",
      "pháp thoại",
      "thư viện nghe",
      "persistent player",
      "nghe tiếp",
      "yêu thích",
      "nghe sau",
      "giảng sư",
      "thời lượng",
      "phát nền",
      "background audio",
      "ngoại tuyến",
      "offline"
    ],
    "editorialStatus": "verified-software",
    "introduction": [
      "Tìm album, chọn bài và dùng trình phát đang có. Chỉ album hỗ trợ mới có video hoặc tải ngoại tuyến; ngôn ngữ tùy từng bản thu."
    ],
    "topics": [
      {
        "id": "dieu-khien-phap-thoai",
        "title": "Nghe pháp thoại và xem video",
        "keywords": [
          "mini player",
          "trình phát",
          "phát nền",
          "background audio",
          "màn hình khóa",
          "tai nghe bluetooth",
          "media session",
          "tua 10 giây",
          "tua 30 giây",
          "nhớ vị trí",
          "nghe dở",
          "Nghe pháp thoại và xem video",
          "Listen to talks and watch video"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Chọn album và bài",
                "text": "Vào Pháp thoại, tìm album hoặc mở Tìm kiếm và bộ lọc; dùng Top 10 nếu muốn xem danh sách tương ứng. Mở album và chọn bài. Album có nhãn Video mới có phần hình được hỗ trợ."
              },
              {
                "title": "Điều khiển bài đang phát",
                "text": "Dùng phát/tạm dừng, thanh tua và lựa chọn bài ở trình phát. Hộp Nghe tiếp mở lại tiến độ đã lưu khi có sẵn. Trình phát nhỏ giúp quay lại bài đang nghe khi chuyển màn; không cần mở một bài thứ hai."
              },
              {
                "title": "Xem toàn màn hình",
                "text": "Với video hỗ trợ, mở toàn màn hình. Thanh điều khiển tự ẩn khi đang phát; chạm để hiện lại. Khi tạm dừng, đang tải hoặc thao tác, điều khiển tiếp tục hiện. Nếu tua chưa xong, chờ hình/tiếng tải lại; phát trực tuyến cần mạng."
              }
            ]
          }
        ]
      },
      {
        "id": "luu-va-loc-phap-thoai",
        "title": "Tìm lại và tải pháp thoại ngoại tuyến",
        "keywords": [
          "favorites",
          "yêu thích",
          "listen later",
          "nghe sau",
          "dấu trang",
          "recent",
          "gần đây",
          "speaker",
          "giảng sư",
          "chủ đề",
          "duration",
          "thời lượng",
          "tải về",
          "offline",
          "Tìm lại và tải pháp thoại ngoại tuyến",
          "Find and download talks for offline use"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Tìm lại nội dung",
                "text": "Dùng tìm kiếm, bộ lọc, sắp xếp và các mục gần đây/yêu thích đang có. Danh mục, tên và ngôn ngữ phụ thuộc album; phần tiếng Anh không làm bản thu tiếng Việt thành tiếng Anh."
              },
              {
                "title": "Tải bài được hỗ trợ",
                "text": "Bấm tải ở bài hoặc album có hỗ trợ, đăng nhập nếu được yêu cầu và chờ tải hoàn tất. Kiểm tra trạng thái rồi thử mở ngoại tuyến. Chưa tải xong, mất tệp hoặc thiếu dung lượng có thể khiến bài chưa nghe được khi mất mạng."
              },
              {
                "title": "Nghe nền",
                "text": "Phát nền và điều khiển màn hình khóa phụ thuộc nền tảng, loại nội dung và cấu hình thiết bị. Nội dung video hoặc nguồn nhúng có thể có giới hạn riêng; không phải mọi nguồn đều tải hoặc phát nền được."
              },
              {
                "title": "Để nghe sau",
                "text": "Dùng biểu tượng dấu trang 🔖 của album để thêm hoặc bỏ khỏi Nghe sau. Mở mục 🔖 Nghe sau để tìm lại các album đã chọn; đánh dấu nghe sau không tải tệp âm thanh về máy."
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "id": "tai-khoan-dong-bo",
    "icon": "☁️",
    "title": "Đăng nhập, đồng bộ và bảo tồn công phu",
    "shortTitle": "Đồng Bộ",
    "keywords": [
      "google",
      "cloud sync",
      "đổi điện thoại",
      "xóa trình duyệt",
      "facebook",
      "import",
      "ledger",
      "bảo tồn công phu",
      "apple"
    ],
    "editorialStatus": "verified-software",
    "introduction": [
      "Đăng nhập để dùng các phần tài khoản và đồng bộ được hỗ trợ. Luôn phân biệt dữ liệu trên máy, dữ liệu đã lưu vào tài khoản và nội dung công khai."
    ],
    "topics": [
      {
        "id": "dang-nhap-va-dong-bo",
        "title": "Đăng nhập và giữ dữ liệu giữa các thiết bị",
        "keywords": [
          "google login",
          "apple login",
          "lịch sử tu tập",
          "ghi chú",
          "tiến độ đọc",
          "đổi máy",
          "đổi điện thoại",
          "bảo tồn công phu",
          "Đăng nhập và giữ dữ liệu giữa các thiết bị",
          "Sign in and keep supported data across devices"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Đăng nhập tùy nhu cầu",
                "text": "Có thể đọc, nghe nội dung công khai và dùng nhiều công cụ khi chưa đăng nhập. Vào Cá nhân → Tài khoản để đăng nhập bằng nhà cung cấp đang hiện. App Android/iOS hiện dùng Google hoặc Apple theo nền tảng; không tìm nút Facebook nếu màn không có. Quý vị có thể đăng nhập bằng Google. Trên iOS, quý vị cũng có thể đăng nhập bằng Apple."
              },
              {
                "title": "Dùng cùng tài khoản",
                "text": "Khi đổi máy, chọn đúng nhà cung cấp và tài khoản đã dùng trước. Kiểm tra hồ sơ và trạng thái tải/đồng bộ. Đăng nhập không tự chứng minh mọi bản chép, nhật ký riêng hoặc tệp tải trên máy cũ đã được đưa lên tài khoản."
              },
              {
                "title": "Khi cần đăng nhập lại",
                "text": "Khôi phục mạng rồi thử lại theo thông báo. Không xóa dữ liệu ứng dụng trước khi lưu phần đang dở. Đăng xuất khác với xóa tài khoản; đọc xác nhận của từng thao tác."
              }
            ]
          }
        ]
      },
      {
        "id": "an-toan-cong-dong",
        "title": "Báo cáo, chặn và quản lý nội dung cộng đồng",
        "keywords": [
          "báo cáo",
          "chặn",
          "bỏ chặn",
          "cộng đồng",
          "kiểm duyệt",
          "đạo tràng thanh tịnh",
          "bình luận",
          "Báo cáo, chặn và quản lý nội dung cộng đồng",
          "Report, block and manage community content"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Báo cáo nội dung",
                "text": "Mở menu của bình luận, phản hồi hoặc thành viên, chọn báo cáo và nêu lý do. Gửi đúng nội dung cần xem xét, không đăng thông tin cá nhân của người khác để minh họa."
              },
              {
                "title": "Chặn và kiểm tra quyền riêng tư",
                "text": "Dùng Chặn để hạn chế thành viên trong các khu vực cộng đồng được hỗ trợ. Kiểm tra danh sách chặn và lựa chọn chia sẻ trong Cài đặt. Nội dung chờ duyệt hoặc bị từ chối có trạng thái riêng; không có nghĩa đã đăng công khai."
              }
            ]
          }
        ]
      },
      {
        "id": "xoa-tai-khoan",
        "title": "Đăng xuất và xóa tài khoản",
        "keywords": [
          "xóa tài khoản",
          "apple",
          "mã xác nhận",
          "tự chủ dữ liệu",
          "quyền riêng tư",
          "bảo mật",
          "Đăng xuất và xóa tài khoản",
          "Sign out and delete an account"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Tìm thao tác tài khoản",
                "text": "Vào Cá nhân → Tài khoản khi đã đăng nhập. Chọn Đăng xuất nếu chỉ muốn kết thúc phiên trên thiết bị. Chọn Xóa tài khoản chỉ khi muốn thực hiện việc xóa theo mô tả và xác nhận của app."
              },
              {
                "title": "Đọc thông báo trước khi xác nhận",
                "text": "Xóa tài khoản có thể làm mất dữ liệu gắn với tài khoản theo chính sách. Không coi đăng xuất, gỡ ứng dụng hoặc xóa một tệp tải là xóa tài khoản. Nếu có lỗi, kiểm tra trạng thái thay vì suy đoán thao tác đã xong."
              }
            ]
          }
        ]
      },
      {
        "id": "ket-noi-facebook-quan-tri",
        "title": "Kết nối Facebook dành cho quản trị",
        "keywords": [
          "facebook connect",
          "facebook ledger",
          "meta app review",
          "user_posts",
          "nguồn nhập",
          "nhật ký import",
          "ledger",
          "sổ cái facebook",
          "quang từ",
          "khuyến thiện",
          "Kết nối Facebook dành cho quản trị",
          "Facebook connection for administrators"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Phân biệt với đăng nhập",
                "text": "Mục kết nối hoặc nhập bài Facebook là công cụ quản trị khi tài khoản có quyền phù hợp, không phải hướng dẫn đăng nhập Facebook cho app mobile. Tài khoản thông thường không cần thao tác này."
              },
              {
                "title": "Dùng đúng giao diện được cấp quyền",
                "text": "Chỉ làm theo các nút và quyền thực tế trong khu vực quản trị. Không dán token hay thông tin đăng nhập vào bình luận hoặc hỗ trợ cộng đồng; khi không thấy công cụ, liên hệ người quản trị."
              }
            ]
          }
        ]
      }
    ]
  }
];

export const guideJumpLinks = [
  { id: 'cai-app', icon: '📱', label: 'Cài App' },
  { id: 'dung-web', icon: '📱', label: 'Hướng dẫn chung' },
  { id: 'doc-sach', icon: '📖', label: 'Đọc Sách' },
  { id: 'cong-cu-tu-tap', icon: '📿', label: 'Tu Tập' },
  { id: 'phap-thoai', icon: '🎧', label: 'Pháp Thoại' },
  { id: 'tai-khoan-dong-bo', icon: '☁️', label: 'Đồng Bộ' },
  { id: 'huong-dan-nguoi-moi', icon: '🌱', label: 'Người Mới' },
  { id: 'huong-dan-tung-kinh', icon: '📖', label: 'Tụng Kinh' },
  { id: 'huong-dan-tri-chu', icon: '📿', label: 'Trì Chú' },
  { id: 'tho-tuong-tai-gia', icon: '🪔', label: 'Thờ Tượng' },
  { id: 'thuc-hanh-hang-ngay', icon: '📋', label: 'Thực Hành' },
  { id: 'bo-thi-may-nghe-phap', icon: '📻', label: 'Bố Thí Pháp' },
  { id: 'gioi-thieu-tac-gia', icon: '👤', label: 'Tác Giả' },
  { id: 'hoi-dap-thuong-gap', icon: '❓', label: 'Hỏi Đáp' },
] as const;

function normalizeGuideSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/đ/gu, 'd')
    .replace(/Đ/gu, 'D')
    .toLocaleLowerCase('vi')
    .replace(/[^a-z0-9\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** Giữ đường dẫn cũ đầy đủ; hai phần mới dùng lại nguyên nội dung và ID. */
export function selectGuideSections(sections: GuideSection[], softwareIds: string[], part: string | null): GuideSection[] {
  if (part !== 'tu-hoc' && part !== 'ung-dung') return sections;
  const appFaqIds = new Set(['faq-xoa-trinh-duyet', 'faq-dung-tren-may-tinh']);
  const software = new Set(softwareIds);
  return sections.flatMap(section => {
    if (part === 'tu-hoc' && section.id === 'gioi-thieu-tac-gia') return [];
    if (section.id === 'hoi-dap-thuong-gap') {
      const faqs = section.faqs?.filter(faq =>
        part === 'ung-dung' ? appFaqIds.has(faq.id) : !appFaqIds.has(faq.id)
      ) ?? [];
      return [{ ...section, faqs, keywords: ['faq', ...faqs.flatMap(faq => faq.keywords)] }];
    }
    return software.has(section.id) === (part === 'ung-dung') ? [section] : [];
  });
}

export function createGuideSearchTargets(sections: GuideSection[]): GuideSearchTarget[] {
  const targets: GuideSearchTarget[] = [guideInstallTarget];
  for (const section of sections) {
    targets.push({
      id: section.id,
      sectionId: section.id,
      kind: 'section',
      title: section.title,
      context: section.shortTitle,
      keywords: section.keywords,
    });
    for (const topic of section.topics) {
      targets.push({
        id: topic.id,
        sectionId: section.id,
        kind: 'topic',
        title: topic.title,
        context: section.title,
        keywords: topic.keywords,
      });
    }
    for (const faq of section.faqs ?? []) {
      targets.push({
        id: faq.id,
        sectionId: section.id,
        kind: 'faq',
        title: faq.question,
        context: section.title,
        keywords: faq.keywords,
      });
    }
  }
  return targets;
}

export function searchGuideTargets(targets: GuideSearchTarget[], query: string): GuideSearchTarget[] {
  const needle = normalizeGuideSearch(query);
  if (!needle) return [];
  const terms = needle.split(' ');
  return targets
    .map((target) => {
      const title = normalizeGuideSearch(target.title);
      const searchable = normalizeGuideSearch([target.title, target.context, ...target.keywords].join(' '));
      if (!terms.every((term) => searchable.includes(term))) return null;
      const score = title === needle ? 0 : title.startsWith(needle) ? 1 : title.includes(needle) ? 2 : 3;
      return { target, score };
    })
    .filter((entry): entry is { target: GuideSearchTarget; score: number } => entry !== null)
    .sort((a, b) => {
      const kindRank = (kind: GuideSearchTarget['kind']) => kind === 'section' ? 1 : 0;
      return a.score - b.score
        || kindRank(a.target.kind) - kindRank(b.target.kind)
        || a.target.title.localeCompare(b.target.title, 'vi');
    })
    .slice(0, 8)
    .map(({ target }) => target);
}
