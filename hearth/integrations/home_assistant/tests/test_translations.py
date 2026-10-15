"""Check the actual progress translation used by HA's waiting dialog."""

import json
import unittest
from pathlib import Path
from string import Formatter

COMPONENT = Path(__file__).resolve().parents[1] / "custom_components" / "hearth"


class PairingTranslationTests(unittest.TestCase):
    def test_progress_prompt_in_every_locale_contains_the_code_and_approval_steps(self):
        # HA progress dialogs use config.progress.<progress_action>, not the
        # description in config.step.<step_id>. The latter alone hides the code.
        for path in [
            COMPONENT / "strings.json",
            *sorted((COMPONENT / "translations").glob("*.json")),
        ]:
            with self.subTest(locale=path.name):
                prompt = json.loads(path.read_text())["config"]["progress"]["approve"]
                fields = {
                    field for _, field, _, _ in Formatter().parse(prompt) if field
                }
                self.assertEqual(fields, {"code"})
                rendered = prompt.format(code="ABCDEF")
                self.assertEqual(rendered.count("ABCDEF"), 1)
                for instruction in [
                    "More",
                    "Connections",
                    "Home Assistant",
                    "approve",
                    "five minutes",
                ]:
                    self.assertIn(instruction, rendered)

    def test_english_progress_prompt_matches_source_translation(self):
        source = json.loads((COMPONENT / "strings.json").read_text())
        english = json.loads((COMPONENT / "translations" / "en.json").read_text())
        self.assertEqual(source["config"]["progress"], english["config"]["progress"])
