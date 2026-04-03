import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 测试环境
    environment: 'node',
    // 包含测试文件匹配
    include: ['tests/**/*.{test,spec}.{js,mjs}'],
    // 排除
    exclude: ['node_modules', 'dist'],
    // 覆盖率配置
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['core/**/*.js', 'hub/**/*.js', 'lib/**/*.js'],
      exclude: ['**/*.d.ts', '**/node_modules/**']
    },
    // 测试超时
    testTimeout: 10000
  }
});
