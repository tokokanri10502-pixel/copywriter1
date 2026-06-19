import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages の公開先が https://<user>.github.io/copywriter1/ のため base を合わせる。
// ローカル dev では base は影響しない。
export default defineConfig({
  base: '/copywriter1/',
  plugins: [react()],
})
