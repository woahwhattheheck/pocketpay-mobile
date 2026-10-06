"""Recognize only the Expo SDK54 introduction retained in run37379451997.

Import/parser checks perform no device work. This is host onboarding, not a
PocketPay action or a product-state assertion.
"""
import json
import time

PACKAGE = 'host.exp.exponent'
MARKERS = (
    'stellar-pocketpay-mobile',
    'SDK version: 54.0.0',
    'Runtime version: exposdk:54.0.0',
    'This is the developer menu. It gives you access to useful tools in Expo Go.',
    'You can press ⌘ + m on macOS or Ctrl + m on other platforms to get back to it at any time.',
)
PERMISSION_PACKAGES = {'com.android.permissioncontroller', 'com.google.android.permissioncontroller'}


def intro_sheet(tree):
    if any(n.get('package') in PERMISSION_PACKAGES for n in tree.iter('node')):
        return False
    for node in tree.iter('node'):
        if node.get('package') != PACKAGE or node.get('content-desc') != 'Bottom Sheet':
            continue
        labels = {n.get('text', '').strip() for n in node.iter('node')
                  if n.get('package') == PACKAGE}
        if set(MARKERS).issubset(labels):
            return True
    return False


def intro_continue(tree, exact_action):
    if not intro_sheet(tree):
        raise RuntimeError('Exact observed Expo SDK54 tutorial context is absent; no onboarding action')
    node = exact_action(tree, 'Continue', {PACKAGE})
    if node.get('class') != 'android.widget.Button':
        raise RuntimeError('Expo tutorial action is not the observed native Button')
    parents = {child: parent for parent in tree.iter() for child in parent}
    ancestor = parents.get(node)
    while ancestor is not None:
        if ancestor.get('content-desc') == 'Bottom Sheet' and intro_sheet(ancestor):
            return node
        ancestor = parents.get(ancestor)
    raise RuntimeError('Continue is outside the exact observed Expo tutorial sheet')


def dismiss_observed_intro(controller, tree, exact_action, bounds):
    if not intro_sheet(tree):
        return False
    if controller.developer_sheet_dismissals >= 2:
        raise RuntimeError('Known Expo onboarding exceeded bounded observed dismissals')
    sequence = controller.developer_sheet_dismissals + 1
    name = 'observed-expo-sdk54-intro-' + str(sequence)
    intro_continue(tree, exact_action)
    if not controller.capture(name + '-before', MARKERS,
                              action=('Continue', {PACKAGE}, None), allow_developer_sheet=True):
        raise RuntimeError('Exact Expo tutorial before-action media was not retained')
    current, _ = controller.dump()
    node = intro_continue(current, exact_action)
    x1, y1, x2, y2 = bounds(node)
    controller.adb('shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2))
    controller.developer_sheet_dismissals += 1
    until = min(controller.deadline, time.monotonic() + 8)
    while time.monotonic() < until:
        current, _ = controller.dump()
        if not intro_sheet(current):
            # This frame proves only that the exact tutorial is gone. A normal
            # Expo developer sheet may follow and must be handled separately.
            if not controller.capture(name + '-after', allow_developer_sheet=True):
                raise RuntimeError('Expo tutorial closure media was not retained')
            final, _ = controller.dump()
            if intro_sheet(final):
                raise RuntimeError('Expo tutorial reappeared during closure capture')
            record = {'before': name + '-before', 'after': name + '-after',
                      'action': 'Unique enabled Expo native Continue in exact SDK54 introduction',
                      'tutorialClosedObserved': True, 'productStatePassed': False,
                      'sourceOfPredicate': 'run37379451997 camera/final-ui.xml'}
            path = controller.output / 'observed-expo-sdk54-intro-closures.json'
            records = json.loads(path.read_text()) if path.exists() else []
            path.write_text(json.dumps(records + [record], indent=2) + '\n')
            return True
        time.sleep(0.2)
    raise RuntimeError('Exact Expo tutorial did not close within the observed bound')
