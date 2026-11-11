import { Component, computed, inject, input, signal, type OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Camera } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import {
  ActionSheetController,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
  LoadingController,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  cameraOutline,
  close,
  handLeftOutline,
  helpCircleOutline,
  locateOutline,
  locationOutline,
  logoFacebook,
  mapOutline,
  sendOutline,
} from 'ionicons/icons';

import { environment } from '../../environments/environment';
import type { LatLng } from '../components/location-map/location-map.component';
import { LocationMapComponent } from '../components/location-map/location-map.component';
import {
  ITEM_CATEGORIES,
  formatContact,
  isValidPhone,
  parseContact,
  type ContactMethod,
  type Item,
  type ItemType,
} from '../models/item.model';
import { HapticsService } from '../services/haptics.service';
import { ItemService } from '../services/item.service';

@Component({
  selector: 'app-report',
  templateUrl: 'report.page.html',
  styleUrls: ['report.page.scss'],
  imports: [
    FormsModule,
    IonButton,
    IonButtons,
    IonContent,
    IonFooter,
    IonHeader,
    IonIcon,
    IonInput,
    IonLabel,
    IonSegment,
    IonSegmentButton,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonTextarea,
    IonTitle,
    IonToolbar,
    LocationMapComponent,
  ],
})
export class ReportPage implements OnInit {
  private itemService = inject(ItemService);
  private haptics = inject(HapticsService);
  private actionSheetCtrl = inject(ActionSheetController);
  private loadingCtrl = inject(LoadingController);
  private toastCtrl = inject(ToastController);
  private router = inject(Router);
  private modalCtrl = inject(ModalController);

  readonly categories = ITEM_CATEGORIES;

  editItem = input<Item | null>(null);
  private keptPhotoUrl: string | null = null;

  type: ItemType = 'lost';
  title = '';
  category = '';
  description = '';
  contactMethod: ContactMethod = 'phone';
  contactInfo = '';

  photoPreview = signal<string | null>(null);
  private photoBlob: Blob | null = null;

  latitude = signal<number | null>(null);
  longitude = signal<number | null>(null);
  accuracy = signal<number | null>(null);
  locating = signal(false);

  locationSummary = computed(() => {
    const coords = `${this.latitude()?.toFixed(5)}, ${this.longitude()?.toFixed(5)}`;
    const accuracy = this.accuracy();
    return accuracy === null ? coords : `${coords} (±${accuracy} m)`;
  });

  constructor() {
    addIcons({
      cameraOutline,
      close,
      handLeftOutline,
      helpCircleOutline,
      locateOutline,
      locationOutline,
      logoFacebook,
      mapOutline,
      sendOutline,
    });
  }

  ngOnInit(): void {
    const item = this.editItem();
    if (!item) {
      return;
    }
    this.type = item.type;
    this.title = item.title;
    this.category = item.category;
    this.description = item.description ?? '';
    const contact = parseContact(item.contact_info);
    this.contactMethod = contact.method ?? 'phone';
    this.contactInfo = contact.value;
    this.keptPhotoUrl = item.image_url;
    this.photoPreview.set(item.image_url);
    this.latitude.set(item.latitude);
    this.longitude.set(item.longitude);
  }

  cancelEdit(): void {
    this.modalCtrl.dismiss(null);
  }

  async choosePhoto(): Promise<void> {
    const sheet = await this.actionSheetCtrl.create({
      header: 'Add a photo of the item',
      buttons: [
        { text: 'Take photo', data: 'camera' },
        { text: 'Choose from gallery', data: 'gallery' },
        { text: 'Cancel', role: 'cancel' },
      ],
    });
    await sheet.present();
    const { data } = await sheet.onDidDismiss<'camera' | 'gallery'>();
    if (!data) {
      return;
    }

    try {
      const photo =
        data === 'camera'
          ? await Camera.takePhoto({ quality: 70, correctOrientation: true })
          : (await Camera.chooseFromGallery({})).results[0];

      if (!photo?.webPath) {
        return;
      }
      const response = await fetch(photo.webPath);
      this.photoBlob = await response.blob();
      this.photoPreview.set(photo.webPath);
    } catch (err) {
      const message = String((err as Error)?.message ?? err).toLowerCase();
      if (!message.includes('cancel') && !message.includes('no picture') && !message.includes('no image')) {
        await this.showToast('Could not get the photo. Check the camera permission and try again.', 'danger');
      }
    }
  }

