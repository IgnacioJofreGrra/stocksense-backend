// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Configuracion ESLint flat (v9+).
 *
 * Se compone en orden:
 * 1. ignores: archivos que ESLint no analiza (build output, config propio).
 * 2. eslint.configs.recommended: reglas core de JS.
 * 3. tseslint.configs.recommendedTypeChecked: reglas TS con type-checking
 *    activado (mas estrictas; requieren projectService o project en parser).
 * 4. eslintPluginPrettierRecommended: deja a Prettier mandar sobre formato.
 * 5. languageOptions: globals de Node y Jest, parser de TS apuntando al
 *    tsconfig via projectService (auto-detecta proyectos en monorepo).
 * 6. rules: ajustes finos para reducir ruido en este proyecto.
 */
export default tseslint.config(
  {
    ignores: ['dist', 'coverage', 'node_modules', 'eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
);
