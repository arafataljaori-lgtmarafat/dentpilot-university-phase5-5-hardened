import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const isGitHubPagesBuild = process.env.GITHUB_ACTIONS === 'true' && Boolean(repositoryName);

export default defineConfig({
  base: isGitHubPagesBuild ? `/${repositoryName}/` : '/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: false },
      '/health': { target: 'http://localhost:3000', changeOrigin: false },
    },
  },
});
