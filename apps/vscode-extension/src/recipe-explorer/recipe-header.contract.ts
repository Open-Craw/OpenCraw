/** What the recipes view needs to know about a recipe file: who it is and, for an input, which output it feeds. */
export interface RecipeHeader {
  /** The file's absolute path. */
  file:    string
  kind:    'input' | 'output'
  id:      string
  /** An input recipe's output id: the output recipe it maps its records onto. */
  output?: string
}

/** An output recipe and the input recipes that feed it: one group of the recipes view. */
export interface RecipeGroup {
  /** The output id the inputs name. */
  outputId:    string
  /** The output recipe's file, when the workspace holds it; an input may name an output that is not there. */
  outputFile?: string
  inputs:      RecipeHeader[]
}
