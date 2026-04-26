from __future__ import annotations

import re
from pathlib import Path


def parse_markdown_table(md: str) -> tuple[list[str], list[list[str]]]:
    lines = [ln.rstrip("\n") for ln in md.splitlines() if ln.strip()]
    table_lines = [ln for ln in lines if ln.lstrip().startswith("|")]
    if len(table_lines) < 3:
        raise ValueError("No markdown table with data rows found.")

    header_row = [c.strip() for c in table_lines[0].strip().strip("|").split("|")]
    sep = table_lines[1].strip()
    if re.fullmatch(r"\|\s*-+\s*(\|\s*-+\s*)+\|", sep) is None:
        raise ValueError("Markdown table separator row not found.")

    rows: list[list[str]] = []
    for ln in table_lines[2:]:
        cols = [c.strip() for c in ln.strip().strip("|").split("|")]
        if len(cols) != len(header_row):
            raise ValueError(f"Inconsistent column count in row: {ln}")
        rows.append(cols)

    return header_row, rows


def format_markdown_table(header: list[str], rows: list[list[str]]) -> str:
    out = []
    out.append("| " + " | ".join(header) + " |")
    out.append("|" + "|".join(["---"] * len(header)) + "|")
    for r in rows:
        out.append("| " + " | ".join(r) + " |")
    out.append("")
    return "\n".join(out)


def renumber(rows: list[list[str]], id_col_idx: int, prefix: str) -> list[list[str]]:
    out: list[list[str]] = []
    for i, row in enumerate(rows, start=1):
        new = row.copy()
        new[id_col_idx] = f"{prefix}{i:02d}"
        out.append(new)
    return out


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    src = root / "docs" / "unit-test-cases.md"
    md = src.read_text(encoding="utf-8")
    header, rows = parse_markdown_table(md)

    id_idx = 0

    # Classification: keep it explicit and stable by KN-UT ids.
    # Non-functional: logging/observability, caching/perf, timing, retry/reliability behaviors.
    nonfunctional_ids = {
        "KN-UT-14",  # logs completion status
        "KN-UT-21",  # caches logo after first read
        "KN-UT-27",  # logs PG pool error events
        "KN-UT-53",  # pause returns immediately
        "KN-UT-54",  # pause waits
        "KN-UT-55",  # fetchWithRetry retries
    }

    functional_rows: list[list[str]] = []
    nonfunctional_rows: list[list[str]] = []

    for r in rows:
        orig_id = r[id_idx].strip()
        if orig_id in nonfunctional_ids:
            nonfunctional_rows.append(r)
        else:
            functional_rows.append(r)

    functional_rows = renumber(functional_rows, id_idx, "KN-F-UT-")
    nonfunctional_rows = renumber(nonfunctional_rows, id_idx, "KN-NF-UT-")

    # Update header first column label to match the new prefixes.
    new_header = header.copy()
    new_header[0] = "Test Case Scenario ID"

    (root / "docs" / "unit-test-cases-functional.md").write_text(
        format_markdown_table(new_header, functional_rows), encoding="utf-8"
    )
    (root / "docs" / "unit-test-cases-nonfunctional.md").write_text(
        format_markdown_table(new_header, nonfunctional_rows), encoding="utf-8"
    )

    print(f"Functional rows: {len(functional_rows)}")
    print(f"Non-functional rows: {len(nonfunctional_rows)}")


if __name__ == "__main__":
    main()

