import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from audit_publication import review_posts


class PublicCoverageTests(unittest.TestCase):
    def test_literal_null_with_source_credit_is_not_a_news_story(self):
        posts = review_posts([
            ("null", "/placeholder", '<p>null</p><p><em>Source: <a href="/feed">Original Article</a></em></p>'),
            ("Road update", "/empty-body", "<p>Null.</p>"),
            ("Court declares vote null", "/article", "The court declared the November vote null."),
        ])
        self.assertIn("placeholder title or body", posts[0]["exclusions"])
        self.assertIn("placeholder title or body", posts[1]["exclusions"])
        self.assertEqual(posts[2]["exclusions"], [])

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

    def test_overlapping_forecasts_get_editorial_review(self):
        posts = review_posts([
            ("Rain overnight", "/early", "The National Weather Service in Jackson expects widespread rain tonight into Wednesday. Higher rainfall totals are more likely along and east of Interstate 55."),
            ("Wednesday forecast", "/later", "The National Weather Service in Jackson expects widespread rain tonight through Wednesday, with higher rainfall totals more likely along and east of Interstate 55."),
            ("Flood warning", "/distinct", "Flooding closed Oak Street and the county bridge Monday. The sheriff opened an emergency shelter at the high school."),
        ])
        self.assertIn("check for overlapping coverage with another brief", posts[1]["editorial_review"])
        self.assertEqual(posts[1]["exclusions"], [])
        self.assertEqual(posts[2]["editorial_review"], ["under 45 words"])
