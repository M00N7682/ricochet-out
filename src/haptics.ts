/**
 * Haptics on the phone: the Capacitor plugin inside the app, the Vibration API
 * in an Android browser, nothing elsewhere. A tap should be felt, a bump more so.
 */
import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

let on = true
export const setHaptics = (v: boolean): void => { on = v }
const native = Capacitor.isNativePlatform()

export function buzz(kind: 'tap' | 'bump' | 'win' | 'light'): void {
  if (!on) return
  if (native) {
    if (kind === 'win') void Haptics.notification({ type: NotificationType.Success })
    else if (kind === 'bump') void Haptics.notification({ type: NotificationType.Error })
    else void Haptics.impact({ style: kind === 'tap' ? ImpactStyle.Medium : ImpactStyle.Light })
    return
  }
  if (typeof navigator.vibrate === 'function') navigator.vibrate(kind === 'bump' ? 40 : kind === 'win' ? [20, 40, 20] : 12)
}
