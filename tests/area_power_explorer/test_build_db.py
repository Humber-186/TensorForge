import sqlite3
import tempfile
import unittest
from pathlib import Path

from tensorforge_site_bundle.tools.area_power_explorer.build_db import build_database


BUNDLE_ROOT = Path('tensorforge_site_bundle').resolve()
AREA_POWER_CSV = BUNDLE_ROOT / 'data' / 'area_power_measurements.csv'


class BuildDatabaseTests(unittest.TestCase):
    def test_source_file_labels_are_public_relative_paths(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / 'area_power.db'

            build_database(db_path, source_paths=[AREA_POWER_CSV], source_root=BUNDLE_ROOT)

            with sqlite3.connect(db_path) as con:
                labels = {
                    row[0]
                    for row in con.execute('SELECT DISTINCT source_file FROM source_rows')
                }

        self.assertEqual(labels, {'data/area_power_measurements.csv'})
        for label in labels:
            self.assertNotIn('/work/', label)
            self.assertNotIn('/home/', label)
