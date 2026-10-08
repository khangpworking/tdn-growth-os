import type { ReaderPlatform } from './build.js';
import { esc } from './format.js';
import { makeExhibits, n, plat, section } from './layout.js';

/** Source order for hypotheses, prerequisite order for proposals; neither is a revenue priority. */
export function currentProposals({ PLATS, coreSegs, segName, bf, tbl, SRC }: {
  PLATS: readonly ReaderPlatform[]; coreSegs: readonly string[]; segName: (key: string) => string;
  bf: (id: string) => string; tbl: ReturnType<typeof makeExhibits>['tbl']; SRC: string;
}): string[] {
  return [
    section('M11', 'Cơ hội', 'Nhu cầu, đo bằng doanh số (ước tính) trong mẫu, ghi riêng từng sàn; chưa đủ bằng chứng về nhu cầu chưa được đáp ứng hay khả năng phục vụ.',
      tbl('11.1', 'Bằng chứng và giới hạn của giả thuyết cơ hội', '', ['Sàn', 'Nhóm', 'Doanh số trong mẫu', 'Còn thiếu'],
        PLATS.flatMap(P => coreSegs.map(k => [plat(P), esc(segName(k)), n(bf(`${P}.seg.${k}.rev`)), 'Ý kiến khách và khả năng đáp ứng'])),
        { note: 'Đặt các nhóm cạnh nhau theo quy tắc phân loại; không chọn ba nhóm theo doanh thu.', src: SRC }),
      'Số bán hàng ước tính chưa đối chiếu với người bán; chỉ dùng tham khảo.'),
    section('M12', 'Khuyến nghị và hành động', 'Ba phương án là đề xuất, chờ chủ duyệt; chưa có hành động nào được phê duyệt.',
      tbl('12.1', 'Phương án đề xuất, chờ chủ duyệt', '', ['Việc làm ngay', 'Người phụ trách đề xuất', 'Hạn đề xuất', 'Bằng chứng / đầu ra'], [
        ['Rà phạm vi dữ liệu đã lưu (đề xuất, chờ chủ duyệt)', 'TDN (đề xuất, chờ chủ duyệt)', 'Trước khi dùng báo cáo cho quyết định (đề xuất, chờ chủ duyệt)', 'Bảng 2.1 và Phụ lục; danh sách phần còn thiếu'],
        ['Kiểm tra phân loại trên dòng nguồn (đề xuất, chờ chủ duyệt)', 'TDN; chủ dự án xem xét (đề xuất, chờ chủ duyệt)', 'Sau khi rà phạm vi, trước kết luận (đề xuất, chờ chủ duyệt)', 'Bảng 2.2 và danh sách sản phẩm đã lưu'],
        ['Đối chiếu lời khách từ nguồn công khai đã lưu (đề xuất, chờ chủ duyệt)', 'TDN (đề xuất, chờ chủ duyệt)', 'Sau khi xác định đúng nhóm sản phẩm (đề xuất, chờ chủ duyệt)', 'Bảng 11.1; giữ trích dẫn và phản chứng'],
      ], { note: 'Thứ tự chỉ theo phụ thuộc dữ liệu: rà phạm vi trước khi kiểm tra phân loại, xác định đúng nhóm trước khi đối chiếu lời khách. Không có mức ưu tiên theo doanh thu.', src: 'TDN đề xuất từ bằng chứng ở Phần 2 và 11.' }),
      'Mỗi việc, người phụ trách và hạn đều là đề xuất, chờ chủ duyệt.'),
  ];
}
