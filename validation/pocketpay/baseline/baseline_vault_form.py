"""Observe a real Vault form through bounded native scrolling; never tap a payment.

This is controller discovery only. Its return value is not product acceptance.
"""
import re


def viewport(node):
    match = re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', node.get('bounds', ''))
    if not match:
        return None
    left, top, right, bottom = map(int, match.groups())
    return (left, top, right, bottom) if 0 <= left < right <= 720 and 0 <= top < bottom <= 1280 else None


def observe_vault_form(namespace, max_swipes=4):
    """Find one visible amount field plus the existing enabled Lock control."""
    if max_swipes != 4:
        raise RuntimeError('Reviewed Vault discovery bound must remain four swipes')
    for attempt in range(max_swipes + 1):
        tree = namespace['dump']('vault-form-discovery-' + str(attempt))
        # The adapter's dump rejects or settles host chrome before this lookup.
        action = namespace['find_action'](tree, 'Set Aside for 30 Days')
        fields = [node for node in tree.iter('node')
                  if node.get('package') == 'host.exp.exponent'
                  and node.get('class') == 'android.widget.EditText'
                  and node.get('enabled') == 'true' and viewport(node)]
        if action is not None and len(fields) == 1:
            return tree
        if len(fields) > 1:
            raise RuntimeError('Ambiguous actual Vault amount fields; no input or action')
        if attempt == max_swipes:
            break
        scrolls = [node for node in tree.iter('node')
                   if node.get('package') == 'host.exp.exponent'
                   and node.get('class') == 'android.widget.ScrollView'
                   and node.get('enabled') == 'true'
                   and node.get('scrollable') == 'true' and viewport(node)]
        if len(scrolls) != 1:
            raise RuntimeError('Unique actual native Vault ScrollView unavailable')
        left, top, right, bottom = viewport(scrolls[0])
        # Use this observed ScrollView's interior, never coordinates for a guessed control.
        x = (left + right) // 2
        margin = max(1, (bottom - top) // 5)
        namespace['adb']('shell', 'input', 'swipe', str(x), str(bottom-margin),
                         str(x), str(top+margin), '350')
    raise RuntimeError('Actual enabled Vault Lock and amount field were not observed after four swipes')
