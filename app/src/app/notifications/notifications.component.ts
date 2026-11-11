import { Component, inject } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonRippleEffect,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { closeOutline, handRightOutline, notificationsOffOutline } from 'ionicons/icons';

import { parseContact } from '../models/item.model';
import { FoundNoticeService, type FoundNotice } from '../services/found-notice.service';
import { RelativeDatePipe } from '../shared/relative-date.pipe';

// The bell list: every "someone found your item" notice this phone has received, newest
// first. Unread ones are marked; tapping one opens its report.
@Component({
  selector: 'app-notifications',
  templateUrl: 'notifications.component.html',
  styleUrls: ['notifications.component.scss'],
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonRippleEffect,
    IonTitle,
    IonToolbar,
    RelativeDatePipe,
  ],
})
export class NotificationsComponent {
  private modalCtrl = inject(ModalController);
  readonly foundNotices = inject(FoundNoticeService);

  constructor() {
    addIcons({ closeOutline, handRightOutline, notificationsOffOutline });
  }

  howToReach(notice: FoundNotice): string {
    const contact = parseContact(notice.found_contact);
    return contact.method === 'facebook' ? `Facebook: ${contact.value}` : `Call or text ${contact.value}`;
  }

  close(): void {
    this.modalCtrl.dismiss();
  }

  async open(notice: FoundNotice): Promise<void> {
    await this.modalCtrl.dismiss();
    await this.foundNotices.openReport(notice.id);
  }
}
