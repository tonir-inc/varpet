"""Compatibility entry point for the current fixed-cohort release report."""
import runpy
from pathlib import Path
runpy.run_path(str(Path(__file__).with_name('fast-promotion-report.py')),run_name='__main__')
