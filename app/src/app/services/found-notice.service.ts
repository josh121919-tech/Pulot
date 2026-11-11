import { Injectable, computed, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { AlertController, ModalController, ToastController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import { ItemDetailComponent } from '../items/item-detail.component';
import { parseContact, type Item } from '../models/item.model';

import { HapticsService } from './haptics.service';
import { ItemService } from './item.service';

// One "someone found your item" notice, kept on this phone for the bell list.
export interface FoundNotice {
  id: number; // the report id
  title: string;
  found_contact: string;
  found_at: string;
  read: boolean;
  item: Item; // the report as it was when the notice arrived, shown if the server is offline
}

// Both lists are kept per server, like the owner tokens.
const NOTICES_KEY = `lostfound.foundNotices@${environment.apiUrl}`;
// Ids announced by the first version of this feature, before the bell list existed.
const OLD_SEEN_KEY = `lostfound.seenFoundNotices@${environment.apiUrl}`;
const CHECK_EVERY_MS = 30_000;

// Tells the owner of a Lost report when someone says they found it. It checks when the app
// opens, when it comes back to the front, and every 30 seconds while it is open. A new notice
//   - rings the phone's vibration for up to a minute, until the alert is answered,
//   - posts a notification in the phone's notification bar (tap it to open the report),
//   - is added to the bell list on the Browse tab, with an unread count.
// A phone cannot be woken while the app is closed without a push service (Firebase), so a
// notice that arrives then is announced as soon as the app is opened again.
@Injectable({ providedIn: 'root' })
export class FoundNoticeService {
  private itemService = inject(ItemService);
  private haptics = inject(HapticsService);
  private alertCtrl = inject(AlertController);
  private modalCtrl = inject(ModalController);
  private toastCtrl = inject(ToastController);
  private started = false;
  private checking = false;

  // Newest first.
  readonly notices = signal<FoundNotice[]>(this.readNotices());
  readonly unreadCount = computed(() => this.notices().filter((notice) => !notice.read).length);
  // Goes up each time a report opened from here was changed, so the lists can reload.
  readonly reportsChanged = signal(0);

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    void this.setUpPhoneNotifications();
    void this.check();
    setInterval(() => {
      if (document.visibilityState === 'visible') {
        void this.check();
      }
    }, CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void this.check();
      }
    });
  }

  // Opens the report a notice is about, with its latest data from the server.
  async openReport(id: number): Promise<void> {
    this.markRead(id);
    let item = this.notices().find((notice) => notice.id === id)?.item;
    try {
      // No type filter: the owner may have edited the report since.
      const result = await firstValueFrom(this.itemService.getItems());
      item = (result.data ?? []).find((report) => report.id === id);
      if (!item) {
        await this.showToast('That report has been deleted.');
        return;
      }
    } catch {
      // Offline: show the report as it was saved when the notice came in.
    }
    if (!item) {
      return;
    }
    const modal = await this.modalCtrl.create({ component: ItemDetailComponent, componentProps: { item } });
    await modal.present();
    // The detail screen returns true when the report was resolved, edited or deleted.
    const { data } = await modal.onDidDismiss<boolean>();
    if (data) {
      this.reportsChanged.update((count) => count + 1);
    }
  }

  markAllRead(): void {
    this.saveNotices(this.notices().map((notice) => ({ ...notice, read: true })));
  }

  private markRead(id: number): void {
    this.saveNotices(this.notices().map((notice) => (notice.id === id ? { ...notice, read: true } : notice)));
  }

  private async check(): Promise<void> {
    if (this.checking || !this.itemService.hasReports()) {
      return;
    }
    this.checking = true;
    try {
      const result = await firstValueFrom(this.itemService.getItems({ type: 'lost', status: 'open' }));
      const known = new Set(this.notices().map((notice) => notice.id));
      const oldSeen = this.readOldSeen();
      const news = (result.data ?? []).filter(
        (item) => item.found_at && this.itemService.isMine(item.id) && !known.has(item.id),
      );
      for (const item of news) {
        const alreadyAnnounced = oldSeen.includes(item.id);
        this.saveNotices([
          {
            id: item.id,
            title: item.title,
            found_contact: item.found_contact ?? '',
            found_at: item.found_at ?? '',
            read: alreadyAnnounced,
            item,
          },
          ...this.notices(),
        ]);
        if (!alreadyAnnounced) {
          await this.announce(item);
        }
      }
    } catch {
      // Offline or the server is down: try again on the next check.
    } finally {
      this.checking = false;
    }
  }

  private async announce(item: Item): Promise<void> {
    const contact = parseContact(item.found_contact ?? '');
    const howToReach =
      contact.method === 'facebook'
        ? `Message them on Facebook: ${contact.value}`
        : `Call or text them: ${contact.value}`;

    void this.postPhoneNotification(item, howToReach);
    const stopRinging = this.haptics.ring();

    const alert = await this.alertCtrl.create({
      header: 'Someone found your item!',
      subHeader: item.title,
      message: howToReach,
      backdropDismiss: false,
      buttons: [
        { text: 'Later', role: 'cancel' },
        { text: 'View report', role: 'confirm' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    stopRinging();
    void this.clearPhoneNotification(item.id);
    if (role === 'confirm') {
      await this.openReport(item.id);
    }
  }

  // ---------- Phone notification bar (Capacitor Local Notifications) ----------

  private async setUpPhoneNotifications(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return; // the browser version shows the alert and the bell list only
    }
    try {
      // Android 13 and newer ask the user once; older versions allow it by default.
      const permission = await LocalNotifications.checkPermissions();
      if (permission.display === 'prompt' || permission.display === 'prompt-with-rationale') {
        await LocalNotifications.requestPermissions();
      }
      await LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
        const id = Number(action.notification.extra?.itemId);
        if (id) {
          void this.openReport(id);
        }
      });
    } catch {
      // Notifications unavailable: the alert and the bell list still work.
    }
  }

  private async postPhoneNotification(item: Item, body: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: item.id,
            title: `Someone found your item: ${item.title}`,
            body,
            smallIcon: 'ic_stat_pickapp',
            extra: { itemId: item.id },
          },
        ],
      });
    } catch {
      // Permission denied: the alert in the app is still shown.
    }
  }

  // Removes the notification from the bar once the owner has answered the alert in the app.
  private async clearPhoneNotification(id: number): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }
    try {
      await LocalNotifications.removeDeliveredNotifications({
        notifications: [{ id, title: '', body: '' }],
      });
    } catch {
      // Nothing to remove.
    }
  }

  // ---------- Storage ----------

  private readNotices(): FoundNotice[] {
    try {
      const stored = JSON.parse(localStorage.getItem(NOTICES_KEY) ?? '[]') as unknown;
      return Array.isArray(stored) ? (stored as FoundNotice[]) : [];
    } catch {
      return [];
    }
  }

  private saveNotices(notices: FoundNotice[]): void {
    this.notices.set(notices);
    try {
      localStorage.setItem(NOTICES_KEY, JSON.stringify(notices));
    } catch {
      // Storage blocked: the list lasts until the app is closed.
    }
  }

  private readOldSeen(): number[] {
    try {
      const stored = JSON.parse(localStorage.getItem(OLD_SEEN_KEY) ?? '[]') as unknown;
      return Array.isArray(stored) ? stored.filter((id): id is number => typeof id === 'number') : [];
    } catch {
      return [];
    }
  }

  private async showToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, color: 'warning', duration: 3000, position: 'top' });
    await toast.present();
  }
}
