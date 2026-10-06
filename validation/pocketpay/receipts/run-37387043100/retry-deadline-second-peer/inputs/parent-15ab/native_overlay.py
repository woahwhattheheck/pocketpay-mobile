"""Fail closed on the actual Expo render-error overlay seen in prior guest media."""


def assert_no_native_error_overlay(tree):
    for node in tree.iter('node'):
        for key in ('text', 'content-desc'):
            value = node.attrib.get(key, '').strip().casefold()
            if value in ('render error', 'uncaught error'):
                raise RuntimeError('Actual native render-error overlay covers app UI; no underlying target/action claim')
