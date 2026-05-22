from .database import get_connection


def init_db():
    """Create all tables if they don't exist, and migrate schema as needed."""
    conn = get_connection()
    cur = conn.cursor()

    cur.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            user_id   INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS reports (
            report_id            INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id              INTEGER REFERENCES users(user_id),
            upload_timestamp     TEXT    DEFAULT (datetime('now')),
            document_url         TEXT    NOT NULL,
            overall_health_score INTEGER DEFAULT 100,
            ai_summary           TEXT,
            recommendations      TEXT
        );

        CREATE TABLE IF NOT EXISTS biomarkers (
            marker_id       INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id       INTEGER NOT NULL REFERENCES reports(report_id) ON DELETE CASCADE,
            marker_name     TEXT    NOT NULL,
            extracted_value REAL,
            unit            TEXT,
            risk_category   TEXT    CHECK(risk_category IN ('Normal','Moderate','Critical'))
                            DEFAULT 'Normal',
            ai_explanation  TEXT
        );
    """)

    # Migration: add new columns to existing databases gracefully
    for col, definition in [
        ("ai_summary",      "TEXT"),
        ("recommendations", "TEXT"),
    ]:
        try:
            cur.execute(f"ALTER TABLE reports ADD COLUMN {col} {definition}")
        except Exception:
            pass  # Column already exists

    conn.commit()
    conn.close()
    print("Database initialized successfully")
