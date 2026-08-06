"""Import Day 1-30 TOEIC vocabulary from the source workbook into Supabase.

Only Python's standard library is used so this script does not require pip.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path


MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"x": MAIN_NS, "r": REL_NS, "pr": PKG_REL_NS}
DAY_PATTERN = re.compile(r"^Day\s+(\d+)$", re.IGNORECASE)
TITLE_PATTERN = re.compile(r"^DAY\s+\d+\.?\s*(.*)$", re.IGNORECASE)
CELL_PATTERN = re.compile(r"([A-Z]+)\d+")


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    return ["".join(node.itertext()) for node in root.findall("x:si", NS)]


def worksheet_paths(archive: zipfile.ZipFile) -> dict[str, str]:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    relations = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    targets = {
        relation.attrib["Id"]: relation.attrib["Target"]
        for relation in relations.findall("pr:Relationship", NS)
    }
    result: dict[str, str] = {}
    for sheet in workbook.findall("x:sheets/x:sheet", NS):
        name = sheet.attrib["name"]
        relation_id = sheet.attrib[f"{{{REL_NS}}}id"]
        target = targets[relation_id].lstrip("/")
        if not target.startswith("xl/"):
            target = f"xl/{target}"
        result[name] = target
    return result


def cell_value(cell: ET.Element, strings: list[str]) -> str:
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        inline = cell.find("x:is", NS)
        return "" if inline is None else "".join(inline.itertext()).strip()
    value_node = cell.find("x:v", NS)
    if value_node is None or value_node.text is None:
        return ""
    if cell_type == "s":
        return strings[int(value_node.text)].strip()
    return value_node.text.strip()


def parse_workbook(path: Path) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    with zipfile.ZipFile(path) as archive:
        strings = shared_strings(archive)
        sheets = worksheet_paths(archive)
        for sheet_name, sheet_path in sheets.items():
            match = DAY_PATTERN.match(sheet_name)
            if not match:
                continue
            day = int(match.group(1))
            if not 1 <= day <= 30:
                continue
            root = ET.fromstring(archive.read(sheet_path))
            values: dict[str, str] = {}
            for cell in root.findall(".//x:sheetData/x:row/x:c", NS):
                reference = cell.attrib.get("r", "")
                values[reference] = cell_value(cell, strings)

            title = values.get("A1", "")
            title_match = TITLE_PATTERN.match(title)
            topic = title_match.group(1).strip(" .") if title_match else title

            for row_number in range(2, 100):
                for number_col, word_col, meaning_col in (
                    ("F", "G", "H"),
                    ("O", "P", "Q"),
                ):
                    position_text = values.get(f"{number_col}{row_number}", "")
                    word = values.get(f"{word_col}{row_number}", "").strip()
                    meaning = values.get(f"{meaning_col}{row_number}", "").strip()
                    if not position_text or not word or not meaning:
                        continue
                    try:
                        position = int(float(position_text))
                    except ValueError as exc:
                        raise ValueError(
                            f"{sheet_name} {number_col}{row_number}: invalid position {position_text!r}"
                        ) from exc
                    rows.append(
                        {
                            "day": day,
                            "position": position,
                            "topic": topic,
                            "word": word,
                            "meaning": meaning,
                        }
                    )

    rows.sort(key=lambda item: (int(item["day"]), int(item["position"])))
    validate_rows(rows)
    return rows


def validate_rows(rows: list[dict[str, object]]) -> None:
    days = {int(row["day"]) for row in rows}
    if days != set(range(1, 31)):
        missing = sorted(set(range(1, 31)) - days)
        raise ValueError(f"Workbook is missing TOEIC days: {missing}")
    keys = [(row["day"], row["position"]) for row in rows]
    if len(keys) != len(set(keys)):
        raise ValueError("Workbook contains duplicate day/position pairs")


def upsert_rows(rows: list[dict[str, object]], url: str, key: str) -> None:
    ssl_context = ssl.create_default_context()
    # Python 3.13+ enables OpenSSL's strict X.509 extension checks by default.
    # Some valid corporate/proxy certificate chains omit Authority Key Identifier.
    # Keep CA and hostname verification enabled while allowing those legacy chains.
    if hasattr(ssl, "VERIFY_X509_STRICT"):
        ssl_context.verify_flags &= ~ssl.VERIFY_X509_STRICT

    endpoint = (
        f"{url.rstrip('/')}/rest/v1/toeic_vocabulary?"
        + urllib.parse.urlencode({"on_conflict": "day,position"})
    )
    for start in range(0, len(rows), 500):
        batch = rows[start : start + 500]
        request = urllib.request.Request(
            endpoint,
            data=json.dumps(batch, ensure_ascii=False).encode("utf-8"),
            method="POST",
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json; charset=utf-8",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
        )
        try:
            with urllib.request.urlopen(
                request,
                timeout=60,
                context=ssl_context,
            ) as response:
                if response.status not in (200, 201, 204):
                    raise RuntimeError(f"Unexpected Supabase response: {response.status}")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Supabase import failed ({exc.code}): {detail}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"Could not connect to Supabase: {exc.reason}") from exc
        print(f"Imported {min(start + len(batch), len(rows))}/{len(rows)} rows")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("workbook", type=Path, help="Path to Day1~30.xlsx")
    parser.add_argument("--env-file", type=Path, default=Path(".env.local"))
    parser.add_argument("--dry-run", action="store_true", help="Validate without writing to Supabase")
    args = parser.parse_args()

    rows = parse_workbook(args.workbook)
    counts = {day: sum(row["day"] == day for row in rows) for day in range(1, 31)}
    print(f"Validated {len(rows)} words across Day 1-30")
    print("Counts:", ", ".join(f"Day {day}={count}" for day, count in counts.items()))
    if args.dry_run:
        return 0

    load_env_file(args.env_file)
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required", file=sys.stderr)
        return 2
    upsert_rows(rows, url, key)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
