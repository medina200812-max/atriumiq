from pathlib import Path
import sys

from main import SessionLocal, import_result_json, seed_if_empty


def main():
    db = SessionLocal()
    try:
        if len(sys.argv) > 1:
            imported = import_result_json(db, Path(sys.argv[1]))
            print(f"Imported {imported} readings from {sys.argv[1]}")
        else:
            seed_if_empty(db)
            print("Seed completed.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
