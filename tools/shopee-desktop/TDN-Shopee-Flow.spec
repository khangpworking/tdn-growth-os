# -*- mode: python ; coding: utf-8 -*-
# Build from tools/shopee-desktop:  python -m PyInstaller --noconfirm --clean TDN-Shopee-Flow.spec
# Bundles the page, and the shared in-page Metric request that v3-capture.js also imports.
import os

here = SPECPATH
shared_js = os.path.normpath(os.path.join(here, '../opencli-metric/clis/metric/request-in-page.js'))

a = Analysis(
    [os.path.join(here, 'tdn_shopee_app.py')],
    pathex=[here],
    binaries=[],
    datas=[(os.path.join(here, 'index.html'), '.'), (shared_js, '.')],
    # vendor_pychrome is imported lazily (only when Chrome is attached), so name it here.
    hiddenimports=['tdn_shopee_transport', 'tdn_metric_browser', 'vendor_pychrome', 'vendor_pychrome.browser',
                   'vendor_pychrome.tab', 'vendor_pychrome.exceptions', 'websocket'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='TDN-Shopee-Flow',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
