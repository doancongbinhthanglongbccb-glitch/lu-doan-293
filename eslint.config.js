import js from '@eslint/js';
import globals from 'globals';

const baseRules = {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    eqeqeq: ['error', 'always', { null: 'ignore' }],
    curly: ['error', 'multi-line']
};

export default [
    js.configs.recommended,
    {
        files: ['frontend/js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                MathJax: 'readonly',
                XLSX: 'readonly'
            }
        },
        rules: baseRules
    },
    {
        files: ['backend/src/**/*.js', 'backend/database/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: globals.node
        },
        rules: baseRules
    },
    {
        files: ['backend/database/migrate.js', 'backend/src/index.js'],
        rules: { 'no-console': 'off' }
    },
    {
        ignores: ['node_modules/**', 'backend/node_modules/**', 'frontend/js/legacy/**']
    }
];
