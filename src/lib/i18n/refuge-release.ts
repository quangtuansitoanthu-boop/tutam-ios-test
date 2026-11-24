export const refugeReleaseCopy = {
  vi: {
    title: 'Bài quy y & phóng sinh ngắn',
    heading: 'BÀI QUY Y & PHÓNG SINH NGẮN',
    close: 'Đóng bài đọc',
    fontSize: 'Cỡ chữ',
    decreaseFont: 'Giảm cỡ chữ',
    increaseFont: 'Tăng cỡ chữ',
  },
  en: {
    title: 'Short refuge & life release ritual',
    heading: 'SHORT REFUGE & LIFE RELEASE RITUAL',
    close: 'Close reading',
    fontSize: 'Font size',
    decreaseFont: 'Decrease font size',
    increaseFont: 'Increase font size',
  },
} as const;

interface RitualBlock {
  kind: 'heading' | 'step' | 'paragraph' | 'verse';
  text: string;
}

// Nguyên văn người dùng cung cấp; giữ thứ tự, số lần đọc và các chỉ dẫn.
export const refugeReleaseBlocks: readonly RitualBlock[] = [
  {
    "kind": "heading",
    "text": "CÁCH GIÚP CHÚNG SINH QUY Y TAM BẢO DỄ NHẤT"
  },
  {
    "kind": "paragraph",
    "text": "Khi bạn đi trên đường mà nhìn thấy xe chở loài vật, thì hãy âm thầm Quy y Tam bảo cho chúng. Ngay cả lúc vào chợ hay siêu thị, nếu nhìn thấy loài vật bị bày bán (dù chưa chết hay đã chết), thì nên niệm như thế này:"
  },
  {
    "kind": "paragraph",
    "text": "Nguyện những chúng sinh mà mắt tôi đang nhìn thấy: Dù đã chết, chưa chết hay chờ chết... và những loài đang bị giết hại, xin hãy nghe theo tôi, khởi 1 niệm Quy Y Phật, quy y Pháp, quy y Tăng.."
  },
  {
    "kind": "verse",
    "text": "\"Con xin quy y Phật khỏi đọa địa ngục\nCon xin quy y Pháp khỏi đọa ngạ quỷ\nCon xin quy y Tăng khỏi đọa súc sanh\""
  },
  {
    "kind": "verse",
    "text": "Con xin quy y Phật khỏi đọa địa ngục\nCon xin quy y Pháp khỏi đọa ngạ quỷ\nCon xin quy y Tăng khỏi đọa súc sanh"
  },
  {
    "kind": "verse",
    "text": "Con xin quy y Phật khỏi đọa địa ngục\nCon xin quy y Pháp khỏi đọa ngạ quỷ\nCon xin quy y Tăng khỏi đọa súc sanh\""
  },
  {
    "kind": "paragraph",
    "text": "Tiếp đến hãy niệm “Nam Mô A Di Đà Phật!” vài lần, tụng thêm Chú vãng sinh:"
  },
  {
    "kind": "verse",
    "text": "Nam Mô A Di Đa Bà Dạ.\nĐa Tha Dà Đa Dạ, Đa Địa Dạ Tha\nA Di Rị Đô Bà Tỳ, A Di Rị Đa Tất Đam Bà Tỳ\nA Di Rị Đa Tỳ Ca Lan Đế\nA Di Rị Đa Tỳ Ca Lan Đa\nDà Di Nị Dà Dà Na\nChỉ Đa Ca Lệ Sa Bà Ha"
  },
  {
    "kind": "paragraph",
    "text": "(từ 1 đến 3 biến, nhiều hơn càng tốt)"
  },
  {
    "kind": "paragraph",
    "text": "Như vậy sẽ có vô lượng chúng sinh quỳ tại hư không nghe thọ Tam quy, niệm Phật theo bạn. Sau khi chúng chết rồi được vãng sinh thiện đạo, do nhờ phát khởi một niệm lành này. Phải biết trong pháp giới: “Tất cả do tâm tạo”."
  },
  {
    "kind": "paragraph",
    "text": "Phải hiểu công đức bái sám phi thường lớn, cần dùng lực công đức này, hồi hướng cho những chúng sinh đang thọ khổ, giúp chúng quy y Phật, Pháp, Tăng... khiến cho được lợi. Khi giúp chúng sinh thọ ích, tất nhiên bản thân cũng thọ ích, đồng thời phẩm vị cảnh giới cũng được tăng cao."
  },
  {
    "kind": "heading",
    "text": "NGHI THỨC PHÓNG SINH NGẮN GỌN"
  },
  {
    "kind": "paragraph",
    "text": "- Khi phóng sanh, mua các con vật nhất định phải còn rất khỏe mạnh, phải quan sát xem chúng thực sự có thể tiếp tục sống được thì ta mới mua chúng."
  },
  {
    "kind": "paragraph",
    "text": "- Nếu chúng bị thương quá nặng, thấy chúng không sống được nữa thì chúng ta chỉ nói thầm tác ý: Thọ Tam Quy Y cho chúng, khuyên chúng niệm Phật cầu sanh Tịnh Độ (xem bài CÁCH GIÚP CHÚNG SINH QUY Y TAM BẢO DỄ NHẤT)"
  },
  {
    "kind": "paragraph",
    "text": "- Nghi lễ phóng sanh này ưu tiên ngắn quá dài, quá rườm rà, bởi khi nghi thức kéo dài, sẽ có rất nhiều con vật chết trong thời gian đó, ta vốn muốn tạo thiện nghiệp mà vô tình lại gây ra ác nghiệp!"
  },
  {
    "kind": "paragraph",
    "text": "Vậy nên, khi ta phóng sanh:"
  },
  {
    "kind": "step",
    "text": "Bước 1: Đọc lời nguyện hương"
  },
  {
    "kind": "verse",
    "text": "NAM MÔ A DI ĐÀ PHẬT (3 lần)\nNAM MÔ ĐẠI BI QUÁN THẾ ÂM BỒ TÁT (3 lần)\nNAM MÔ ĐẠI NGUYỆN ĐỊA TẠNG VƯƠNG BỒ TÁT (3 lần)"
  },
  {
    "kind": "paragraph",
    "text": "Hôm nay, chúng con thiện nam tín nữ pháp danh là.... phát tâm mua chuộc mạng sống các loài vật như cá, chim, đây để phóng sinh. Cúi mong Tam bảo thường ở mười phương từ bi quang giáng đàn tràng này để gia hộ cứu giúp cho các chúng sinh đây thoát khỏi cảnh chết chết chóc, do con người và các loài vật, ăn nuốt lẫn nhau."
  },
  {
    "kind": "step",
    "text": "Bước 2: Khai thị và quy y"
  },
  {
    "kind": "paragraph",
    "text": "Trong đời quá khứ quý vị tạo tác ác nghiệp nên quý vị mới đọa làm thân súc sanh, bị người bắt, người ta giết hại. Bây giờ, tôi có duyên gặp được, chúng tôi nguyện phóng sanh, hy vọng quý vị được sanh về cõi lành, sớm thành Phật đạo. Các vị xin hãy nghe theo tôi, khởi 1 niệm Quy Y Phật, quy y Pháp, quy y Tăng..:"
  },
  {
    "kind": "verse",
    "text": "Chúng con xin Quy Y Phật\nChúng con xin Quy Y Pháp\nChúng con xin Quy Y Tăng\nChúng con xin Quy Y Phật\nChúng con xin Quy Y Pháp\nChúng con xin Quy Y Tăng\nChúng con xin Quy Y Phật\nChúng con xin Quy Y Pháp\nChúng con xin Quy Y Tăng"
  },
  {
    "kind": "verse",
    "text": "Quy Y Phật không đọa địa ngục\nQuy Y Pháp không đọa ngạ quỷ\nQuy Y Tăng không đọa súc sanh\nQuy Y Phật không đọa địa ngục\nQuy Y Pháp không đọa ngạ quỷ\nQuy Y Tăng không đọa súc sanh\nQuy Y Phật không đọa địa ngục\nQuy Y Pháp không đọa ngạ quỷ\nQuy Y Tăng không đọa súc sanh"
  },
  {
    "kind": "verse",
    "text": "Chúng con đã Quy Y Phật rồi\nChúng con đã Quy Y Pháp rồi\nChúng con đã Quy Y Tăng rồi\nChúng con đã Quy Y Phật rồi\nChúng con đã Quy Y Pháp rồi\nChúng con đã Quy Y Tăng rồi\nChúng con đã Quy Y Phật rồi\nChúng con đã Quy Y Pháp rồi\nChúng con đã Quy Y Tăng rồi"
  },
  {
    "kind": "paragraph",
    "text": "(Sau khi quy y xong thì thả luôn)"
  },
  {
    "kind": "step",
    "text": "Bước 3: Trì chú Vãng sanh & Hồi Hướng"
  },
  {
    "kind": "verse",
    "text": "Nam Mô A Di Đa Bà Dạ.\nĐa Tha Dà Đa Dạ, Đa Địa Dạ Tha\nA Di Rị Đô Bà Tỳ, A Di Rị Đa Tất Đam Bà Tỳ\nA Di Rị Đa Tỳ Ca Lan Đế\nA Di Rị Đa Tỳ Ca Lan Đa\nDà Di Nị Dà Dà Na\nChỉ Đa Ca Lệ Sa Bà Ha"
  },
  {
    "kind": "paragraph",
    "text": "( tối thiểu 3 biến, nhiều hơn càng tốt)"
  },
  {
    "kind": "paragraph",
    "text": "Hồi hướng: Xin hồi hướng công đức trì chú vãng sinh này cho tất cả chúng sinh, các loài vật, các vị thần có mặt trong lễ phóng sinh hôm nay, nguyện cho tất cả chúng sinh được tiêu trừ nghiệp chướng, không bị đoạ cõi xấu, sớm sanh về cõi lành, rốt cuộc đều chứng đắc Phật đạo."
  }
];
