import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: true,
    allowedHosts: [
      'coachsim.loca.lt',
      '.loca.lt'
    ],
    cors: true
  }
})
