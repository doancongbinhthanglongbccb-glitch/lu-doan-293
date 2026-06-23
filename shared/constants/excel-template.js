/** Cột Excel — khớp parser trong frontend/js/services/excel/index.js */
export const EXCEL_MC_COLUMNS = ['Câu hỏi', 'Phương án', 'Đáp án đúng'];
export const EXCEL_ESSAY_COLUMNS = ['Câu hỏi', 'Câu trả lời'];

/** Dòng mẫu trắc nghiệm (chỉ minh họa định dạng) */
export const EXCEL_SAMPLE_MC_ROW = {
    'Câu hỏi': '(Nhập nội dung câu hỏi trắc nghiệm)',
    'Phương án': 'A. Đáp án A\r\nB. Đáp án B\r\nC. Đáp án C\r\nD. Đáp án D',
    'Đáp án đúng': 'A. Đáp án A'
};

/** Dòng mẫu tự luận (chỉ minh họa định dạng) */
export const EXCEL_SAMPLE_ESSAY_ROW = {
    'Câu hỏi': '(Nhập nội dung câu hỏi tự luận)',
    'Câu trả lời': '(Nhập đáp án mẫu — Enter để xuống dòng)'
};

/**
 * Danh sách file mẫu theo chủ đề — sửa tại đây, chạy npm run generate:templates.
 * @type {{ label: string, fileName: string }[]}
 */
export const EXCEL_TEMPLATE_TOPICS = [
    { label: 'Chính trị', fileName: 'Chính trị.xlsx' },
    { label: 'Quân sự', fileName: 'Quân sự.xlsx' },
    { label: 'Hậu cần', fileName: 'Hậu cần.xlsx' },
    { label: 'Kỹ thuật', fileName: 'Kỹ thuật.xlsx' }
];

/** Mỗi file mẫu gồm 1 dòng trắc nghiệm + 1 dòng tự luận */
export const EXCEL_TEMPLATE_SAMPLE_ROWS = [EXCEL_SAMPLE_MC_ROW, EXCEL_SAMPLE_ESSAY_ROW];
