import json
import tempfile
import unittest
from pathlib import Path

from opencraw import input_recipe, output_recipe, write_recipes


class WriteRecipesTest(unittest.TestCase):
    def test_writes_each_recipe_under_its_id_and_kind(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "recipes"
            files = write_recipes(
                target,
                [output_recipe("p", {}), input_recipe("a", "p", "web", ["u"], [])],
            )
            self.assertEqual(
                sorted(file.name for file in files), ["a.input.json", "p.output.json"]
            )
            self.assertEqual(
                json.loads((target / "a.input.json").read_text(encoding="utf-8"))[
                    "output"
                ],
                "p",
            )

    def test_rejects_a_recipe_without_kind_or_id(self) -> None:
        with tempfile.TemporaryDirectory() as folder, self.assertRaises(ValueError):
            write_recipes(folder, [{"id": "x"}])


if __name__ == "__main__":
    unittest.main()
