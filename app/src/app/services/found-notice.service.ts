import { Injectable, inject } from '@angular/core';
import { AlertController, ModalController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import { ItemDetailComponent } from '../items/item-detail.component';
import { parseContact, type Item } from '../models/item.model';

import { HapticsService } from './haptics.service';
import { ItemService } from './item.service';

// The notices this phone has already announced, per server, so each one alerts only once.
const SEEN_KEY = `lostfound.seenFoundNotices@${environment.apiUrl}`;
const CHECK_EVERY_MS = 30_000;

// Tells the owner of a Lost report when someone says they found it: the phone vibrates and an
// alert shows the finder's contact. It checks when the app opens, when it comes back to the
// front, and every 30 seconds while it is open. A phone cannot be woken while the app is
// closed without a push service (Firebase), so the alert then waits until the app is opened.
@Injectable({ providedIn: 'root' })
export class FoundNoticeService {
  private itemService = inject(ItemService);
  private haptics = inject(HapticsService);
  private alertCtrl = inject(AlertController);
  private modalCtrl = inject(ModalController);
  private started = false;
  private checking = false;

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
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

  private async check(): Promise<void> {
    if (this.checking || !this.itemService.hasReports()) {
      return;
    }
    this.checking = true;
    try {
      const result = await firstValueFrom(this.itemService.getItems({ type: 'lost', status: 'open' }));
      const seen = this.readSeen();
      const news = (result.data ?? []).filter(
        (item) => item.found_at && this.itemService.isMine(item.id) && !seen.includes(item.id),
      );
      for (const item of news) {
        this.markSeen(item.id);
        await this.announce(item);
      }
    } catch {
      // Offline or the server is down: try again on the next check.
    } finally {
      this.checking = false;
    }
  }

  private async announce(item: Item): Promise<void> {
    void this.haptics.attention();
    const contact = parseContact(item.found_contact ?? '');
    const alert = await this.alertCtrl.create({
      header: 'Someone found your item!',
      subHeader: item.title,
      message:
        contact.method === 'facebook'
          ? `Message them on Facebook: ${contact.value}`
          : `Call or text them: ${contact.value}`,
      buttons: [
        { text: 'Later', role: 'cancel' },
        { text: 'View report', role: 'confirm' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role === 'confirm') {
      const modal = await this.modalCtrl.create({ component: ItemDetailComponent, componentProps: { item } });
      await modal.present();
      await modal.onDidDismiss();
    }
  }

  private readSeen(): number[] {
    try {
      const stored = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as unknown;
      return Array.isArray(stored) ? stored.filter((id): id is number => typeof id === 'number') : [];
    } catch {
      return [];
    }
  }

  private markSeen(id: number): void {
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify([...this.readSeen(), id]));
    } catch {
      // Storage blocked: the alert may show again next time, which is better than never.
    }
  }
}
