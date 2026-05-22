import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "medical.db")


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn
