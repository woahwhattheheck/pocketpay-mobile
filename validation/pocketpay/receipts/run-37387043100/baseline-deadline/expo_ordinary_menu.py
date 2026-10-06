"""Local proposal only: exact observed Expo host header, no generic X fallback.

Source confirmation and parent peer review are required before integration.
Importing this file performs no device, network, source or scheduling action.
"""
import hashlib
import json
import re
import shlex
import time
import xml.etree.ElementTree as ET

PACKAGE = 'host.exp.exponent'
PERMISSION_PACKAGES = {'com.android.permissioncontroller', 'com.google.android.permissioncontroller'}
TITLE = 'stellar-pocketpay-mobile'
SDK = 'SDK version: 54.0.0'
RUNTIME = 'Runtime version: exposdk:54.0.0'
WELCOME = 'Welcome to PocketPay'
MARKERS = (TITLE, SDK, RUNTIME, 'Connected to expo-cli', '127.0.0.1:8081',
           'Reload', 'Go Home', 'Show developer action button', 'Show Performance Monitor')


def visible_bounds(node):
    match = re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', node.get('bounds', ''))
    if not match:
        raise RuntimeError('Observed native bounds missing')
    x1, y1, x2, y2 = map(int, match.groups())
    if not (0 <= x1 < x2 <= 720 and 0 <= y1 < y2 <= 1280):
        raise RuntimeError('Observed native bounds are outside reviewed viewport')
    return x1, y1, x2, y2


def overlay_guard(tree):
    for node in tree.iter('node'):
        if node.get('package') in PERMISSION_PACKAGES:
            raise RuntimeError('Native permission UI blocks host action and navigation')
        for key in ('text', 'content-desc'):
            value = node.get(key, '').strip()
            if value.casefold() in ('render error', 'uncaught error', 'revealed secret key'):
                raise RuntimeError('Unsafe native error or secret UI blocks host action')
            if re.search(r'\bS[A-Z2-7]{55}\b', value):
                raise RuntimeError('Secret material blocks host action and media')


def enabled_chain(tree, node):
    parents = {child: parent for parent in tree.iter() for child in parent}
    current = node
    while current is not None:
        if current.get('enabled') == 'false':
            raise RuntimeError('Disabled native ancestor blocks host action')
        current = parents.get(current)


def has_host_sheet(tree):
    return any(node.get('package') == PACKAGE and node.get('content-desc') == 'Bottom Sheet'
               for node in tree.iter('node'))


def ordinary_close(tree):
    """Select only the retained header sibling; never infer an arbitrary X."""
    overlay_guard(tree)
    sheets = [node for node in tree.iter('node')
              if node.get('package') == PACKAGE and node.get('content-desc') == 'Bottom Sheet']
    if (len(sheets) != 2 or any(node.get('class') != 'android.widget.SeekBar' for node in sheets)
            or visible_bounds(sheets[0]) != visible_bounds(sheets[1])
            or sum(bool(list(node)) for node in sheets) != 1):
        raise RuntimeError('Host sheet hierarchy differs from the exact observed SDK54 shape')
    candidates = []
    for sheet in tree.iter('node'):
        if (sheet.get('package'), sheet.get('class'), sheet.get('content-desc')) != (
                PACKAGE, 'android.widget.SeekBar', 'Bottom Sheet'):
            continue
        children = list(sheet)
        if len(children) != 1 or children[0].get('class') != 'android.widget.ScrollView':
            continue
        scroll = children[0]
        nodes = list(scroll)
        labels = {node.get('text', '').strip() for node in scroll.iter('node')
                  if node.get('package') == PACKAGE}
        if not set(MARKERS).issubset(labels) or len(nodes) < 5:
            continue
        title, close, sdk, runtime = nodes[:4]
        if [node.get('text') for node in (title, sdk, runtime)] != [TITLE, SDK, RUNTIME]:
            continue
        if any(node.get('class') != 'android.widget.TextView' for node in (title, sdk, runtime)):
            continue
        if any(node.get('package') != PACKAGE or node.get('enabled') != 'true'
               for node in (sheet, scroll, title, close, sdk, runtime)):
            continue
        if (close.get('class') != 'android.view.ViewGroup' or close.get('clickable') != 'true'
                or close.get('text') or close.get('content-desc') or close.get('resource-id')):
            continue
        image = list(close)
        if (len(image) != 1 or image[0].get('class') != 'android.view.ViewGroup'
                or image[0].get('package') != PACKAGE or image[0].get('clickable') != 'false'
                or image[0].get('enabled') != 'true' or list(image[0])
                or image[0].get('text') or image[0].get('content-desc')):
            continue
        title_box, close_box = visible_bounds(title), visible_bounds(close)
        x1, y1, x2, y2 = close_box
        if (close_box != visible_bounds(image[0]) or x2 != title_box[2] or y1 != title_box[1]
                or x2-x1 != 40 or y2-y1 != 40 or x1 < title_box[0] or y2 > title_box[3]):
            continue
        enabled_chain(tree, close)
        candidates.append(close)
    if len(candidates) != 1:
        raise RuntimeError('Expected exactly one source-bound observed Expo header Close')
    # Any other enabled clickable view overlapping the header action is ambiguous.
    close = candidates[0]
    box = visible_bounds(close)
    title_box = visible_bounds(next(node for node in tree.iter('node')
                                    if node.get('package') == PACKAGE and node.get('text') == TITLE))
    for node in tree.iter('node'):
        if node is close or node.get('clickable') != 'true':
            continue
        try:
            other = visible_bounds(node)
        except RuntimeError:
            continue
        if (other == box or (title_box[0] <= other[0] < other[2] <= title_box[2]
                             and title_box[1] <= other[1] < other[3] <= title_box[3])):
            raise RuntimeError('Another native action overlaps the observed header context')
    return close


