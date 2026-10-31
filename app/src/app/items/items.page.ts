import { Component, computed, inject, signal } from '@angular/core';
import type { RefresherCustomEvent, SegmentCustomEvent, SelectCustomEvent } from '@ionic/angular';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonRefresher,
  IonRefresherContent,
  IonRippleEffect,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonSkeletonText,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  bagHandleOutline,
  calendarOutline,
  cardOutline,
  checkmarkCircle,
  checkmarkDoneOutline,
  chevronForward,
  close,
  cloudOfflineOutline,
  cubeOutline,
  fileTrayOutline,
  keyOutline,
  optionsOutline,
  phonePortraitOutline,
  pricetagOutline,
  searchOutline,
  shirtOutline,
} from 'ionicons/icons';

import {
  CATEGORY_ICONS,
  ITEM_CATEGORIES,
  type Item,
  type ItemFilters,
  type ItemStatus,
  type ItemType,
} from '../models/item.model';
import { ItemService } from '../services/item.service';
import { RelativeDatePipe } from '../shared/relative-date.pipe';

import { ItemDetailComponent } from './item-detail.component';

type TypeFilter = 'all' | ItemType;
type StatusFilter = 'all' | ItemStatus;
type DateFilter = 'any' | 'today' | 'week' | 'month';

const DATE_LABELS: Record<DateFilter, string> = {
  any: 'Any time',
  today: 'Today',
  week: 'Past 7 days',
  month: 'Past 30 days',
};
const STATUS_LABELS: Record<StatusFilter, string> = {
  all: 'Open and resolved',
  open: 'Open only',
  resolved: 'Resolved only',
};

// Browse tab: reports from GET /api/items.php, with keyword search, Lost / Found,
// and category, date and status filters. Every filter is applied by the server.
@Component({
  selector: 'app-items',
  templateUrl: 'items.page.html',
  styleUrls: ['items.page.scss'],
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonModal,
    IonRefresher,
    IonRefresherContent,
    IonRippleEffect,
    IonSearchbar,
    IonSegment,
    IonSegmentButton,
    IonSelect,
    IonSelectOption,
    IonSkeletonText,
    IonTitle,
    IonToolbar,
    RelativeDatePipe,
  ],
})
export class ItemsPage {
  private itemService = inject(ItemService);
  private modalCtrl = inject(ModalController);

  readonly categories = ITEM_CATEGORIES;
  readonly dateLabels = DATE_LABELS;
  readonly statusLabels = STATUS_LABELS;

  items = signal<Item[]>([]);
  loading = signal(true);
  errorMessage = signal('');
  filtersOpen = signal(false);

  // Search and filters.
  search = signal('');
  type = signal<TypeFilter>('all');
  category = signal('');
  date = signal<DateFilter>('any');
  status = signal<StatusFilter>('all');

  // How many of the sheet's filters are set, shown on the Filters button.
  activeFilterCount = computed(
    () => [this.category() !== '', this.date() !== 'any', this.status() !== 'all'].filter(Boolean).length,
  );
  isFiltered = computed(() => this.search().trim() !== '' || this.type() !== 'all' || this.activeFilterCount() > 0);

  emptyMessage = computed(() => {
    if (this.search().trim() !== '' || this.activeFilterCount() > 0) {
      return 'No reports match your search and filters.';
    }
    switch (this.type()) {
      case 'lost':
        return 'No lost items have been reported.';
      case 'found':
        return 'No found items have been reported.';
      default:
        return 'No reports yet. Use the Report tab to add one.';
    }
  });

  // Only the newest request may fill the list, so a slow older search can't overwrite it.
  private latestRequest = 0;

  constructor() {
    addIcons({
      bagHandleOutline,
      calendarOutline,
      cardOutline,
      checkmarkCircle,
      checkmarkDoneOutline,
      chevronForward,
      close,
      cloudOfflineOutline,
      cubeOutline,
      fileTrayOutline,
      keyOutline,
      optionsOutline,
      phonePortraitOutline,
      pricetagOutline,
      searchOutline,
      shirtOutline,
    });
  }

  // Ionic lifecycle hook: runs every time this tab is shown, so a report
  // submitted on the Report tab appears as soon as the user comes back.
  ionViewWillEnter(): void {
    this.loadItems();
  }

  loadItems(refresher?: RefresherCustomEvent): void {
    const request = ++this.latestRequest;
    this.errorMessage.set('');
    if (!refresher) {
      this.loading.set(true);
    }

    this.itemService.getItems(this.currentFilters()).subscribe({
      next: (result) => {
        if (request !== this.latestRequest) {
          return;
        }
        this.items.set(result.data ?? []);
        this.loading.set(false);
        refresher?.target.complete();
      },
      error: (err) => {
        if (request === this.latestRequest) {
          this.errorMessage.set(this.itemService.describeError(err));
          this.loading.set(false);
        }
        refresher?.target.complete();
      },
    });
  }

  // Pull-to-refresh.
  onRefresh(event: RefresherCustomEvent): void {
    this.loadItems(event);
  }

  // The search bar waits 400 ms after the last key press (its debounce) before this runs.
  onSearch(event: CustomEvent<{ value?: string | null }>): void {
    this.search.set((event.detail.value ?? '').slice(0, 100)); // the API accepts up to 100 characters
    this.loadItems();
  }

  // All / Lost / Found segment.
  onTypeChange(event: SegmentCustomEvent): void {
    this.type.set(event.detail.value as TypeFilter);
    this.loadItems();
  }

  onCategoryChange(event: SelectCustomEvent<string>): void {
    this.category.set(event.detail.value === 'all' ? '' : event.detail.value);
    this.loadItems();
  }

  onDateChange(event: SelectCustomEvent<DateFilter>): void {
    this.date.set(event.detail.value);
    this.loadItems();
  }

  onStatusChange(event: SelectCustomEvent<StatusFilter>): void {
    this.status.set(event.detail.value);
    this.loadItems();
  }

  clearCategory(): void {
    this.category.set('');
    this.loadItems();
  }

  clearDate(): void {
    this.date.set('any');
    this.loadItems();
  }

  clearStatus(): void {
    this.status.set('all');
    this.loadItems();
  }

  clearAll(): void {
    this.search.set('');
    this.type.set('all');
    this.category.set('');
    this.date.set('any');
    this.status.set('all');
    this.loadItems();
  }

  categoryIcon(category: string): string {
    return CATEGORY_ICONS[category] ?? 'cube-outline';
  }

  async openDetails(item: Item): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: ItemDetailComponent,
      componentProps: { item },
    });
    await modal.present();

    // The detail screen returns true when the reporter changed the status.
    const { data } = await modal.onWillDismiss<boolean>();
    if (data) {
      this.loadItems();
    }
  }

  private currentFilters(): ItemFilters {
    const type = this.type();
    const status = this.status();
    return {
      type: type === 'all' ? undefined : type,
      status: status === 'all' ? undefined : status,
      category: this.category() || undefined,
      q: this.search().trim() || undefined,
      from: this.dateFrom(this.date()),
    };
  }

  // Start of the date range in the phone's own time zone, sent as an ISO date-time.
  private dateFrom(range: DateFilter): string | undefined {
    if (range === 'any') {
      return undefined;
    }
    const start = new Date();
    start.setHours(0, 0, 0, 0); // local midnight today
    const daysBack = { today: 0, week: 6, month: 29 }[range];
    start.setDate(start.getDate() - daysBack);
    return start.toISOString();
  }
}
