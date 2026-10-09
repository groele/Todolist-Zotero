#!/usr/bin/env python3
"""Build a ZIP-based Zotero XPI from the current project sources."""

from __future__ import annotations

import json
import sys
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PACKAGE_ROOTS = ("chrome", "locale")
PACKAGE_FILES = ("bootstrap.js", "chrome.manifest", "manifest.json", "prefs.js")
REQUIRED_FILES = (
    "bootstrap.js",
    "chrome.manifest",
    "manifest.json",
    "prefs.js",
    "chrome/content/scripts/index.js",
    "chrome/content/js/taskRules.js",
    "chrome/content/index.html",
    "locale/en-US/todolist.ftl",
    "locale/zh-CN/todolist.ftl",
)


def main() -> int:
    manifest_path = ROOT / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    version = manifest.get("version")
    if not isinstance(version, str) or not version.strip():
        raise ValueError("manifest.json must contain a non-empty version")

    update_feed = json.loads((ROOT / "update.json").read_text(encoding="utf-8"))
    addon_id = manifest.get("applications", {}).get("zotero", {}).get("id")
    update_url = manifest.get("applications", {}).get("zotero", {}).get("update_url")
    browser_zotero = manifest.get("browser_specific_settings", {}).get("zotero", {})
    if not addon_id or browser_zotero.get("id") != addon_id:
        raise ValueError("Zotero add-on IDs must match in both manifest sections")
    expected_update_url = "https://raw.githubusercontent.com/groele/Todolist-Zotero/zotero/update.json"
    if update_url != expected_update_url or browser_zotero.get("update_url") != expected_update_url:
        raise ValueError("Both manifest update URLs must point to the repository's zotero branch")
    update_entries = update_feed.get("addons", {}).get(addon_id, {}).get("updates", [])
    matching_update = next(
        (entry for entry in update_entries if entry.get("version") == version),
        None,
    )
    if not matching_update:
        raise ValueError("update.json must contain an entry matching manifest.json version")
    expected_update_link = (
        f"https://github.com/groele/Todolist-Zotero/releases/download/v{version}/"
        f"todolist-zotero-{version}.xpi"
    )
    if matching_update.get("update_link") != expected_update_link:
        raise ValueError("update.json update_link must match the versioned GitHub Release asset")
    update_app = matching_update.get("applications", {}).get("zotero", {})
    update_browser = matching_update.get("browser_specific_settings", {}).get("zotero", {})
    for key in ("strict_min_version", "strict_max_version"):
        expected = manifest.get("applications", {}).get("zotero", {}).get(key)
        if expected != browser_zotero.get(key):
            raise ValueError(f"Manifest Zotero compatibility fields do not match: {key}")
        if expected != update_app.get(key) or expected != update_browser.get(key):
            raise ValueError(f"update.json compatibility fields do not match manifest.json: {key}")

    for relative in REQUIRED_FILES:
        if not (ROOT / relative).is_file():
            raise FileNotFoundError(f"Required package file is missing: {relative}")

    files = [ROOT / relative for relative in PACKAGE_FILES]
    for directory in PACKAGE_ROOTS:
        files.extend(path for path in (ROOT / directory).rglob("*") if path.is_file())
    files = sorted(set(files), key=lambda path: path.relative_to(ROOT).as_posix())

    target = ROOT / f"todolist-zotero-{version}.xpi"
    temp_target = target.with_suffix(target.suffix + ".tmp")
    try:
        with zipfile.ZipFile(temp_target, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for path in files:
                archive.write(path, path.relative_to(ROOT).as_posix())
        with zipfile.ZipFile(temp_target, "r") as archive:
            bad_member = archive.testzip()
            if bad_member:
                raise zipfile.BadZipFile(f"Corrupt package member: {bad_member}")
            packaged_manifest = json.loads(archive.read("manifest.json"))
            if packaged_manifest.get("version") != version:
                raise ValueError("Packaged manifest version does not match source")
        temp_target.replace(target)
    finally:
        if temp_target.exists():
            temp_target.unlink()

    print(f"Built {target.name} ({target.stat().st_size} bytes, {len(files)} files)")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"XPI build failed: {error}", file=sys.stderr)
        raise SystemExit(1)
