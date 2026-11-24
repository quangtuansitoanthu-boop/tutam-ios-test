import type { MindfulPolicyCode } from '../../contracts/mindful-community';

export interface MindfulPolicyAssessment { state: 'clear' | 'blocked'; code: MindfulPolicyCode | null; reason: string | null }
export const MINDFUL_POLICY_REASONS: Record<MindfulPolicyCode, string> = {
  fundraising_solicitation: 'Nội dung trực tiếp kêu gọi chuyển tiền hoặc quyên góp không được phép trong cộng đồng.',
  political_mobilization: 'Nội dung trực tiếp kêu gọi huy động chính trị hoặc lật đổ không được phép trong cộng đồng.',
  superstition_promotion: 'Nội dung trực tiếp quảng bá, mời chào dịch vụ tà đạo hoặc mê tín không được phép trong cộng đồng.',
};

/** Conservative explicit solicitation rules, not a semantic judgement of repentance. */
export function classifyMindfulPolicy(content: string): MindfulPolicyAssessment {
  const normalized = content.toLowerCase().replaceAll('chớ','policynegation').normalize('NFKD')
    .replace(/[\u0300-\u036f\p{Cf}]/gu, '').replaceAll('đ', 'd').replace(/[^\S\n]+/gu,' ');
  // A quoted warning/example is not endorsement. An explicit invitation to follow the
  // quote keeps its words available to the same rules as an unquoted solicitation.
  const unquoted = normalized.replace(/[“"`][^”"`]*[”"`]|‘[^’]*’/gu,(quote:string,offset:number)=>{
    const prefix=normalized.slice(0,offset).split(/[.!?;\n]/u).at(-1) ?? '';
    const endorsement=/^\s*(?:(?:toi|con)(?:\s+xin)?\s+)?(?:keu goi|moi|hay|mong)(?:\s+(?:quy|vi|dao|huu|moi|nguoi|anh|chi|ban|cac|phat|tu|cung|nhau|hay)){0,10}\s+(?:lam theo|thuc hien)(?:\s+(?:cau|loi|noi|dung|nay|sau|day|cho|toi)){0,8}\s*$/u.test(prefix);
    const quotedCall=/\b(hay|moi|keu goi|mong|lien he|dang ky|tham gia)\b/u.exec(quote);
    const standalone=/^[\s\p{P}]*$/u.test(normalized.slice(0,offset)+normalized.slice(offset+quote.length));
    const warning=quotedCall && /\b(canh giac|de phong|lua dao|vi du)\b/u.test(quote.slice(0,quotedCall.index));
    // Quoted account details are objects of the author's call, not a quoted call.
    return !quotedCall || endorsement || (standalone && !warning) ? quote : ' ';
  });
  for (const clause of unquoted.split(/[.!?;\n]+/u)) {
    const calls=[...clause.matchAll(/\b(hay|moi|keu goi|mong|lien he|dang ky|tham gia)\b/gu)];
    const imperative=/^\s*(chuyen khoan|gui tien|ung ho)\b/u.exec(clause);
    if (imperative) calls.unshift(imperative);
    for (const call of calls) {
    const prefix = clause.slice(0,call.index);
    // Scope negation to the invitation/action, not an unrelated word such as
    // “không chậm trễ”. History requires the call to belong to that past context.
    if (/\b(khong|dung|policynegation|tranh|phan doi)(?:\s+(?:nen|duoc|bao gio|viec|xin|co)){0,3}\s*$/u.test(prefix)
      || (/\b(truoc day|da tung|tung)\b/u.test(prefix) && !/\b(nay|bay gio|hom nay)\b/u.test(prefix))) continue;
    const active = clause.slice(call.index).trimStart();
    // The invitation must govern the prohibited action through a short recipient
    // phrase. “Mời đọc chia sẻ: hôm qua tôi đã chuyển khoản” does not satisfy it.
    const invitation='(?:(?:hay|moi|keu goi|mong)(?:\\s+(?:quy|vi|dao|huu|moi|nguoi|anh|chi|ban|cac|phat|tam|tu|cung|nhau|hay|chung|ta)){0,10}\\s+)';
    let code: MindfulPolicyCode | null = null;
    if (new RegExp(`^(?:${invitation})?(chuyen khoan|chuyen tien|gui tien|quyen gop|ung ho tien|tai tro|cung duong tinh tai)\\b`,'u').test(active)
      && (/\b(tai khoan|stk|cho toi|cho chung toi|vao quy|ngay hom nay)\b/u.test(active) || /\d{6,}/u.test(active))) code = 'fundraising_solicitation';
    else if (new RegExp(`^${invitation}(xuong duong|bieu tinh|lat do|bao loan|chong pha|tham gia)\\b`,'u').test(active)
      && /\b(chinh quyen|chinh phu|che do|dang phai|chinh tri)\b/u.test(active)) code = 'political_mobilization';
    else if (new RegExp(`^${invitation}(mua|thinh|ban)\\s+(bua yeu|bua ngai|bua|goi hon|dich vu goi hon|cung doi van)\\b`,'u').test(active)
      && /\b(bao dam|cam ket|chac chan)\b/u.test(active)
      && /\b(trung so|doi van|co nguoi yeu|giau|tai loc|linh ung)\b/u.test(active)) code = 'superstition_promotion';
    else if ((!prefix.trim() || new RegExp(`^\\s*${invitation}$`,'u').test(prefix))
      && /^(lien he|dang ky)\b/u.test(active) && /\b(bua yeu|ban bua|thinh bua|giai han|goi hon|ta dao|xin so de|cung doi van)\b/u.test(active)
      && /\b(gia|bao dam|cam ket|trung so|lien he toi|dang ky|chuyen tien|mua)\b/u.test(active)) code = 'superstition_promotion';
    if (code) return { state: 'blocked', code, reason: MINDFUL_POLICY_REASONS[code] };
    }
  }
  return { state: 'clear', code: null, reason: null };
}
