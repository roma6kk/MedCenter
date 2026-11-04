"""Aggregate TASK-006 finding files into one JSONL and print a compact table.

Usage: python3 -I verify-aggregate.py <findings-dir> [--full] [--unit U] [--min-sev S] [--ids a,b]
"""
import json
import os
import sys

SEV = {"critical": 0, "high": 1, "medium": 2, "low": 3}


def load(root):
    items, bad = [], []
    for unit in sorted(os.listdir(root)):
        udir = os.path.join(root, unit)
        if not os.path.isdir(udir):
            continue
        for name in sorted(os.listdir(udir)):
            if not name.endswith(".json"):
                continue
            path = os.path.join(udir, name)
            try:
                with open(path, encoding="utf-8") as fh:
                    obj = json.load(fh)
            except Exception as exc:
                bad.append((path, str(exc)))
                continue
            obj.setdefault("unit", unit)
            items.append(obj)
    return items, bad


def unit_status(root):
    rows = []
    for unit in sorted(os.listdir(root)):
        prog = os.path.join(root, unit, "verify-progress.md")
        if os.path.isfile(prog):
            with open(prog, encoding="utf-8") as fh:
                text = fh.read()
            rows.append((unit, "done" if "Status: done" in text else "in-progress"))
    return rows


def opt(args, name, default=None):
    return args[args.index(name) + 1] if name in args else default


def main():
    args = sys.argv[1:]
    root = args[0]
    full = "--full" in args
    unit = opt(args, "--unit")
    min_sev = opt(args, "--min-sev", "low")
    ids = set(filter(None, (opt(args, "--ids", "") or "").split(",")))
    items, bad = load(root)
    for u, st in unit_status(root):
        print(f"# {u:24} {st:12} {sum(1 for i in items if i.get('unit') == u)}")
    if bad:
        print("BAD FILES:", bad)
    sel = [i for i in items
           if (unit is None or i.get("unit") == unit)
           and SEV.get(i.get("severity"), 3) <= SEV[min_sev]
           and (not ids or i.get("id") in ids)]
    sel.sort(key=lambda i: (SEV.get(i.get("severity"), 3), i.get("unit", ""), i.get("id", "")))
    out = os.path.join(root, "verify-all-findings.jsonl")
    with open(out, "w", encoding="utf-8") as fh:
        for i in sorted(items, key=lambda i: (i.get("unit", ""), i.get("id", ""))):
            fh.write(json.dumps(i, ensure_ascii=False) + "\n")
    print(f"total={len(items)} selected={len(sel)}")
    for i in sel:
        flag = "Q" if i.get("needsDecision") else " "
        print(f"{i.get('severity', '?')[:4]:4} {flag} {i.get('kind', '?')[:8]:8} {i.get('id', '?')}: {i.get('title', '')}")
        if full:
            print("    files:", ", ".join(i.get("files", [])[:5]))
            print("    desc:", (i.get("description", "") or "")[:700])
            print("    evid:", (i.get("evidence", "") or "")[:500])
            print("    fix:", (i.get("proposedFix", "") or "")[:500])
            if i.get("needsDecision"):
                print("    Q:", (i.get("decisionQuestion", "") or "")[:600])


if __name__ == "__main__":
    main()
