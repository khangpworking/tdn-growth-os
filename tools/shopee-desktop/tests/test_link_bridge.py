"""The page may ask the bridge to open a Shopee product link in the default browser.

Only `https://shopee.vn/...` reaches the browser; anything else is refused before
`webbrowser.open` runs. No real browser is started.
"""
import pathlib
import sys
import unittest
from unittest import mock

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import tdn_shopee_app  # noqa: E402

REFUSED = {'ok': False, 'error': {'code': 'LINK_NOT_ALLOWED', 'message': 'LINK_NOT_ALLOWED'}}


class ShopeeLinkTest(unittest.TestCase):
    def open(self, url, opened=True):
        with mock.patch('webbrowser.open', return_value=opened) as browser:
            result = tdn_shopee_app.Api().openShopeeLink(url)
        return result, browser

    def test_a_shopee_product_link_opens_in_the_default_browser(self):
        url = 'https://shopee.vn/product/1246134804/52854945820'
        result, browser = self.open(url)
        self.assertEqual(result, {'ok': True, 'data': {'opened': True}})
        browser.assert_called_once_with(url, new=2)

    def test_every_other_address_is_refused_before_the_browser(self):
        for url in (
            None, 1, '', 'https://shopee.vn', 'http://shopee.vn/product/1/2',
            'https://shopee.vn.example.com/product/1/2', 'https://example.com/?u=https://shopee.vn/',
            'https://user@shopee.vn/product/1/2', 'https://shopee.vn:8443/product/1/2',
            'https://SHOPEE.VN/product/1/2', 'javascript:alert(1)//https://shopee.vn/',
            'file:///https://shopee.vn/', 'https://shopee.vn\\@example.com/',
            'https://shopee.vn/product/1/2\n', 'https://shopee.vn/a b', ' https://shopee.vn/product/1/2',
            'https://shopee.vn/' + 'a' * 2001,
        ):
            with self.subTest(url=url):
                result, browser = self.open(url)
                self.assertEqual(result, REFUSED)
                browser.assert_not_called()

    def test_a_browser_that_does_not_open_is_reported(self):
        result, _ = self.open('https://shopee.vn/product/1/2', opened=False)
        self.assertEqual(result, {'ok': False, 'error': {'code': 'LINK_OPEN_FAILED', 'message': 'LINK_OPEN_FAILED'}})


if __name__ == '__main__':
    unittest.main()
