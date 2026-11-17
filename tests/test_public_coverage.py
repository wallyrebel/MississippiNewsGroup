import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from audit_publication import review_posts


class PublicCoverageTests(unittest.TestCase):
    def test_duplicate_body_title_only_and_short_service_notice(self):
        posts = review_posts([
            ("Road closure", "/original", "<p>Oak Street closes at noon for water repairs.</p>"),
            ("Work on Oak Street", "/copy", "<p>Oak Street closes at noon for water repairs!</p>"),
            ("Wind advisory", "/title-only", "Wind advisory."),
            ("Weather update", "/weather", "Wind is expected across the forecast area."),
        ])
        self.assertEqual(posts[0]["exclusions"], [])
        self.assertEqual(posts[0]["editorial_review"], ["under 45 words"])
        self.assertIn("repeated article text", posts[1]["exclusions"])
        self.assertIn("body repeats headline", posts[2]["exclusions"])
        self.assertEqual(posts[3]["exclusions"], [])
        self.assertEqual(len(posts[3]["editorial_review"]), 2)
