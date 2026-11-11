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
  handRightOutline,
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
import {
  CATEGORY_ICONS,
  formatContact,
  isValidPhone,
  parseContact,
  type Item,
  type ItemStatus,
} from '../models/item.model';
import { HapticsService } from '../services/haptics.service';
import { ItemService } from '../services/item.service';

interface FoundForm {
  phone: string;
  facebook: string;
}

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
  // The notice left by someone who found this Lost item, if any.
  foundContact = computed(() => {
    const value = this.current().found_contact;
    return value ? parseContact(value) : null;
  });
  foundPhoneDigits = computed(() => (this.foundContact()?.value ?? '').replace(/[^\d+]/g, ''));
  // Anyone except the reporter can answer an open Lost report that has no notice yet.
  canSayFound = computed(() => {
    const item = this.current();
    return item.type === 'lost' && item.status === 'open' && !item.found_at && !this.isMine();
  });
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
      handRightOutline,
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

  // "I found this": asks for the finder's contact number or Facebook name and sends it, so
  // the owner's app can vibrate and show it.
  async sayFound(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'You found this?',
      message: 'Leave your contact number or Facebook name. The owner gets an alert in the app and can reach you.',
      inputs: [
        {
          name: 'phone',
          type: 'tel',
          placeholder: 'Contact number, e.g. 0917 123 4567',
          attributes: { maxlength: 16, inputmode: 'tel' },
        },
        { name: 'facebook', type: 'text', placeholder: 'or your Facebook name', attributes: { maxlength: 90 } },
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Send',
          role: 'confirm',
          handler: (values: FoundForm) => {
            const problem = this.foundFormProblem(values);
            if (problem) {
              void this.showToast(problem, 'warning');
              return false; // keep the alert open so the finder can fix it
            }
            return true;
          },
        },
      ],
    });
    await alert.present();
    const { role, data } = await alert.onDidDismiss<{ values: FoundForm }>();
    if (role !== 'confirm' || !data) {
      return;
    }

    const phone = data.values.phone.trim();
    const contact = phone ? formatContact('phone', phone) : formatContact('facebook', data.values.facebook);
    this.saving.set(true);
    this.itemService.reportFound(this.current().id, contact).subscribe({
      next: async (result) => {
        this.saving.set(false);
        if (result.data) {
          this.current.set(result.data);
        }
        this.statusChanged = true;
        await this.showToast(result.message ?? 'The owner has been told.', 'success');
      },
      error: async (err) => {
        this.saving.set(false);
        await this.showToast(this.itemService.describeError(err), 'danger');
      },
    });
  }

  private foundFormProblem(values: FoundForm): string | null {
    const phone = values.phone.trim();
    if (phone) {
      return isValidPhone(phone) ? null : 'Enter a valid mobile number, e.g. 0917 123 4567.';
    }
    return values.facebook.trim() ? null : 'Add your contact number or your Facebook name.';
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

  // The vibration matches the message: success, warning (something to fix) or error.
  private async showToast(message: string, color: 'success' | 'warning' | 'danger'): Promise<void> {
    void (color === 'success'
      ? this.haptics.success()
      : color === 'warning'
        ? this.haptics.warning()
        : this.haptics.error());
    const toast = await this.toastCtrl.create({ message, color, duration: 3000, position: 'top' });
    await toast.present();
  }
}
