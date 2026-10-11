import { z } from 'zod'

/** `choose-folder`'s answer: the folder the person picked in the operating system's dialog; absent when the dialog was closed without a choice. */
export const chooseFolderViewSchema = z.object({
  folder: z.string().min(1).optional(),
})

export type ChooseFolderView = z.infer<typeof chooseFolderViewSchema>
