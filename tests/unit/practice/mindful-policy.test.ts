import { describe, expect, it } from 'vitest';
import { classifyMindfulPolicy } from '../../../src/lib/domain/practice/mindful-policy';

describe('high confidence active solicitation policy', () => {
  it.each([
    ['Hãy chuyển khoản vào số tài khoản 123456789 để quyên góp cho tôi.', 'fundraising_solicitation'],
    ['Mọi người hãy xuống đường biểu tình lật đổ chính quyền ngay hôm nay.', 'political_mobilization'],
    ['Liên hệ tôi để làm bùa yêu bảo đảm trúng số, giải hạn với giá 500 nghìn.', 'superstition_promotion'],
    ['Con xin sám hối và mời quý vị chuyển khoản vào STK 123456789 của tôi.', 'fundraising_solicitation'],
    ['Không chậm trễ, hãy chuyển khoản vào STK 123456789 để quyên góp cho tôi.', 'fundraising_solicitation'],
    ['Tôi kêu gọi mọi người làm theo câu “Hãy chuyển khoản vào STK 123456789 cho tôi”.', 'fundraising_solicitation'],
    ['Hãy chuy\u200bển khoản vào STK １２３４５６７８９ cho tôi.', 'fundraising_solicitation'],
    ['Trước đây tôi từng kêu gọi chuyển khoản vào STK 111111 nhưng nay hãy chuyển khoản vào STK 222222 cho tôi.', 'fundraising_solicitation'],
    ['Mời chuyển khoản vào “STK 123456789” cho tôi.', 'fundraising_solicitation'],
    ['Hãy chuyển khoản vào STK 123456789, không chậm trễ.', 'fundraising_solicitation'],
    ['Hãy chuyển khoản vào STK 123456789 cho tôi, không mua bùa.', 'fundraising_solicitation'],
    ['Hãy xuống đường lật đổ chính quyền, không chuyển khoản cho tôi.', 'political_mobilization'],
    ['Mời đạo hữu chuyển tiền vào STK 123456789 cho tôi.', 'fundraising_solicitation'],
    ['Kêu gọi cúng dường tịnh tài vào STK 123456789 của tôi.', 'fundraising_solicitation'],
    ['Mời quý vị phát tâm cúng dường tịnh tài qua STK 123456789 cho tôi.', 'fundraising_solicitation'],
    ['Mong quý vị chuyển tiền vào STK123456789.', 'fundraising_solicitation'],
    ['Hãy mua bùa yêu, bảo đảm trúng số.', 'superstition_promotion'],
    ['“Hãy chuyển khoản vào STK123456789”', 'fundraising_solicitation'],
  ])('blocks explicit promotion with a stable reason: %s', (content, code) => {
    expect(classifyMindfulPolicy(content)).toMatchObject({ state: 'blocked', code });
  });
  it.each([
    'Trước đây tôi từng kêu gọi quyên góp và bán bùa yêu. Nay tôi sám hối và nguyện không tái phạm.',
    'Xin đừng chuyển khoản cho tài khoản lừa đảo; không mua bùa hay mê tín dị đoan.',
    'Tôi đọc câu “Hãy chuyển khoản vào tài khoản 123456789 để quyên góp” và thấy cần cảnh giác.',
    'Trước đây tôi kêu gọi chuyển khoản vào STK 123456789 của tôi, nay xin sám hối.',
    'Hôm nay tôi đã chuyển khoản vào tài khoản 123456789 để trả lại tiền người khác chuyển nhầm.',
    'Xin chớ chuyển khoản vào STK 123456789 cho người lừa đảo.',
    'Mời mọi người không chuyển khoản vào STK 123456789 cho tôi.',
    'Hãy đừng chuyển khoản vào STK 123456789 cho tôi.',
    'Mời mọi người thực hiện lời dạy. Tôi nhắc lại lời lừa đảo “Hãy chuyển khoản vào STK 123456789” để đề phòng.',
    'Mời mọi người đọc chia sẻ: hôm qua tôi đã chuyển khoản vào tài khoản 123456789 để trả lại tiền chuyển nhầm.',
    'Hôm nay con cúng dường Tam Bảo và cầu nguyện cho gia đình an lành.',
    'Tôi hồi hướng công đức cho người đã khuất, không cầu tài lộc.',
    'Mời mọi người đọc chia sẻ: hôm qua tôi đã gửi tiền giúp viện phí cho mẹ qua tài khoản 123456789.',
    'Hôm qua tôi liên hệ bác sĩ chữa bệnh rồi đọc tin về bùa yêu cam kết trúng số và nhận ra cần tránh mê tín.',
    'Mời mọi người không làm theo câu “Hãy chuyển khoản vào STK 123456789 cho tôi”.',
    'Mời mọi người đọc câu cảnh giác “Hãy chuyển khoản vào STK 123456789 cho tôi” để tránh bị lừa.',
    'Tôi nhận ra những tư tưởng chính trị cực đoan đã làm tổn thương gia đình, nay xin sửa đổi.',
    'Hôm nay tôi giúp người hàng xóm một việc nhỏ và lòng thấy an vui.',
    'Mong quý vị an lạc.',
    'Mời đọc sách cảnh giác bùa yêu, tránh những lời bảo đảm trúng số.',
    'Hãy mua sách cảnh giác bùa yêu và những lời bảo đảm trúng số.',
    'Cảnh giác lời lừa đảo “Hãy chuyển khoản vào STK123456789”.',
    'Trước đây tôi từng viết “Hãy chuyển khoản vào STK123456789”, nay xin sám hối.',
    '“Trước đây tôi từng kêu gọi chuyển khoản vào STK123456789, nay xin sám hối.”',
  ])('does not suspend historical, quoted, negated or uncertain content: %s', content => {
    expect(classifyMindfulPolicy(content).state).toBe('clear');
  });
});
