from pathlib import Path

root = Path(__file__).resolve().parents[1]
source_path = root / "scripts" / "apply_safe_app_polish.py"
source = source_path.read_text(encoding="utf-8")
marker = "\n# Keep CI on the runtime GitHub Actions now uses"

if marker not in source:
    raise RuntimeError("Could not find safe-polish workflow marker")

safe_prefix = source.split(marker, 1)[0]
exec(
    compile(safe_prefix, str(source_path), "exec"),
    {
        "__file__": str(source_path),
        "__name__": "__main__",
    },
)

print("safe app polish v2 applied without workflow edits")
