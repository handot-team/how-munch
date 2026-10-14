import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettierConfig from 'eslint-config-prettier';
import checkFile from 'eslint-plugin-check-file';
import fsdPlugin from 'eslint-plugin-fsd-lint';
import unusedImports from 'eslint-plugin-unused-imports';

/** Custom FSD layers: app → pages → modules → features → entities → commons */
const fsdLayers = {
  app: {
    pattern: 'app',
    priority: 1,
    allowedToImport: ['pages', 'modules', 'features', 'entities', 'commons'],
  },
  pages: {
    pattern: 'pages',
    priority: 2,
    allowedToImport: ['modules', 'features', 'entities', 'commons'],
  },
  modules: {
    pattern: 'modules',
    priority: 3,
    allowedToImport: ['features', 'entities', 'commons'],
  },
  features: {
    pattern: 'features',
    priority: 4,
    allowedToImport: ['entities', 'commons'],
  },
  entities: {
    pattern: 'entities',
    priority: 5,
    allowedToImport: ['entities', 'commons'],
  },
  commons: {
    pattern: 'commons',
    priority: 6,
    allowedToImport: [],
  },
};

const fsdAlias = { value: '@', withSlash: true };
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const entitiesRootPath = path.join(__dirname, 'src', 'entities');
const entitySlices = fs.existsSync(entitiesRootPath)
  ? fs
      .readdirSync(entitiesRootPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
  : [];

const entityXImportRestrictionConfigs = entitySlices.map((sliceName) => ({
  files: [`src/entities/${sliceName}/**/*`],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            regex: '^@/entities/[^/]+(?:/index(?:\\.[^/]+)?)?$',
            message:
              'entities 내부에서는 다른 슬라이스의 일반 Public API import를 금지합니다. @x 경로를 사용하세요.',
          },
          {
            group: ['@/entities/*/@x/*', `!@/entities/*/@x/${sliceName}`],
            message: `${sliceName} 슬라이스는 @x 경로 중 자신의 consumer 파일(@x/${sliceName})만 사용할 수 있습니다.`,
          },
        ],
      },
    ],
  },
}));

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // Prettier — eslint-config-prettier로 충돌 룰만 비활성화
  // prettier 자체는 lint-staged에서 별도 실행
  prettierConfig,

  // Unused imports
  {
    plugins: { 'unused-imports': unusedImports },
    rules: {
      'unused-imports/no-unused-imports': 'warn',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
    },
  },

  // FSD Architecture
  {
    plugins: { fsd: fsdPlugin },
    rules: {
      'fsd/forbidden-imports': ['error', { alias: fsdAlias, layers: fsdLayers }],
      'fsd/no-relative-imports': ['error', { allowSameSlice: true, allowTypeImports: false }],
      'fsd/no-public-api-sidestep': [
        'error',
        {
          alias: fsdAlias,
          layers: ['pages', 'features', 'entities', 'modules'],
        },
      ],
      'fsd/no-cross-slice-dependency': 'error',
      'fsd/no-ui-in-business-logic': 'error',
      'fsd/no-global-store-imports': 'error',
    },
  },

  // Commons layer — 내부 슬라이스 간 상대경로 import 허용
  {
    files: ['src/commons/**/*'],
    rules: {
      'fsd/no-relative-imports': 'off',
    },
  },

  // Entities layer — @x 기반 cross-import 허용
  {
    files: ['src/entities/**/*'],
    rules: {
      'fsd/forbidden-imports': 'off',
      'fsd/no-cross-slice-dependency': 'off',
      'fsd/no-public-api-sidestep': [
        'error',
        {
          alias: fsdAlias,
          layers: ['entities'],
          ignoreImportPatterns: ['^@/entities/[^/]+/@x/[^/]+$'],
        },
      ],
    },
  },

  // Custom rules
  {
    rules: {
      // TypeScript
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],

      // React
      'react/self-closing-comp': 'warn',
      'react/jsx-curly-brace-presence': ['warn', { props: 'never', children: 'never' }],
      'react/jsx-boolean-value': ['warn', 'never'],
      'react/jsx-no-useless-fragment': ['warn', { allowExpressions: true }],

      // General
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'warn',
      'no-nested-ternary': 'warn',
      eqeqeq: ['warn', 'always'],

      // Import ordering — FSD 레이어 순서 + 그룹 간 newline 강제
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          pathGroups: [
            { pattern: 'react', group: 'external', position: 'before' },
            { pattern: 'react-dom/**', group: 'external', position: 'before' },
            { pattern: 'next', group: 'external', position: 'before' },
            { pattern: 'next/**', group: 'external', position: 'before' },
            { pattern: '@/commons/**', group: 'internal', position: 'after' },
            { pattern: '@/entities/**', group: 'internal', position: 'after' },
            { pattern: '@/features/**', group: 'internal', position: 'after' },
            { pattern: '@/modules/**', group: 'internal', position: 'after' },
            { pattern: '@/pages/**', group: 'internal', position: 'after' },
          ],
          pathGroupsExcludedImportTypes: ['react', 'next'],
          'newlines-between': 'always',
          alphabetize: { order: 'ignore' },
        },
      ],
      'import/no-duplicates': 'warn',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/entities/*/@x',
                '@/entities/*/@x/index',
                '@/entities/*/@x/index.*',
                '@/entities/*/@x/*',
              ],
              message:
                '@x 경로는 entities 간 교차 의존 전용입니다. 엔티티 외 레이어에서는 사용할 수 없습니다.',
            },
          ],
        },
      ],
    },
  },

  // Filename & folder naming convention
  {
    plugins: { 'check-file': checkFile },
    files: ['src/**/*'],
    rules: {
      'check-file/filename-naming-convention': [
        'error',
        {
          '**/*.tsx': 'PASCAL_CASE',
          '**/*.ts': 'CAMEL_CASE',
        },
        { ignoreMiddleExtensions: true },
      ],
      'check-file/folder-naming-convention': ['error', { 'src/**': 'KEBAB_CASE' }],
    },
  },

  // Entities @x public API — naming convention 예외
  {
    files: ['src/entities/**/@x/**/*'],
    rules: {
      'check-file/filename-naming-convention': 'off',
      'check-file/folder-naming-convention': 'off',
    },
  },

  // Entities layer — @x 루트 import 금지
  {
    files: ['src/entities/**/*'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/entities/*/@x', '@/entities/*/@x/index', '@/entities/*/@x/index.*'],
              message: '@x 루트 import는 금지입니다. @x/<consumer> 파일을 사용하세요.',
            },
          ],
        },
      ],
    },
  },

  ...entityXImportRestrictionConfigs,

  // Next.js convention files — 파일명 규칙 예외
  {
    files: [
      'app/**/page.tsx',
      'app/**/layout.tsx',
      'app/**/loading.tsx',
      'app/**/providers.tsx',
      'app/**/error.tsx',
      'app/**/not-found.tsx',
      'app/**/global-error.tsx',
      'app/**/default.tsx',
      'app/**/template.tsx',
      'app/**/route.ts',
      'app/**/middleware.ts',
      'app/**/opengraph-image.tsx',
      'app/**/icon.tsx',
      'app/**/sitemap.ts',
      'app/**/robots.ts',
      'app/**/manifest.ts',
      'proxy.ts',
    ],
    rules: {
      'check-file/filename-naming-convention': 'off',
    },
  },

  // Next.js route groups — (main) 등 괄호 폴더 naming 예외
  {
    files: ['app/(**)/**/*'],
    rules: {
      'check-file/folder-naming-convention': 'off',
    },
  },

  // 가짜 Supabase 서버(mock/) — 앱 밖 Node 개발 도구라 FSD 경로 규칙과 console 제한을 받지 않는다
  {
    files: ['mock/**/*'],
    rules: {
      'fsd/no-relative-imports': 'off',
      'no-console': 'off',
      'no-nested-ternary': 'off',
    },
  },

  // Ignores
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);

export default eslintConfig;
