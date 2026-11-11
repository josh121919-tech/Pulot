import { Injectable, computed, inject, signal } from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { AlertController, ModalController, ToastController } from '@ionic/angular';
import { firstValueFrom, timeout, type Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { ItemDetailComponent } from '../items/item-detail.component';
import { parseContact, type Item } from '../models/item.model';

import { HapticsService } from './haptics.service';
import { ItemService } from './item.service';

export interface FoundNotice {
  key: string;
  kind: 'found' | 'claim';
  id: number;
  claim_id?: number;
  title: string;
  found_contact: string;
  proof?: string;
  found_at: string;
  read: boolean;
  item: Item;
}

const NOTICES_KEY = `lostfound.foundNotices@${environment.apiUrl}`;
const OLD_SEEN_KEY = `lostfound.seenFoundNotices@${environment.apiUrl}`;
const CHECK_EVERY_MS = 30_000;
const REQUEST_TIMEOUT_MS = 15_000;
const CLAIM_NOTIFICATION_BASE = 1_000_000;

@Injectable({ providedIn: 'root' })
export class FoundNoticeService {
  private itemService = inject(ItemService);
  private haptics = inject(HapticsService);
  private alertCtrl = inject(AlertController);
  private modalCtrl = inject(ModalController);
  private toastCtrl = inject(ToastController);
  private started = false;
  private checking = false;
  private active = true;

  readonly notices = signal<FoundNotice[]>(this.readNotices());
  readonly unreadCount = computed(() => this.notices().filter((notice) => !notice.read).length);
  readonly reportsChanged = signal(0);

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    void this.setUpPhoneNotifications();
    void this.checkNow();
    setInterval(() => {
      if (this.active) {
        void this.checkNow();
      }
    }, CHECK_EVERY_MS);
    if (Capacitor.isNativePlatform()) {
      void App.addListener('appStateChange', ({ isActive }) => {
        this.active = isActive;
        if (isActive) {
          void this.checkNow();
        }
      });
    } else {
      document.addEventListener('visibilitychange', () => {
        this.active = document.visibilityState === 'visible';
        if (this.active) {
          void this.checkNow();
        }
      });
    }
  }

  async openReport(id: number): Promise<void> {
    this.markRead(id);
    let item = this.notices().find((notice) => notice.id === id)?.item;
    try {
      const result = await firstValueFrom(this.itemService.getItems());
      item = (result.data ?? []).find((report) => report.id === id);
      if (!item) {
        await this.showToast('That report has been deleted.');
        return;
      }
    } catch {
    }
    if (!item) {
      return;
    }
    const modal = await this.modalCtrl.create({ component: ItemDetailComponent, componentProps: { item } });
    await modal.present();
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

  async checkNow(): Promise<void> {
    if (this.checking || !this.itemService.hasReports()) {
      return;
    }
    this.checking = true;
    try {
      const result = await this.fetch(this.itemService.getItems({ status: 'open' }));
      const mine = (result.data ?? []).filter((item) => this.itemService.isMine(item.id));
      for (const item of mine) {
        if (item.type === 'lost') {
          await this.checkFound(item);
        } else {
          await this.checkClaims(item);
        }
      }
    } catch {
    } finally {
      this.checking = false;
    }
  }

  private async checkFound(item: Item): Promise<void> {
    const key = `found-${item.id}`;
    if (!item.found_at || this.hasNotice(key)) {
      return;
    }
    const alreadyAnnounced = this.readOldSeen().includes(item.id);
    const notice: FoundNotice = {
      key,
      kind: 'found',
      id: item.id,
      title: item.title,
      found_contact: item.found_contact ?? '',
      found_at: item.found_at,
      read: alreadyAnnounced,
      item,
    };
    this.saveNotices([notice, ...this.notices()]);
    if (!alreadyAnnounced) {
      await this.announce(notice);
    }
  }

  private async checkClaims(item: Item): Promise<void> {
    const known = this.notices().filter((notice) => notice.kind === 'claim' && notice.id === item.id).length;
    if (item.claim_count <= known) {
      return;
    }
    const result = await this.fetch(this.itemService.getClaims(item.id));
    for (const claim of [...(result.data ?? [])].reverse()) {
      const key = `claim-${claim.id}`;
      if (this.hasNotice(key)) {
        continue;
      }
      const notice: FoundNotice = {
        key,
        kind: 'claim',
        id: item.id,
        claim_id: claim.id,
        title: item.title,
        found_contact: claim.contact,
        proof: claim.proof,
        found_at: claim.created_at,
        read: false,
        item,
      };
      this.saveNotices([notice, ...this.notices()]);
      await this.announce(notice);
    }
  }

  private fetch<T>(request: Observable<T>): Promise<T> {
    return firstValueFrom(request.pipe(timeout(REQUEST_TIMEOUT_MS)));
  }

  private hasNotice(key: string): boolean {
    return this.notices().some((notice) => notice.key === key);
  }

  private async announce(notice: FoundNotice): Promise<void> {
    const contact = parseContact(notice.found_contact);
    const howToReach =
      contact.method === 'facebook'
        ? `Message them on Facebook: ${contact.value}`
        : `Call or text them: ${contact.value}`;
    const isClaim = notice.kind === 'claim';
    const message = isClaim ? `Their proof: "${notice.proof}". ${howToReach}` : howToReach;

    void this.postPhoneNotification(notice, message);
    const stopRinging = this.haptics.ring();

    const alert = await this.alertCtrl.create({
      header: isClaim ? 'Someone says this is theirs!' : 'Someone found your item!',
      subHeader: notice.title,
      message,
      backdropDismiss: false,
      buttons: [
        { text: 'Later', role: 'cancel' },
        { text: 'View report', role: 'confirm' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    stopRinging();
    void this.clearPhoneNotification(notice);
    if (role === 'confirm') {
      await this.openReport(notice.id);
    }
  }

  private async setUpPhoneNotifications(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }
    try {
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
    }
  }

  private notificationId(notice: FoundNotice): number {
    return notice.kind === 'claim' ? CLAIM_NOTIFICATION_BASE + (notice.claim_id ?? 0) : notice.id;
  }

  private async postPhoneNotification(notice: FoundNotice, body: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: this.notificationId(notice),
            title:
              notice.kind === 'claim'
                ? `Someone says this is theirs: ${notice.title}`
                : `Someone found your item: ${notice.title}`,
            body,
            smallIcon: 'ic_stat_pickapp',
            extra: { itemId: notice.id },
            isExactNotification: false,
          },
        ],
      });
    } catch {
    }
  }

  private async clearPhoneNotification(notice: FoundNotice): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }
    try {
      await LocalNotifications.removeDeliveredNotifications({
        notifications: [{ id: this.notificationId(notice), title: '', body: '' }],
      });
    } catch {
    }
  }

  private readNotices(): FoundNotice[] {
    try {
      const stored = JSON.parse(localStorage.getItem(NOTICES_KEY) ?? '[]') as unknown;
      if (!Array.isArray(stored)) {
        return [];
      }
      return (stored as FoundNotice[]).map((notice) => ({
        ...notice,
        kind: notice.kind ?? 'found',
        key: notice.key ?? `found-${notice.id}`,
      }));
    } catch {
      return [];
    }
  }

  private saveNotices(notices: FoundNotice[]): void {
    this.notices.set(notices);
    try {
      localStorage.setItem(NOTICES_KEY, JSON.stringify(notices));
    } catch {
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
