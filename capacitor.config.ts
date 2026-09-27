import type { CapacitorConfig } from '@capacitor/cli'

/** Native wrapper: the whole game ships in the binary and plays offline. */
const config: CapacitorConfig = {
  appId: 'kr.co.ddstudio.ricochet',
  appName: 'Ricochet Out',
  webDir: 'dist',
  backgroundColor: '#0b1026',
  ios: { contentInset: 'never', scrollEnabled: false, backgroundColor: '#0b1026' },
}

export default config
