import { Injectable } from '@angular/core';
import { Haptics, NotificationType } from '@capacitor/haptics';

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

  ring(maxMs = 60_000): () => void {
    let stopped = false;
    const buzz = (): void => {
      Haptics.vibrate({ duration: 1000 }).catch(() => {
      });
    };
    const stop = (): void => {
      if (stopped) {
        return;
      }
      stopped = true;
      clearInterval(repeat);
      clearTimeout(limit);
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
    }
  }
}
