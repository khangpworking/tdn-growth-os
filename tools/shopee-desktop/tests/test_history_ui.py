"""Source-shape checks for the history/result UI batch.

These guard the two visible changes without a headless browser:
date ranges render as `13/10/2026 - 11/11/2026`, and the history tab keeps
step results plus the technical log while dropping collection and
source-selection controls. Runtime behaviour is exercised against the built
app; these tests make an accidental revert fail fast.
"""
import pathlib
import re
import unittest

HERE = pathlib.Path(__file__).resolve().parent
INDEX = HERE.parent / 'index.html'


def function_body(source, name):
    start = source.index('function ' + name + '(')
    brace = source.index('{', start)
    depth = 0
    quote = None
    i = brace
    while i < len(source):
        ch = source[i]
        if quote:
            if ch == '\\':
                i += 2
                continue
            if ch == quote:
                quote = None
        elif ch in '\'"`':
            quote = ch
        elif source.startswith('//', i):
            newline = source.find('\n', i)
            i = len(source) if newline == -1 else newline
            continue
        elif source.startswith('/*', i):
            end = source.find('*/', i)
            i = len(source) if end == -1 else end + 2
            continue
        elif ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                return source[brace + 1:i]
        i += 1
    raise AssertionError('unterminated function ' + name)


class DateRangeTextTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = INDEX.read_text(encoding='utf-8')

    def test_shared_formatter_uses_a_hyphen_between_dates(self):
        body = function_body(self.source, 'fmtDateRange')
        self.assertIn("if (!startDate || !endDate) return 'Chưa có';", body)
        self.assertIn("return fmtDate(startDate) + ' - ' + fmtDate(endDate);", body)

    def test_history_step_output_uses_the_shared_range(self):
        body = function_body(self.source, 'outputPeriodText')
        self.assertIn('return fmtDateRange(period.startDate, period.endDate);', body)
        self.assertNotIn("'từ '", body)

    def test_history_meta_uses_the_shared_range(self):
        body = function_body(self.source, 'requestMeta')
        self.assertIn('out.period = fmtDateRange(window.period.startDate, window.period.endDate);', body)
        self.assertNotIn("'từ '", body)

    def test_result_count_line_uses_a_hyphen_between_comment_dates(self):
        body = function_body(self.source, 'reviewOverviewCard')
        self.assertIn(
            "vnStamp(numbers.firstCommentAt).slice(0, 10) + ' - ' + "
            'vnStamp(numbers.lastCommentAt).slice(0, 10)',
            body,
        )
        self.assertNotIn("' · từ '", body)

    def test_history_capture_spec_window_uses_the_shared_range(self):
        body = function_body(self.source, 'renderCaptureSpecInto')
        self.assertIn('fmtDateRange(period.startDate, period.endDate)', body)

    def test_new_run_prose_keeps_its_own_wording(self):
        self.assertIn(
            "return 'Từ ' + fmtDate(startDate) + ' đến ' + fmtDate(endDate) + ' (tính cả hai đầu)';",
            self.source,
        )
        # 5th use: the «Bộ lọc đã lấy trên Metric» box on runs made from the user's Metric page (PR #535).
        self.assertEqual(self.source.count('fmtDateRange('), 5)


class HistoryReadOnlyTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = INDEX.read_text(encoding='utf-8')

    def test_history_renders_step_three_read_only(self):
        body = function_body(self.source, 'renderDetail')
        self.assertIn('reviewDataPanel(info, true)', body)
        self.assertIn('moduleOutputPanel(info)', body)
        self.assertIn("'Log kĩ thuật lịch sử chạy'", body)

    def test_history_has_no_sampling_panel_or_collection_controls(self):
        body = function_body(self.source, 'renderDetail')
        self.assertNotIn('reviewSamplingPanel(', body)
        for text in ('Lấy bình luận theo thiết lập lúc tạo lượt',
                     'Lấy thêm theo cách khác',
                     'Kiểm tra lại lần đọc'):
            self.assertNotIn(text, body)

    def test_history_technical_step_cards_have_no_run_buttons(self):
        body = function_body(self.source, 'renderDetail')
        self.assertIn('moduleCard(mod, info, true)', body)
        self.assertNotIn('moduleCard(mod, info, false)', body)

    def test_read_only_panel_omits_source_selector_and_actions(self):
        body = function_body(self.source, 'reviewDataPanel')
        self.assertRegex(
            body,
            re.compile(
                r"if \(!readOnly\) \{\s*var field = h\('label', 'field'\);\s*"
                r"field\.appendChild\(h\('span', null, 'Chọn kết quả để dùng'\)\);",
                re.S,
            ),
        )
        self.assertRegex(
            body,
            re.compile(
                r"if \(!readOnly\) \{\s*hint = h\('p', 'rs-hint'\);.*?"
                r"saveBtn = h\('button', 'abtn', 'Lưu vào hệ thống'\);",
                re.S,
            ),
        )
        self.assertIn("if (!sha && readOnly) sha = rdDefaultSha(sources);", body)
        self.assertIn('if (select) {', body)
        self.assertIn('if (saveBtn) saveBtn.addEventListener', body)
        self.assertIn('if (downloadBtn) downloadBtn.addEventListener', body)

    def test_result_tab_keeps_overview_and_insights(self):
        body = function_body(self.source, 'renderResult')
        self.assertIn('reviewOverviewCard(source, runId)', body)
        self.assertIn('reviewInsightsPanel(insights, runId)', body)
        self.assertNotIn('reviewSamplingPanel(', body)


if __name__ == '__main__':
    unittest.main()
