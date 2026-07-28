import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Three lint surfaces, three configs:
 *
 * - `src/` is TypeScript and gets the full type-aware ruleset. The rules that
 *   earn their keep here are the async ones (no-floating-promises,
 *   no-misused-promises: the loaders are async file IO where a dropped await
 *   fails silently) and exhaustive-deps (App.tsx leans hard on useCallback,
 *   and stale closures pass both tsc and vitest).
 * - `electron/` is plain CommonJS/ESM Node scripts; type-aware rules can't run
 *   there (no tsconfig coverage), so it gets the untyped recommended set.
 * - Root configs (vite/vitest/this file) likewise lint untyped.
 *
 * Prettier config goes last to switch off anything that fights the formatter.
 */
export default tseslint.config(
  {
    ignores: ['dist/', 'release/', 'build/', 'node_modules/', 'public/'],
  },

  // --- src/: type-aware TypeScript + React hooks ---
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat['recommended-latest'],
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser },
    },
    rules: {
      // Stale-closure bugs survive tsc and unit tests; make this a hard stop.
      'react-hooks/exhaustive-deps': 'error',
      // The v7 plugin ships the React Compiler diagnostics. Several flag
      // patterns this codebase uses deliberately with documented reasoning
      // (render-safe ref reads, effect-driven pending-file state). Keep them
      // visible as warnings; only the two classic rules gate CI.
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/set-state-in-render': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      // Underscore prefix marks intentionally-unused (callback params, tuple
      // holes). This rule also covers what tsc's noUnusedLocals would, so that
      // flag stays off in tsconfig (typescript-eslint recommends not doubling up).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // Advisory while the YAML ingest boundary still speaks `any`; the Zod
      // schemas at the importers are the real fix, not 195 hand-typed casts.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Loaders and tools are async-heavy; a dropped promise is a silent bug.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      // The codebase legitimately narrows unknown YAML at boundaries; keep the
      // unsafe-* family advisory rather than blocking until Zod lands at every
      // ingest site.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      // `while (true)` render/scan loops are idiomatic in the canvas code.
      'no-constant-condition': ['error', { checkLoops: false }],
    },
  },

  // --- src/ tests: same rules, minus the ones that fight test idioms ---
  {
    files: ['src/**/__tests__/**/*.{ts,tsx}', 'src/test-utils/**/*.{ts,tsx}'],
    rules: {
      // expect(fn).toThrow() style assertions trip these constantly.
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Mock providers stub async interfaces with sync bodies; that's the
      // idiom, not a bug.
      '@typescript-eslint/require-await': 'off',
    },
  },

  // --- electron/ scripts: plain Node JS, no type info ---
  {
    files: ['electron/**/*.{cjs,mjs}', '*.{js,mjs}'],
    extends: [eslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // --- root TS configs (vite/vitest): TS parser, but untyped rules only ---
  {
    files: ['*.ts'],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  prettier,
);
