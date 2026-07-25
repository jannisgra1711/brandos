import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/**
 * eslint-config-next 16 liefert native Flat-Configs – FlatCompat wird nicht
 * mehr benoetigt und ist mit den mitgelieferten Plugins auch nicht kompatibel.
 */
const eslintConfig = [
  { ignores: [".next/**", "node_modules/**", ".data/**", "next-env.d.ts"] },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];

export default eslintConfig;