def unobscured_host(tree):
    overlay_guard(tree)
    if has_host_sheet(tree):
        raise RuntimeError('Host sheet remains; no product or navigation assertion')
    if not any(node.get('package') == PACKAGE for node in tree.iter('node')):
        raise RuntimeError('Expo host UI is not present after closure')


def unobscured_welcome(tree):
    unobscured_host(tree)
    matches = [node for node in tree.iter('node') if node.get('package') == PACKAGE
               and node.get('class') == 'android.widget.TextView'
               and node.get('text') == WELCOME and node.get('enabled') == 'true']
    if len(matches) != 1:
        raise RuntimeError('Actual unobscured Welcome has not been observed')
    visible_bounds(matches[0])
    enabled_chain(tree, matches[0])


def foreground_identity(text):
    """Fail closed unless the native foreground record is exactly this activity."""
    lines = [line.strip() for line in text.splitlines()
             if re.match(r'(?:mResumedActivity|topResumedActivity)\s*[:=]', line.strip())]
    pattern = re.compile(r'(?:mResumedActivity|topResumedActivity)\s*[:=]\s*ActivityRecord\{'
                         r'([0-9a-fA-F]+) u0 host\.exp\.exponent/'
                         r'(?:\.experience\.ExperienceActivity|host\.exp\.exponent\.experience\.ExperienceActivity)'
                         r' t(\d+)\}\s*$')
    identities = set()
    for line in lines:
        match = pattern.fullmatch(line)
        if not match:
            raise RuntimeError('Unexpected native foreground activity; no action or URI replay')
        identities.add((match.group(1).lower(), int(match.group(2))))
    if len(identities) != 1:
        raise RuntimeError('Unique resumed Expo ExperienceActivity not established')
    return next(iter(identities))


def read_foreground(controller, retain_as=None):
    raw = controller.adb('shell', 'dumpsys', 'activity', 'activities')
    if retain_as:
        retain_native_text(controller, retain_as, raw)
    return foreground_identity(raw)


def camera_prompt(tree):
    """Recognize only an actual scoped CAMERA dialog; never interact with it."""
    deny = []
    messages = []
    for node in tree.iter('node'):
        if node.get('package') not in PERMISSION_PACKAGES:
            continue
        resource = node.get('resource-id', '')
        if resource.endswith(':id/permission_deny_button'):
            if node.get('enabled') == 'true' and node.get('clickable') == 'true':
                visible_bounds(node)
                enabled_chain(tree, node)
                deny.append(node)
        if resource.endswith(':id/permission_message'):
            messages.append(' '.join(node.get('text', '').split()))
    return len(deny) == 1 and messages == ['Allow Expo Go to take pictures and record video?']


