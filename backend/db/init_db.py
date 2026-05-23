from .database import get_connection


def init_db():
    """Create all tables if they don't exist, and migrate schema as needed."""
    conn = get_connection()
    cur = conn.cursor()

    # Create upgraded tables
    cur.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            user_id           INTEGER PRIMARY KEY AUTOINCREMENT,
            email             TEXT UNIQUE,
            password_hash     TEXT,
            role              TEXT CHECK(role IN ('patient','doctor','admin')) DEFAULT 'patient',
            consent_given     INTEGER DEFAULT 0,
            consent_timestamp TEXT,
            refresh_token     TEXT,
            is_guest          INTEGER DEFAULT 0,
            expires_at        TEXT,
            created_at        TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS reports (
            report_id            INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id              INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
            upload_timestamp     TEXT    DEFAULT (datetime('now')),
            document_url         TEXT    NOT NULL,
            overall_health_score INTEGER DEFAULT 100,
            ai_summary           TEXT,
            recommendations      TEXT,
            is_radiology         INTEGER DEFAULT 0,
            is_cardiac           INTEGER DEFAULT 0,
            is_dicom             INTEGER DEFAULT 0,
            report_type          TEXT,
            heart_rate           INTEGER
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

        CREATE TABLE IF NOT EXISTS radiology_findings (
            finding_id           INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id            INTEGER NOT NULL REFERENCES reports(report_id) ON DELETE CASCADE,
            anatomical_structure TEXT,
            finding              TEXT,
            abnormality_type     TEXT,
            severity             TEXT CHECK(severity IN ('Normal','Mild','Moderate','Critical')) DEFAULT 'Normal',
            confidence_score     REAL,
            is_uncertain         INTEGER DEFAULT 0,
            umls_cui             TEXT
        );

        CREATE TABLE IF NOT EXISTS cardiac_findings (
            finding_id           INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id            INTEGER NOT NULL REFERENCES reports(report_id) ON DELETE CASCADE,
            parameter_name       TEXT NOT NULL,
            extracted_value      TEXT NOT NULL,
            abnormality_type     TEXT NOT NULL,
            severity             TEXT CHECK(severity IN ('Normal','Mild','Moderate','Critical','Emergency')) DEFAULT 'Normal',
            confidence_score     REAL,
            umls_cui             TEXT,
            is_emergency         INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
            log_id      INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp   TEXT DEFAULT (datetime('now')),
            user_id     INTEGER,
            ip_address  TEXT,
            action      TEXT NOT NULL,
            resource_id TEXT,
            status      TEXT CHECK(status IN ('SUCCESS','UNAUTHORIZED','FAILED')) DEFAULT 'SUCCESS',
            details     TEXT
        );

        CREATE TABLE IF NOT EXISTS enterprise_centers (
            center_id   INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            address     TEXT NOT NULL,
            is_active   INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS patient_profiles (
            profile_id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id             INTEGER UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
            allergies           TEXT,
            metal_implants      INTEGER DEFAULT 0,
            contraindications   TEXT
        );

        CREATE TABLE IF NOT EXISTS enterprise_appointments (
            appointment_id      INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id             INTEGER REFERENCES users(user_id),
            center_id           INTEGER REFERENCES enterprise_centers(center_id),
            scan_modality       TEXT,
            appointment_time    TEXT,
            status              TEXT CHECK(status IN ('BOOKED','COMPLETED','CANCELLED','NO_SHOW')) DEFAULT 'BOOKED',
            prep_guidelines     TEXT,
            safety_cleared      INTEGER DEFAULT 0,
            ris_reservation_id  TEXT,
            is_billed           INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS referral_documents (
            referral_id         INTEGER PRIMARY KEY AUTOINCREMENT,
            appointment_id      INTEGER REFERENCES enterprise_appointments(appointment_id) ON DELETE CASCADE,
            user_id             INTEGER REFERENCES users(user_id),
            document_url        TEXT NOT NULL,
            upload_timestamp    TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_reports_user_id ON reports(user_id);
        CREATE INDEX IF NOT EXISTS idx_biomarkers_report_id ON biomarkers(report_id);
        CREATE INDEX IF NOT EXISTS idx_biomarkers_marker_name ON biomarkers(marker_name);
        CREATE INDEX IF NOT EXISTS idx_radiology_report_id ON radiology_findings(report_id);
        CREATE INDEX IF NOT EXISTS idx_cardiac_report_id ON cardiac_findings(report_id);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
    """)

    # Graceful incremental migrations for older DB schemas
    migrations = [
        ("users", "email",             "TEXT UNIQUE"),
        ("users", "password_hash",     "TEXT"),
        ("users", "role",              "TEXT CHECK(role IN ('patient','doctor','admin')) DEFAULT 'patient'"),
        ("users", "consent_given",     "INTEGER DEFAULT 0"),
        ("users", "consent_timestamp", "TEXT"),
        ("users", "refresh_token",     "TEXT"),
        ("users", "is_guest",          "INTEGER DEFAULT 0"),
        ("users", "expires_at",        "TEXT"),
        ("reports", "ai_summary",      "TEXT"),
        ("reports", "recommendations", "TEXT"),
        ("reports", "is_radiology",     "INTEGER DEFAULT 0"),
        ("reports", "is_cardiac",       "INTEGER DEFAULT 0"),
        ("reports", "is_dicom",         "INTEGER DEFAULT 0"),
        ("reports", "report_type",     "TEXT"),
        ("reports", "heart_rate",      "INTEGER"),
    ]

    for table, col, definition in migrations:
        try:
            cur.execute(f"ALTER TABLE {table} ADD COLUMN {col} {definition}")
        except Exception:
            pass  # Column already exists

    conn.commit()
    conn.close()
    print("Database initialized successfully with secure HIPAA, Radiology, Cardiac & DICOM schema extensions.")
