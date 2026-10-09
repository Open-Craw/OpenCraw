import unittest

from opencraw import input_recipe, output_recipe, step


class BuildRecipeTest(unittest.TestCase):
    def test_step_is_a_dict_with_its_type(self) -> None:
        self.assertEqual(
            step("goto", url="{{start.url}}"), {"type": "goto", "url": "{{start.url}}"}
        )

    def test_input_recipe_turns_a_string_start_into_a_url_point(self) -> None:
        recipe = input_recipe(
            "a",
            "p",
            "web",
            ["https://a.example", {"url": "https://b.example"}],
            [step("emit")],
        )
        self.assertEqual(
            recipe["start"],
            [{"url": "https://a.example"}, {"url": "https://b.example"}],
        )
        self.assertEqual(recipe["kind"], "input")
        self.assertEqual(recipe["mapping"], {})

    def test_extra_keys_pass_through_untouched(self) -> None:
        recipe = input_recipe(
            "a", "p", "web", ["u"], [], vars={"user": "demo"}, limits={"concurrency": 2}
        )
        self.assertEqual(recipe["vars"], {"user": "demo"})
        self.assertEqual(recipe["limits"], {"concurrency": 2})

    def test_output_recipe_defaults_to_version_one(self) -> None:
        self.assertEqual(output_recipe("p", {"url": {"type": "url"}})["version"], 1)


if __name__ == "__main__":
    unittest.main()
