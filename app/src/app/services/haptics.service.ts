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

  // Keeps buzzing (1 s on, 0.5 s off) until the returned stop function is called, or for
  // at most maxMs. Used when someone found the user's item, so the phone rings like a call.
  ring(maxMs = 60_000): () => void {
    let stopped = false;
    const buzz = (): void => {
      Haptics.vibrate({ duration: 1000 }).catch(() => {
        // No vibration motor: the alert on screen is enough.
      });
    };
    const stop = (): void => {
      if (stopped) {
        return;
      }
      stopped = true;
      clearInterval(repeat);
      clearTimeout(limit);
      // A 1 ms buzz cuts short the one still running.
      Haptics.vibrate({ duration: 1 }).catch(() => undefined);
    };
    buzz();
    const repeat = setInterval(buzz, 1500);
    const limit = setTimeout(stop, maxMs);
    return stop;
  }

  private async notify(type: NotificationType): Promise<void> {
    try {
      await Haptics.notification({ type });
    } catch {
      // Desktop browsers and phones without a vibration motor cannot vibrate; the toast is enough.
    }
  }
}
