#! /usr/bin/env python
# -*- coding: utf-8 -*-
# Vendored from pychrome 0.2.4 (BSD, see LICENSE). TDN changes: `requests` replaced by
# `urllib` (stdlib), and `new_tab`, `activate_tab`, `close_tab` removed: the app never
# opens, focuses or closes a Chrome tab through the DevTools HTTP endpoints.

from __future__ import unicode_literals

import json
import urllib.request

from .tab import Tab


__all__ = ["Browser"]


def _get_json(url, timeout):
    with urllib.request.urlopen(url, timeout=timeout) as response:
        return json.loads(response.read().decode('utf-8'))


class Browser(object):
    _all_tabs = {}

    def __init__(self, url="http://127.0.0.1:9222"):
        self.dev_url = url

        if self.dev_url not in self._all_tabs:
            self._tabs = self._all_tabs[self.dev_url] = {}
        else:
            self._tabs = self._all_tabs[self.dev_url]

    def list_tab(self, timeout=None):
        tabs_map = {}
        for tab_json in _get_json("%s/json" % self.dev_url, timeout):
            if tab_json['type'] != 'page':  # pragma: no cover
                continue

            if tab_json['id'] in self._tabs and self._tabs[tab_json['id']].status != Tab.status_stopped:
                tabs_map[tab_json['id']] = self._tabs[tab_json['id']]
            else:
                tabs_map[tab_json['id']] = Tab(**tab_json)

        self._tabs = tabs_map
        return list(self._tabs.values())

    def version(self, timeout=None):
        return _get_json("%s/json/version" % self.dev_url, timeout)

    def __str__(self):
        return '<Browser %s>' % self.dev_url

    __repr__ = __str__
