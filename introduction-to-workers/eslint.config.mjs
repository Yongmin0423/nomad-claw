import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{
		ignores: ['dist/**', 'coverage/**', '.wrangler/**', '**/*.d.ts'],
	},
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	prettier,
	{
		files: ['**/*.ts'],
		rules: {
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{
					args: 'none',
					ignoreRestSiblings: true,
				},
			],
		},
	},
);
