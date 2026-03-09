import argparse
import json
import sys
from pathlib import Path

NO_TABLES_MESSAGE = (
    "No tables detected in this PDF. If this is a scanned or image-based PDF, try OCR first."
)


def emit(payload):
    print(json.dumps(payload), flush=True)


def has_meaningful_content(table):
    dataframe = getattr(table, "df", None)
    if dataframe is None or dataframe.empty:
        return False

    for row in dataframe.values.tolist():
        for cell in row:
            if str(cell).strip():
                return True

    return False


try:
    import camelot
except Exception as error:
    emit(
        {
            "ok": False,
            "code": "MISSING_DEPENDENCY",
            "message": f"Failed to import camelot: {error}",
        }
    )
    sys.exit(3)


def read_tables(input_path, flavor=None):
    kwargs = {"pages": "all"}
    if flavor:
        kwargs["flavor"] = flavor

    tables = camelot.read_pdf(str(input_path), **kwargs)
    valid_count = sum(1 for table in tables if has_meaningful_content(table))
    return tables, valid_count


def main():
    parser = argparse.ArgumentParser(description="Convert PDF tables to Excel using Camelot.")
    parser.add_argument("input_pdf", help="Path to the input PDF file")
    parser.add_argument("output_excel", help="Path to the output XLSX file")
    args = parser.parse_args()

    input_path = Path(args.input_pdf)
    output_path = Path(args.output_excel)

    if not input_path.exists():
        emit(
            {
                "ok": False,
                "code": "INPUT_NOT_FOUND",
                "message": f"Input PDF not found: {input_path}",
            }
        )
        return 4

    output_path.parent.mkdir(parents=True, exist_ok=True)

    attempts = [None, "stream"]
    last_error = None

    for flavor in attempts:
        try:
            tables, valid_count = read_tables(input_path, flavor)
        except Exception as error:
            last_error = str(error)
            continue

        if len(tables) > 0 and valid_count > 0:
            try:
                tables.export(str(output_path), f="excel")
            except Exception as error:
                emit(
                    {
                        "ok": False,
                        "code": "EXPORT_FAILED",
                        "message": f"Failed to export Excel file: {error}",
                    }
                )
                return 5

            emit(
                {
                    "ok": True,
                    "code": "SUCCESS",
                    "message": "Tables extracted successfully",
                    "tableCount": len(tables),
                    "validTableCount": valid_count,
                    "flavor": flavor or "lattice",
                    "outputPath": str(output_path),
                }
            )
            return 0

    emit(
        {
            "ok": False,
            "code": "NO_TABLES",
            "message": NO_TABLES_MESSAGE,
            "details": last_error,
        }
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
