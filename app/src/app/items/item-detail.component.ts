import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import {
  AlertController,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  bagHandleOutline,
  callOutline,
  cardOutline,
  checkmarkCircle,
  checkmarkDoneOutline,
  closeOutline,
  cubeOutline,
  keyOutline,
  locationOutline,
  logoFacebook,
  personCircleOutline,
  phonePortraitOutline,
  refreshOutline,
  shirtOutline,
  timeOutline,
} from 'ionicons/icons';

import { LocationMapComponent } from '../components/location-map/location-map.component';
import { CATEGORY_ICONS, parseContact, type Item, type ItemStatus } from '../models/item.model';
import { HapticsService } from '../services/haptics.service';
import { ItemService } from '../services/item.service';

// Full-screen modal opened from the Browse list: photo, details and the map pin.
// On the phone that submitted the report it also lets the reporter mark it resolved.
@Component({
  selector: 'app-item-detail',
  templateUrl: 'item-detail.component.html',
  styleUrls: ['item-detail.component.scss'],
  imports: [
    DatePipe,
    DecimalPipe,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonSpinner,
    IonTitle,
    IonToolbar,
    LocationMapComponent,
  ],
})
export class ItemDetailComponent {
  private modalCtrl = inject(ModalController);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private itemService = inject(ItemService);
  private haptics = inject(HapticsService);

  // Passed in through ModalController.create({ componentProps: { item } }).
  item = input.required<Item>();

  // Starts as the passed-in item, then follows the server's reply after a status change.
  current = linkedSignal(() => this.item());
  isMine = computed(() => this.itemService.isMine(this.current().id));
  categoryIcon = computed(() => CATEGORY_ICONS[this.current().category] ?? 'cube-outline');
  contact = computed(() => parseContact(this.current().contact_info));
  phoneDigits = computed(() => this.contact().value.replace(/[^\d+]/g, ''));
  saving = signal(false);
  private statusChanged = false;

  constructor() {
    addIcons({
      bagHandleOutline,
      callOutline,
      cardOutline,
      checkmarkCircle,
      checkmarkDoneOutline,
      closeOutline,
      cubeOutline,
      keyOutline,
      locationOutline,
      logoFacebook,
      personCircleOutline,
      phonePortraitOutline,
      refreshOutline,
      shirtOutline,
      timeOutline,
    });
  }

  // Tells the Browse list to reload if the status changed while this was open.
  close(): void {
    this.modalCtrl.dismiss(this.statusChanged);
  }

  async markResolved(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Mark as resolved?',
      message:
        this.current().type === 'lost'
          ? 'Do this once you have your item back. The report stays visible, labelled Resolved.'
          : 'Do this once the owner has claimed the item. The report stays visible, labelled Resolved.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Mark resolved', role: 'confirm' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role === 'confirm') {
      this.updateStatus('resolved');
    }
  }

  reopen(): void {
    this.updateStatus('open');
  }

  private updateStatus(status: ItemStatus): void {
    this.saving.set(true);
    this.itemService.setStatus(this.current().id, status).subscribe({
      next: async (result) => {
        this.saving.set(false);
        if (result.data) {
          this.current.set(result.data);
        }
        this.statusChanged = true;
        await this.showToast(result.message ?? 'Status updated.', 'success');
      },
      error: async (err) => {
        this.saving.set(false);
        await this.showToast(this.itemService.describeError(err), 'danger');
      },
    });
  }

  // The vibration matches the message: success when the status changed, error when it failed.
  private async showToast(message: string, color: 'success' | 'danger'): Promise<void> {
    void (color === 'success' ? this.haptics.success() : this.haptics.error());
    const toast = await this.toastCtrl.create({ message, color, duration: 3000, position: 'top' });
    await toast.present();
  }
}