def after_delivery_identity(text, tree, original):
    """Go may pause under a real CAMERA activity retained in its original task."""
    record = re.compile(r'ActivityRecord\{([0-9a-fA-F]+) u0 ([^/\s]+)/([^\s}]+) t(\d+)\}')
    foreground = []
    for line in text.splitlines():
        if re.match(r'\s*(?:mResumedActivity|topResumedActivity)\s*[:=]', line):
            found = record.search(line)
            if not found:
                raise RuntimeError('Unrecognized foreground native record after URI')
            foreground.append((found.group(1).lower(), found.group(2), found.group(3), int(found.group(4))))
    foreground = set(foreground)
    if len(foreground) != 1:
        raise RuntimeError('Unique foreground native activity not established after URI')
    active = next(iter(foreground))
    go_components = {'.experience.ExperienceActivity', 'host.exp.exponent.experience.ExperienceActivity'}
    go_records = {(m.group(1).lower(), int(m.group(4))) for m in record.finditer(text)
                  if m.group(2) == PACKAGE and m.group(3) in go_components}
    if go_records != {original}:
        raise RuntimeError('Original unique Go ActivityRecord/task not retained after URI')
    if active[1] == PACKAGE and active[2] in go_components and (active[0], active[3]) == original:
        overlay_guard(tree)
        if has_host_sheet(tree):
            raise RuntimeError('Host chrome reappeared after exact URI delivery')
        return 'same_go_foreground'
    permission_components = {'.permission.ui.GrantPermissionsActivity',
                             'com.android.permissioncontroller.permission.ui.GrantPermissionsActivity',
                             'com.google.android.permissioncontroller.permission.ui.GrantPermissionsActivity'}
    if (active[1] in PERMISSION_PACKAGES and active[2] in permission_components
            and active[3] == original[1] and camera_prompt(tree)):
        # No permission dismissal or grant/deny is performed here. These retain
        # their original camera case controls and native media requirements.
        for node in tree.iter('node'):
            for key in ('text', 'content-desc'):
                value = node.get(key, '').strip()
                if value.casefold() in ('render error', 'uncaught error', 'revealed secret key') or re.search(r'\bS[A-Z2-7]{55}\b', value):
                    raise RuntimeError('Unsafe UI beneath camera dialog; no flow assertion')
        if has_host_sheet(tree):
            raise RuntimeError('Host sheet remains behind native camera dialog')
        return 'recognized_camera_dialog_same_task_go_retained'
    raise RuntimeError('URI foreground changed outside original Go/CAMERA task contract')


def retain_native_text(controller, name, text):
    if re.search(r'\bS[A-Z2-7]{55}\b', text):
        raise RuntimeError('Unsafe native metadata; no raw text retained')
    (controller.output / name).write_text(text)


def retained_pair(controller, name, validator):
    for suffix in ('.xml', '-after.xml'):
        validator(ET.parse(controller.output / (name + suffix)).getroot())


