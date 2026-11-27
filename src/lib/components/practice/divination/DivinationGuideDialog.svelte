<script lang="ts">
  import { modalDialog } from '$lib/browser/modal-dialog';
  import ItalicParensText from './ItalicParensText.svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { getDivinationCopy } from '$lib/i18n/divination-ui';

  interface Props {
    open: boolean;
    kind: 'quan-am' | 'moc-luan';
    onClose: () => void;
  }

  let { open, kind, onClose }: Props = $props();
  const locale = getLocaleContext();
  const isEn = $derived(locale.current === 'en');
  const copy = $derived(getDivinationCopy(isEn));
</script>

{#if open}
  <dialog
    class="div-guide-dialog"
    use:modalDialog
    aria-labelledby="divGuideTitle"
    oncancel={(event) => {
      event.preventDefault();
      onClose();
    }}
    onclick={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}
  >
    <div class="div-guide-card">
      <div class="div-guide-header">
        <div class="div-guide-header-copy">
          <span class="div-guide-eyebrow">
            {kind === 'quan-am' ? 'HƯỚNG DẪN XIN XĂM' : 'HƯỚNG DẪN CHIÊM SÁT'}
          </span>
          <h2 id="divGuideTitle" class="div-guide-title">
            {kind === 'quan-am'
              ? 'QUAN ÂM LINH XĂM (100 QUẺ)'
              : 'MỘC LUÂN CHIÊM SÁT (189 TƯỚNG)'}
          </h2>
        </div>
        <button
          type="button"
          class="div-guide-close"
          aria-label={copy.closeLabel}
          onclick={onClose}
          data-modal-focus
        >
          ✕
        </button>
      </div>

      <div class="div-guide-body">
        {#if kind === 'quan-am'}
          <p class="div-guide-lead">
            <strong>Quan Âm Linh Xăm</strong> dùng để thỉnh ý các công việc thường nhật trong đời sống
            (gia đạo, công danh, cầu tài, xuất hành, hôn nhân, cầu tự, bệnh tật, kiện tụng, tìm vật…).
          </p>
          <ol class="div-guide-steps">
            <li>
              <strong>Quy tắc mỗi ngày một việc:</strong> Mỗi ngày xin 1 việc gì thì chỉ gieo đúng
              <em>(1 lần)</em>; sau khi niệm danh hiệu Ngài Quán Thế Âm Bồ Tát <em>(3 lần)</em>, tâm
              phải chí thành xin gia hộ thì kết quả mới ứng nghiệm đúng.
            </li>
            <li>
              <strong>Chọn rõ việc &amp; khấn nguyện:</strong> Định tâm đúng <strong>1 việc duy nhất</strong>
              trong danh sách, xưng niệm danh hiệu Quán Thế Âm Bồ Tát trước khi lắc ống tre.
            </li>
            <li>
              <strong>Bước 1 — Lắc ống tre:</strong> Bấm nút lắc ống tre chậm rãi để rút ngẫu nhiên
              <em>(1 thẻ quẻ từ 1 đến 100)</em>.
            </li>
            <li>
              <strong>Bước 2 — Xin keo âm dương (đủ 3 lần):</strong> Tung 2 đồng tiền cổ tối đa
              <em>(3 lần)</em>. Mỗi lần có 1 Sấp 1 Ngửa là <strong>Thánh keo</strong>. Chỉ cần ít nhất
              <em>(1 lần Thánh keo)</em> trong 3 lần tung thì quẻ được chuẩn y. Nếu cả 3 lần không được
              Thánh keo, bấm <strong>Gieo lại</strong> để lắc quẻ mới.
            </li>
            <li>
              <strong>Đọc giải nghĩa &amp; tu tâm:</strong> Đối chiếu thơ xăm, lời bàn, điển tích và
              phương diện đã chọn; giữ lòng thiện lành, làm việc phước đức để chuyển hóa nhân duyên.
            </li>
          </ol>
        {:else}
          <p class="div-guide-lead">
            <ItalicParensText
              text="Theo Kinh Chiêm Sát Thiện Ác Nghiệp Báo · Quyển Thượng, pháp Mộc Luân Chiêm Sát là phương tiện Đức Địa Tạng Bồ Tát dạy giúp người tu thời Mạt Pháp kiểm chứng tín tâm, sám hối diệt tội và soi xét nhân quả ba đời (1 – 189)."
            />
          </p>
          <ol class="div-guide-steps">
            <li>
              <strong>Chuẩn bị &amp; hành nghi thức trước khi gieo:</strong> Thực hành đầy đủ nghi thức
              <strong>Chiêm Luân Tướng Pháp</strong>: dâng hương cúng nước, đảnh lễ Tam Bảo và Bồ Tát
              Địa Tạng, đọc kệ và văn quán tưởng cúng dường, tác bạch sự việc cần thỉnh, nhất tâm
              xưng niệm <em>(1.000 câu)</em> danh hiệu <strong>Nam Mô Địa Tạng Bồ Tát Ma Ha Tát</strong>,
              đọc lời thỉnh nguyện rồi tích xác nhận.
            </li>
            <li>
              <strong>Cấu tạo Bộ Mộc Luân Thứ Ba (6 khối gỗ):</strong> Mỗi khối gỗ vát 4 mặt gồm 3 mặt
              khắc số chữ Hán (từ <em>1–3</em> trên Luân 1 đến <em>16–18</em> trên Luân 6) và 1 mặt trống
              giá trị <em>(0)</em>.
            </li>
            <li>
              <strong>Gieo 3 lần cộng tổng (0 – 189):</strong> Tổng 3 lần bằng <strong>0</strong> là
              tướng <em>Vô sở hữu</em> — kinh khuyên tạm dừng, chí thành sám hối rồi gieo lại. Từ
              <strong>1 – 160</strong> xét việc <strong>đời hiện tại</strong> (nhóm <em>1–49</em> xét
              công phu tu tập; <em>50–160</em> xét nhân duyên đời sống); từ <strong>161 – 171</strong>
              soi gốc <strong>đời quá khứ</strong>; từ <strong>172 – 189</strong> soi hướng chuyển sinh
              <strong>đời tương lai</strong>.
            </li>
          </ol>
        {/if}
      </div>

      <div class="div-guide-footer">
        <button type="button" class="div-btn div-btn--primary" onclick={onClose}>
          Đã hiểu
        </button>
      </div>
    </div>
  </dialog>
{/if}

<style>
  .div-guide-dialog {
    margin: auto;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-feature);
    background: var(--card);
    color: var(--text);
    width: min(560px, calc(100vw - 24px));
    max-height: min(86dvh, 720px);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
    overflow: hidden;
  }
  .div-guide-dialog::backdrop {
    background: var(--practice-dialog-backdrop, rgba(0, 0, 0, 0.52));
    backdrop-filter: blur(4px);
  }
  .div-guide-card {
    display: flex;
    flex-direction: column;
    max-height: min(86dvh, 720px);
  }
  .div-guide-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 18px;
    border-bottom: 1px solid var(--border2);
    background: var(--bg2);
  }
  .div-guide-header-copy {
    flex: 1;
    min-width: 0;
    text-align: center;
  }
  .div-guide-eyebrow {
    display: block;
    font-size: var(--font-size-meta);
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--brown);
  }
  .div-guide-title {
    margin: 2px 0 0;
    font-size: var(--font-size-card-title);
    font-weight: 700;
    color: var(--text);
    text-transform: uppercase;
    text-wrap: balance;
  }
  .div-guide-close {
    flex-shrink: 0;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--text);
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    display: grid;
    place-items: center;
  }
  .div-guide-body {
    padding: 16px 18px;
    overflow-y: auto;
    font-family: var(--font-app);
    font-size: 14px;
    line-height: 1.65;
    color: var(--text2);
    text-align: justify;
  }
  .div-guide-lead {
    margin: 0 0 12px;
    color: var(--text);
  }
  .div-guide-steps {
    margin: 0;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .div-guide-steps strong {
    color: var(--text);
  }
  .div-guide-footer {
    padding: 12px 18px;
    border-top: 1px solid var(--border2);
    background: var(--bg2);
    display: flex;
    justify-content: flex-end;
  }
  .div-btn {
    min-height: 44px;
    min-width: 112px;
    padding: 10px 20px;
    border-radius: var(--radius-control);
    border: none;
    font-family: var(--font-app);
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
  }
  .div-btn--primary {
    background: linear-gradient(135deg, var(--gold2), var(--gold));
    color: var(--on-gold);
  }
  :global([data-theme='dark']) .div-guide-eyebrow {
    color: var(--gold2);
  }
</style>
