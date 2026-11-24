import { describe, expect, it } from 'vitest';
import { classifyRoutineLine } from '../../../src/lib/domain/practice/routine-activities';
import {
  PROSTRATION_PACE_SECONDS,
  shouldStopAutoProstration,
  nextAutoProstrationTick
} from '../../../src/lib/domain/practice/prostration-pacing';

describe('classifyRoutineLine', () => {
  it('classifies empty lines, uppercase headings, verse/gatha lines, and prose paragraphs', () => {
    expect(classifyRoutineLine('')).toBe('empty');
    expect(classifyRoutineLine('   ')).toBe('empty');
    expect(classifyRoutineLine('HỒI HƯỚNG CÔNG ĐỨC')).toBe('heading');
    expect(classifyRoutineLine('KỆ SÁM HỐI')).toBe('heading');
    expect(classifyRoutineLine('Nguyện đem công đức này')).toBe('verse');
    expect(classifyRoutineLine('Trang nghiêm Phật Tịnh Độ')).toBe('verse');
    expect(classifyRoutineLine('Nam mô A Di Đà Phật (3 lần)')).toBe('verse');
    expect(
      classifyRoutineLine(
        'Con xin thành tâm sám hối tất cả những tội lỗi từ vô thủy đến nay do thân khẩu ý tạo tác. Nguyện cho tâm trí sáng suốt, tiêu trừ nghiệp chướng và hướng về nẻo thiện.'
      )
    ).toBe('prose');
    expect(
      classifyRoutineLine(
        'Hướng dẫn: Hành giả ngồi thẳng lưng, chắp tay trước ngực và đọc chậm rãi ba lần trước khi kết thúc thời khóa.'
      )
    ).toBe('prose');
  });
});

describe('prostration auto-pacing', () => {
  it('exposes manual (0) and calm selectable intervals in seconds', () => {
    expect(PROSTRATION_PACE_SECONDS).toEqual([0, 6, 8, 10, 12]);
  });

  it('stops automatically once a positive goal is reached, but continues when goal is free (0)', () => {
    expect(shouldStopAutoProstration(21, 21)).toBe(true);
    expect(shouldStopAutoProstration(22, 21)).toBe(true);
    expect(shouldStopAutoProstration(20, 21)).toBe(false);
    expect(shouldStopAutoProstration(108, 0)).toBe(false);
  });

  it('counts down cleanly and fires on zero then resets to interval', () => {
    expect(nextAutoProstrationTick(8, 8)).toEqual({ remaining: 7, fire: false });
    expect(nextAutoProstrationTick(2, 8)).toEqual({ remaining: 1, fire: false });
    expect(nextAutoProstrationTick(1, 8)).toEqual({ remaining: 8, fire: true });
    expect(nextAutoProstrationTick(0, 8)).toEqual({ remaining: 8, fire: true });
  });
});
