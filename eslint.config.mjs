import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

/** eslint-config-next 16 ships native flat config, so no FlatCompat shim. */
const eslintConfig = [
  { ignores: ['.next/**', 'node_modules/**', 'public/**', 'tools/**', 'coverage/**', 'next-env.d.ts', '.agents/**', '.claude/**'] },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // A leading underscore is the signal that an argument exists to satisfy a
      // signature and is deliberately unused.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
];

export default eslintConfig;
