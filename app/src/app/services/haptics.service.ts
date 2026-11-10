import { Injectable } from '@angular/core';
import { Haptics, NotificationType } from '@capacitor/haptics';

// Short vibrations that match the result of an action, so the user can feel it as well as
// read the toast: success (report sent, status changed), warning (something to fix first),
// error (the server or the network failed).
@Injectable({ providedIn: 'root' })
export class HapticsService {
  success(): Promise<void> {
    return this.notify(NotificationType.Success);
  }

  warning(): Promise<void> {
    return this.notify(NotificationType.Warning);
  }

  error(): Promise<void> {
    return this.notify(NotificationType.Error);
  }

  private async notify(type: NotificationType): Promise<void> {
    try {
      await Haptics.notification({ type });
    } catch {
      // Desktop browsers and phones without a vibration motor cannot vibrate; the toast is enough.
    }
  }
}
