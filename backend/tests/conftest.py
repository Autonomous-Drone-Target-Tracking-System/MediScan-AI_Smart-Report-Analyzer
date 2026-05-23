"""
conftest.py — pytest configuration for MediScan AI backend tests.

Sets the working directory and sys.path so that all service imports
resolve correctly regardless of where pytest is invoked from.
"""
import os
import sys

# Ensure the backend directory is on sys.path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
