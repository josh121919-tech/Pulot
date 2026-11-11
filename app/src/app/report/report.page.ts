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

// Report tab: form + Camera + Geolocation/Leaflet, sent with POST /api/items.php.
// The same form opens in a modal, filled in, when the reporter taps Edit on their report.
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

  // Set through ModalController componentProps when editing an existing report.
  editItem = input<Item | null>(null);
  // The photo already on the server, shown until it is replaced or removed.
  private keptPhotoUrl: string | null = null;

  // Form fields, bound with [(ngModel)].
  type: ItemType = 'lost';
  title = '';
  category = '';
  description = '';
  contactMethod: ContactMethod = 'phone';
  contactInfo = '';

  // Photo: a preview URL for <img>, and the file itself for the upload.
  photoPreview = signal<string | null>(null);
  private photoBlob: Blob | null = null;

  // Location: null until GPS or the user sets it.
  latitude = signal<number | null>(null);
  longitude = signal<number | null>(null);
  accuracy = signal<number | null>(null);
  locating = signal(false);

  // e.g. "15.48650, 120.97340 (±12 m)"; the accuracy part only appears for a GPS fix.
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

  // Fills the form from the report being edited.
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

  // ---------- Camera ----------

  // Asks "Take photo" or "Choose from gallery" (Camera 8 replaced CameraSource.Prompt
  // with these two separate calls), then keeps the result for preview and upload.
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
      // webPath is a URL the WebView can read, so fetch() turns it into a Blob for FormData.
      const response = await fetch(photo.webPath);
      this.photoBlob = await response.blob();
      this.photoPreview.set(photo.webPath);
    } catch (err) {
      // Closing the camera without taking a picture also lands here; that is not an error.
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

  // ---------- Geolocation ----------

  async getCurrentLocation(): Promise<void> {
    this.locating.set(true);
    try {
      // On a phone, ask for location permission first (the browser asks by itself).
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

  // Fallback when GPS is unavailable: drop the pin at the default spot for the user to move.
  pickOnMap(): void {
    this.latitude.set(environment.defaultMapCenter.latitude);
    this.longitude.set(environment.defaultMapCenter.longitude);
    this.accuracy.set(null);
  }

  // Called by the map when the pin is dragged or the map is tapped.
  onPinMoved(position: LatLng): void {
    this.latitude.set(position.latitude);
    this.longitude.set(position.longitude);
    this.accuracy.set(null); // now set by hand, so GPS accuracy no longer applies
  }

  // ---------- Submit ----------

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
      // The old photo is removed only if the user took it off and did not pick a new one.
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

  // Every message on this page also gets the matching vibration (Haptics notification type).
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
