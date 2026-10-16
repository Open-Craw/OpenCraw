import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react'

/**
 * The studio's theme, from the logo: its violet (#6f2fda) is the `brand` palette, which the `colorPalette`
 * of buttons, tabs and selections resolves to; its red-orange dot (#ff2e14) is the `accent`; the greys are
 * tinted toward the dark icon's #1f1b26 and the light icon's #e1dde7, so dark and light mode look like one brand.
 */
const config = defineConfig({
  theme: {
    tokens: {
      colors: {
        brand: {
          50:  { value: '#f5f0ff' },
          100: { value: '#ebe0ff' },
          200: { value: '#d9c4ff' },
          300: { value: '#c0a0fb' },
          400: { value: '#a574f3' },
          500: { value: '#8a4ee8' },
          600: { value: '#6f2fda' },
          700: { value: '#5c24b8' },
          800: { value: '#4a1d93' },
          900: { value: '#39166f' },
          950: { value: '#240d4a' },
        },
        accent: {
          500: { value: '#ff2e14' },
          600: { value: '#e02610' },
        },
      },
    },
    semanticTokens: {
      colors: {
        brand: {
          contrast:   { value: { _light: 'white', _dark: 'white' } },
          fg:         { value: { _light: '{colors.brand.700}', _dark: '{colors.brand.300}' } },
          subtle:     { value: { _light: '{colors.brand.50}', _dark: '{colors.brand.950}' } },
          muted:      { value: { _light: '{colors.brand.100}', _dark: '{colors.brand.900}' } },
          emphasized: { value: { _light: '{colors.brand.200}', _dark: '{colors.brand.800}' } },
          solid:      { value: { _light: '{colors.brand.600}', _dark: '{colors.brand.500}' } },
          focusRing:  { value: { _light: '{colors.brand.500}', _dark: '{colors.brand.400}' } },
          border:     { value: { _light: '{colors.brand.500}', _dark: '{colors.brand.400}' } },
        },
        bg: {
          DEFAULT:    { value: { _light: 'white', _dark: '#1f1b26' } },
          subtle:     { value: { _light: '#f7f5fa', _dark: '#26212e' } },
          muted:      { value: { _light: '#efecf4', _dark: '#2e2838' } },
          emphasized: { value: { _light: '#e1dde7', _dark: '#3a3347' } },
          panel:      { value: { _light: 'white', _dark: '#26212e' } },
        },
        border: {
          DEFAULT:    { value: { _light: '#e1dde7', _dark: '#3a3347' } },
          muted:      { value: { _light: '#ece9f1', _dark: '#2e2838' } },
          emphasized: { value: { _light: '#cfc9d8', _dark: '#4b4259' } },
        },
      },
    },
  },
})

export const studioSystem = createSystem(defaultConfig, config)
