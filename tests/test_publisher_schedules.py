import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from publisher_schedules import assess


class ScheduledPublisherTests(unittest.TestCase):
    now = datetime(2026, 11, 17, 18, tzinfo=timezone.utc)

    def run_record(self, hour, status="completed", conclusion="success"):
        return {"created_at": f"2026-11-17T{hour}:00:00Z", "status": status, "conclusion": conclusion}

    def test_workflow_state_and_stale_schedule(self):
        self.assertEqual(assess("disabled_inactivity", [], 3, self.now), "disabled_inactivity")
        self.assertEqual(assess("active", [], 3, self.now), "no scheduled runs")
        self.assertEqual(assess("active", [self.run_record("14")], 3, self.now), "overdue")

    def test_queued_run_does_not_hide_failure(self):
        runs = [self.run_record("17", "queued", None), self.run_record("16", conclusion="failure")]
        self.assertEqual(assess("active", runs, 3, self.now), "last completed run failure")
        runs[1]["conclusion"] = "success"
        self.assertEqual(assess("active", runs, 3, self.now), "healthy")
        self.assertEqual(assess("active", runs[:1], 3, self.now), "no recent completed run")
