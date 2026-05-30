import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Web3Modal + WalletConnect — huge, never needed on initial load
          if (id.includes('@web3modal') || id.includes('@walletconnect') || id.includes('web3modal')) {
            return 'web3modal';
          }
          // Ethers — large, only needed when signing
          if (id.includes('ethers') || id.includes('@ethersproject')) {
            return 'web3-vendor';
          }
          // Charts — only needed on pages that display charts
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory')) {
            return 'charts-vendor';
          }
          // Markdown renderer — only needed on market detail
          if (id.includes('react-markdown') || id.includes('rehype') || id.includes('remark')) {
            return 'markdown-vendor';
          }
          // QR codes — only needed on deposit page
          if (id.includes('qrcode')) {
            return 'qr-vendor';
          }
          // Core React ecosystem — always needed, cache aggressively
          if (id.includes('react-dom') || id.includes('react-router') || (id.includes('node_modules/react/') && !id.includes('react-dom') && !id.includes('react-router'))) {
            return 'react-vendor';
          }
          // State / data fetching
          if (id.includes('@tanstack/react-query') || id.includes('axios') || id.includes('zustand')) {
            return 'query-vendor';
          }
          // UI utilities
          if (id.includes('framer-motion') || id.includes('lucide-react') || id.includes('react-hot-toast')) {
            return 'ui-vendor';
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
