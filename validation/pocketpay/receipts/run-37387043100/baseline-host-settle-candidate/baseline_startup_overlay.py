"""Pure recognition of the actual Expo runtime-not-ready redbox; no dismissal."""


class FatalFixtureStartup(RuntimeError):
    """The validation initializer is unavailable; later product cases cannot run."""


def fixture_startup_error(tree):
    nodes = list(tree.iter("node"))
    host = "host.exp.exponent"
    title = any(
        node.attrib.get("package") == host
        and node.attrib.get("resource-id") == host + ":id/catalyst_redbox_title"
        and node.attrib.get("class") == "android.widget.TextView"
        and node.attrib.get("text", "").startswith("[runtime not ready]: Error:")
        for node in nodes
    )
    controls = {
        node.attrib.get("resource-id")
        for node in nodes
        if node.attrib.get("package") == host
        and node.attrib.get("class") == "android.widget.Button"
    }
    return title and {host + ":id/rn_redbox_dismiss_button",
                          host + ":id/rn_redbox_reload_button"} <= controls