  removePhoto(): void {
    this.photoBlob = null;
    this.photoPreview.set(null);
  }

  async getCurrentLocation(): Promise<void> {
    this.locating.set(true);
    try {
      if (Capacitor.isNativePlatform()) {
        const permission = await Geolocation.requestPermissions();
        if (permission.location !== 'granted') {
          await this.showToast('Location permission was denied. Tap "Pick on map" to set the pin yourself.', 'warning');
          return;
        }
      }

      const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
      this.latitude.set(position.coords.latitude);
      this.longitude.set(position.coords.longitude);
      this.accuracy.set(Math.round(position.coords.accuracy));
    } catch {
      await this.showToast('Could not get your location. Turn on GPS, or tap "Pick on map".', 'warning');
    } finally {
      this.locating.set(false);
    }
  }

  pickOnMap(): void {
    this.latitude.set(environment.defaultMapCenter.latitude);
    this.longitude.set(environment.defaultMapCenter.longitude);
    this.accuracy.set(null);
  }

  onPinMoved(position: LatLng): void {
    this.latitude.set(position.latitude);
    this.longitude.set(position.longitude);
    this.accuracy.set(null);
  }

  async submit(): Promise<void> {
    const missing = this.missingFields();
    if (missing.length > 0) {
      await this.showToast(`Please add: ${missing.join(', ')}.`, 'warning');
      return;
    }
    if (this.contactMethod === 'phone' && !isValidPhone(this.contactInfo)) {
      await this.showToast('Enter a valid mobile number, e.g. 0917 123 4567.', 'warning');
      return;
    }

    const loading = await this.loadingCtrl.create({
      message: this.editItem() ? 'Saving changes...' : 'Submitting report...',
    });
    await loading.present();

    const item = {
      title: this.title.trim(),
      description: this.description.trim(),
      type: this.type,
      category: this.category,
      latitude: this.latitude()!,
      longitude: this.longitude()!,
      contact_info: formatContact(this.contactMethod, this.contactInfo),
    };

    const editing = this.editItem();
    if (editing) {
      const removePhoto = this.keptPhotoUrl !== null && this.photoPreview() === null;
      this.itemService.updateItem(editing.id, item, this.photoBlob, removePhoto).subscribe({
        next: async (result) => {
          await loading.dismiss();
          await this.showToast(result.message ?? 'Report updated.', 'success');
          await this.modalCtrl.dismiss(result.data ?? null);
        },
        error: async (err) => {
          await loading.dismiss();
          await this.showToast(this.itemService.describeError(err), 'danger');
        },
      });
      return;
    }

    this.itemService.createItem(item, this.photoBlob).subscribe({
      next: async (result) => {
        await loading.dismiss();
        await this.showToast(result.message ?? 'Report submitted.', 'success');
        this.resetForm();
        this.router.navigateByUrl('/items');
      },
      error: async (err) => {
        await loading.dismiss();
        await this.showToast(this.itemService.describeError(err), 'danger');
      },
    });
  }

  private missingFields(): string[] {
    const missing: string[] = [];
    if (!this.title.trim()) missing.push('a title');
    if (!this.category) missing.push('a category');
    if (!this.contactInfo.trim()) {
      missing.push(this.contactMethod === 'phone' ? 'your contact number' : 'your Facebook name');
    }
    if (this.latitude() === null) missing.push('the location');
    return missing;
  }

  private resetForm(): void {
    this.type = 'lost';
    this.title = '';
    this.category = '';
    this.description = '';
    this.contactMethod = 'phone';
    this.contactInfo = '';
    this.removePhoto();
    this.latitude.set(null);
    this.longitude.set(null);
    this.accuracy.set(null);
  }

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
