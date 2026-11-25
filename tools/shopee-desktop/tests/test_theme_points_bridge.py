"""Grouped theme points (owner F697–F699, app 1.4.0) through the bridge validator. Synthetic payloads only.

| theme summary                                   | bridge                 |
|-------------------------------------------------|------------------------|
| READY with 1–5 valid points                     | returned unchanged     |
| READY without points (server before 1.4.0)      | returned unchanged     |
| count ≠ number of ids, repeated id, 0 comments  | REMOTE_OUTPUT_INVALID  |
| 6 points, points on EMPTY, extra point key      | REMOTE_OUTPUT_INVALID  |
| empty or > 200-char text, id not a string       | REMOTE_OUTPUT_INVALID  |
"""
import sys
import unittest

sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent))
import test_review_insights_bridge as base  # noqa: E402  (module import: its tests run once, in their own module)

payload = base.payload


def point(text='Kem thấm nhanh', ids=('review-a1',)):
    return {'text': text, 'count': len(ids), 'commentIds': list(ids)}


def with_points(points, status='READY'):
    value = payload()
    for bucket in (value['sources'][0]['all'], value['sources'][0]['links'][0]['insights']):
        summary = bucket['themes'][0]['summary']
        summary['status'] = status
        summary['points'] = points
    return value


class ThemePointsBridgeTests(unittest.TestCase):
    call = base.ReviewInsightsBridgeTests.call
    assert_invalid = base.ReviewInsightsBridgeTests.assert_invalid

    def test_valid_points_and_no_points_are_returned_unchanged(self):
        for name, value in {
            'one point': with_points([point()]),
            'five points': with_points([point(f'Ý {n}', (f'r{n}a', f'r{n}b')) for n in range(5)]),
            'no points': payload(),
        }.items():
            with self.subTest(name):
                self.assertEqual(self.call(value), {'ok': True, 'data': value})

    def test_malformed_points_are_rejected(self):
        bad_count = point(ids=('a', 'b'))
        bad_count['count'] = 3
        for name, value in {
            'count is not the number of ids': with_points([bad_count]),
            'repeated id': with_points([point(ids=('a', 'a'))]),
            'no comments': with_points([point(ids=())]),
            'six points': with_points([point(f'Ý {n}', (f'r{n}',)) for n in range(6)]),
            'points on EMPTY': with_points([point()], status='EMPTY'),
            'extra point key': with_points([{**point(), 'polarity': 'khen'}]),
            'empty text': with_points([point(text='')]),
            'text over 200 chars': with_points([point(text='x' * 201)]),
            'id not a string': with_points([{'text': 'Ý', 'count': 1, 'commentIds': [7]}]),
            'points not a list': with_points({'text': 'Ý'}),
        }.items():
            with self.subTest(name):
                self.assert_invalid(value)


if __name__ == '__main__':
    unittest.main()
