"""Source-shape checks for the per-theme AI summaries on the result tab.

Every one of the ten theme cards must render its own always-visible
`AI Tóm tắt chủ đề` block; only the supporting comment evidence stays
expandable. Runtime behaviour is exercised against the built app; these checks
make a structural or contract revert fail fast.
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


class ThemeSummaryRenderTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = INDEX.read_text(encoding='utf-8')

    def test_all_ten_themes_render_a_summary_before_the_comment_expander(self):
        body = function_body(self.source, 'insightThemeCard')
        self.assertIn('normalizedInsightThemes(bucket).forEach', body)
        self.assertIn('article.appendChild(themeSummaryBlock(theme));', body)
        self.assertNotIn("details.className = 'theme-card'", body)
        self.assertIn("details.className = 'theme-comments'", body)
        self.assertLess(body.index('article.appendChild(themeSummaryBlock(theme))'),
                        body.index("details.className = 'theme-comments'"))
        self.assertGreater(body.index('article.appendChild(details)'),
                           body.index('article.appendChild(themeSummaryBlock(theme))'))

    def test_ten_theme_definitions_remain(self):
        start = self.source.index('var RESULT_THEME_DEFINITIONS = [')
        end = self.source.index('];', start)
        self.assertEqual(len(re.findall(r"code: 'T-", self.source[start:end])), 10)

    def test_summary_block_has_the_required_title_and_honest_states(self):
        body = function_body(self.source, 'themeSummaryBlock')
        self.assertIn("h('h4', null, 'AI Tóm tắt chủ đề')", body)
        self.assertIn("box.dataset.state = String(summary.status || 'EMPTY').toLowerCase();", body)
        self.assertIn('box.dataset.themeCode', body)
        self.assertIn('Chưa có đủ bình luận đã gắn nhãn để tóm tắt chủ đề này.', body)
        self.assertIn('Chưa đọc được nhãn Jev để tóm tắt chủ đề này.', body)
        self.assertIn('Dựa trên ', body)
        self.assertIn('không dùng dòng chưa gắn nhãn hoặc nhãn “không rõ phân loại”', body)
        self.assertIn("if (summary.status === 'READY' && summary.text)", body)

    def test_supporting_comment_evidence_stays_expandable(self):
        body = function_body(self.source, 'insightThemeCard')
        self.assertIn(
            "toggle.textContent = examples.length ? 'Xem ' + fmtInt(examples.length) + ' bình luận mẫu' : 'Chưa có bình luận mẫu';",
            body,
        )
        self.assertIn('body.appendChild(commentList(examples, 8));', body)
        self.assertIn('details.appendChild(body);', body)
        self.assertIn('article.appendChild(details);', body)

    def test_counts_bars_colors_and_labels_are_preserved(self):
        body = function_body(self.source, 'insightThemeCard')
        for token in (
            "fmtInt(theme.count) + ' bình luận'",
            "[['khen', khen], ['che', che], ['trung-lap', trungLap]]",
            "['khen', 'Khen', khen], ['che', 'Chê', che], ['trung-lap', 'Trung lập', trungLap]",
            "'Không rõ phân loại ' + fmtInt(theme.unclearCount)",
            "'Khen ' + fmtInt(khen) + ', Chê ' + fmtInt(che) + ', Trung lập ' + fmtInt(trungLap)",
            "fill.dataset.polarity = part[0];",
        ):
            self.assertIn(token, body)

    def test_missing_or_empty_payload_summaries_are_handled(self):
        normal = function_body(self.source, 'normalizedInsightThemes')
        self.assertIn("summary: { status: 'EMPTY', text: null, model: null, generatedAt: null }", normal)
        block = function_body(self.source, 'themeSummaryBlock')
        self.assertIn("theme && theme.summary ? theme.summary : { status: 'EMPTY', text: null }", block)

    def test_overall_summary_card_is_unchanged(self):
        body = function_body(self.source, 'insightSummaryCard')
        self.assertIn("h('h3', null, 'AI Tóm tắt')", body)
        self.assertNotIn('AI Tóm tắt chủ đề', body)
        self.assertIn("card.id = 'resultAiSummary'", body)
        panel = function_body(self.source, 'reviewInsightsPanel')
        self.assertIn('insightSummaryCard(bucket)', panel)
        self.assertIn('insightThemeCard(bucket)', panel)

    def test_theme_summary_css_is_visible_and_comments_use_a_details_toggle(self):
        self.assertIn('.insight-summary { border-left: 4px solid var(--accent);', self.source)
        self.assertIn('.theme-ai { margin: 0 12px 12px; }', self.source)
        self.assertIn('.theme-comments > summary {', self.source)
        self.assertIn('.theme-comments > summary::-webkit-details-marker', self.source)
        self.assertNotIn('.theme-card > summary', self.source)

    def test_mock_themes_carry_summaries_so_demo_mode_is_not_empty(self):
        bucket = function_body(self.source, 'mockInsightBucket')
        self.assertIn('summary: mockThemeSummary(definition, examples, total)', bucket)
        merged = function_body(self.source, 'mergeInsightBuckets')
        self.assertIn('summary: mockThemeSummary(definition, themeComments, safeTotal)', merged)

    def test_theme_summary_path_does_not_use_unsanitized_html(self):
        combined = function_body(self.source, 'themeSummaryBlock') + function_body(self.source, 'insightThemeCard')
        self.assertNotIn('innerHTML', combined)
        self.assertNotIn('insertAdjacentHTML', combined)
        self.assertNotIn('outerHTML', combined)


if __name__ == '__main__':
    unittest.main()
