/**
 * Reference palettes, for comparison only.
 *
 * Fetched verbatim from @radix-ui/colors and tailwindcss so the comparison is
 * against what those systems actually ship, not what anyone remembers them
 * shipping. Nothing in the library consumes this file: it exists so the
 * generated scale can be judged against the best work in the field.
 *
 * Radix Colors and Tailwind CSS are both MIT licensed.
 */

export const REFERENCE = {
  "radix": {
    "blue": {
      "light": [
        "#fbfdff",
        "#f4faff",
        "#e6f4fe",
        "#d5efff",
        "#c2e5ff",
        "#acd8fc",
        "#8ec8f6",
        "#5eb1ef",
        "#0090ff",
        "#0588f0",
        "#0d74ce",
        "#113264"
      ],
      "dark": [
        "#0d1520",
        "#111927",
        "#0d2847",
        "#003362",
        "#004074",
        "#104d87",
        "#205d9e",
        "#2870bd",
        "#0090ff",
        "#3b9eff",
        "#70b8ff",
        "#c2e6ff"
      ]
    },
    "amber": {
      "light": [
        "#fefdfb",
        "#fefbe9",
        "#fff7c2",
        "#ffee9c",
        "#fbe577",
        "#f3d673",
        "#e9c162",
        "#e2a336",
        "#ffc53d",
        "#ffba18",
        "#ab6400",
        "#4f3422"
      ],
      "dark": [
        "#16120c",
        "#1d180f",
        "#302008",
        "#3f2700",
        "#4d3000",
        "#5c3d05",
        "#714f19",
        "#8f6424",
        "#ffc53d",
        "#ffd60a",
        "#ffca16",
        "#ffe7b3"
      ]
    },
    "green": {
      "light": [
        "#fbfefc",
        "#f4fbf6",
        "#e6f6eb",
        "#d6f1df",
        "#c4e8d1",
        "#adddc0",
        "#8eceaa",
        "#5bb98b",
        "#30a46c",
        "#2b9a66",
        "#218358",
        "#193b2d"
      ],
      "dark": [
        "#0e1512",
        "#121b17",
        "#132d21",
        "#113b29",
        "#174933",
        "#20573e",
        "#28684a",
        "#2f7c57",
        "#30a46c",
        "#33b074",
        "#3dd68c",
        "#b1f1cb"
      ]
    }
  },
  "tailwind": {
    "blue": [
      "oklch(97% 0.014 254.604)",
      "oklch(93.2% 0.032 255.585)",
      "oklch(88.2% 0.059 254.128)",
      "oklch(80.9% 0.105 251.813)",
      "oklch(70.7% 0.165 254.624)",
      "oklch(62.3% 0.214 259.815)",
      "oklch(54.6% 0.245 262.881)",
      "oklch(48.8% 0.243 264.376)",
      "oklch(42.4% 0.199 265.638)",
      "oklch(37.9% 0.146 265.522)",
      "oklch(28.2% 0.091 267.935)"
    ],
    "amber": [
      "oklch(98.7% 0.022 95.277)",
      "oklch(96.2% 0.059 95.617)",
      "oklch(92.4% 0.12 95.746)",
      "oklch(87.9% 0.169 91.605)",
      "oklch(82.8% 0.189 84.429)",
      "oklch(76.9% 0.188 70.08)",
      "oklch(66.6% 0.179 58.318)",
      "oklch(55.5% 0.163 48.998)",
      "oklch(47.3% 0.137 46.201)",
      "oklch(41.4% 0.112 45.904)",
      "oklch(27.9% 0.077 45.635)"
    ],
    "green": [
      "oklch(98.2% 0.018 155.826)",
      "oklch(96.2% 0.044 156.743)",
      "oklch(92.5% 0.084 155.995)",
      "oklch(87.1% 0.15 154.449)",
      "oklch(79.2% 0.209 151.711)",
      "oklch(72.3% 0.219 149.579)",
      "oklch(62.7% 0.194 149.214)",
      "oklch(52.7% 0.154 150.069)",
      "oklch(44.8% 0.119 151.328)",
      "oklch(39.3% 0.095 152.535)",
      "oklch(26.6% 0.065 152.934)"
    ]
  }
} as const

export type ReferenceHue = keyof typeof REFERENCE.tailwind