def close_ordinary_menu(controller):
    """Future native execution: close exact host control and retain real closure."""
    if controller.developer_sheet_dismissals >= 2:
        raise RuntimeError('Shared maximum two host dismissals already reached')
    tree, _ = controller.dump()
    ordinary_close(tree)
    before_identity = read_foreground(controller, 'ordinary-menu-native-before-activities.txt')
    name = 'observed-expo-ordinary-menu-close'
    if not controller.capture(name+'-before', MARKERS, allow_developer_sheet=True):
        raise RuntimeError('Host Close before-action media missing')
    retained_pair(controller, name+'-before', ordinary_close)
    current, _ = controller.dump()
    close = ordinary_close(current)
    if read_foreground(controller, 'ordinary-menu-native-before-tap-activities.txt') != before_identity:
        raise RuntimeError('Expo activity changed before header Close')
    x1, y1, x2, y2 = visible_bounds(close)
    controller.developer_sheet_dismissals += 1
    controller.adb('shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2))
    until = min(controller.deadline, time.monotonic()+8)
    while time.monotonic() < until:
        current, _ = controller.dump()
        overlay_guard(current)
        if read_foreground(controller, 'ordinary-menu-native-after-activities.txt') != before_identity:
            raise RuntimeError('Header action backgrounded or replaced Expo; no URI replay')
        if has_host_sheet(current):
            time.sleep(0.2)
            continue
        unobscured_host(current)
        if not controller.capture(name+'-after'):
            raise RuntimeError('Actual unobscured host closure media missing')
        retained_pair(controller, name+'-after', unobscured_host)
        if read_foreground(controller, 'ordinary-menu-native-after-capture-activities.txt') != before_identity:
            raise RuntimeError('Expo foreground changed during closure media')
        proof = {'activityRecord': before_identity[0], 'taskId': before_identity[1],
                 'hostMenuClosedObserved': True, 'productStatePassed': False,
                 'before': name+'-before', 'after': name+'-after'}
        try:
            retained_pair(controller, name+'-after', unobscured_welcome)
            proof['welcomeObserved'] = True
        except RuntimeError:
            proof['welcomeObserved'] = False
        controller.expo_ordinary_closure = proof
        (controller.output / 'observed-expo-ordinary-menu-closure.json').write_text(json.dumps(proof, indent=2)+'\n')
        return proof
    raise RuntimeError('Observed ordinary host menu did not close within bound')


def redeliver_original_uri_once(controller, original_uri):
    """Only after actual native closure; no cold/new activity or second attempt."""
    allowed = {'exp://127.0.0.1:8081/--/send/__camera-native-fixture?screen='+screen
               for screen in ('scan', 'contacts')}
    if original_uri not in allowed or original_uri != getattr(controller, 'original_camera_uri', None):
        raise RuntimeError('URI is not the exact captured original camera launch')
    proof = getattr(controller, 'expo_ordinary_closure', None)
    if (not proof or proof.get('hostMenuClosedObserved') is not True
            or proof.get('welcomeObserved') is not True):
        raise RuntimeError('Actual ordinary host closure proof required before replay')
    if getattr(controller, 'original_uri_redelivery_attempted', False):
        raise RuntimeError('Original URI redelivery is strictly once-only')
    identity = (proof['activityRecord'], proof['taskId'])
    current, _ = controller.dump()
    unobscured_welcome(current)
    before_native = controller.adb('shell', 'dumpsys', 'activity', 'activities')
    if foreground_identity(before_native) != identity:
        raise RuntimeError('Original Expo activity is not foreground before redelivery')
    retain_native_text(controller, 'original-uri-native-before-activities.txt', before_native)
    (controller.output / 'original-camera-uri.txt').write_text(original_uri+'\n')
    controller.original_uri_redelivery_attempted = True
    result = controller.adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW',
                            '-d', shlex.quote(original_uri), '-p', PACKAGE)
    retain_native_text(controller, 'original-uri-am-result.txt', result)
    after_tree, after_xml = controller.dump()
    after_native = controller.adb('shell', 'dumpsys', 'activity', 'activities')
    retain_native_text(controller, 'original-uri-native-after-activities.txt', after_native)
    states = re.findall(r'^LaunchState:\s*(\S+)\s*$', result, re.MULTILINE)
    statuses = re.findall(r'^Status:\s*(\S+)\s*$', result, re.MULTILINE)
    if states != ['HOT'] or statuses != ['ok']:
        raise RuntimeError('Original URI was not HOT delivery; no cold/new flow accepted')
    post_delivery = after_delivery_identity(after_native, after_tree, identity)
    retain_native_text(controller, 'original-uri-after-ui.xml', after_xml)
    record = {'uri': original_uri, 'activityRecord': identity[0], 'taskId': identity[1],
              'nativeLaunchState': 'HOT', 'productStatePassed': False,
              'postDeliveryNativeState': post_delivery,
              'amResultSha256': hashlib.sha256(result.encode()).hexdigest(),
              'limit': 'Exact once-only URI delivery; original target/permission/manual/media checks still required'}
    (controller.output / 'observed-exact-original-uri-redelivery.json').write_text(json.dumps(record, indent=2)+'\n')
    return record
