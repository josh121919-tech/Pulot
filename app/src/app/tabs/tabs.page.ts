import { Component, EnvironmentInjector, inject } from '@angular/core';
import { IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { listOutline, addCircleOutline, checkmarkDoneOutline } from 'ionicons/icons';

import { FoundNoticeService } from '../services/found-notice.service';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel],
})
export class TabsPage {
  public environmentInjector = inject(EnvironmentInjector);

  constructor() {
    addIcons({ listOutline, addCircleOutline, checkmarkDoneOutline });
    // Watch for "someone found your item" notices for as long as the app is open.
    inject(FoundNoticeService).start();
  }
}
